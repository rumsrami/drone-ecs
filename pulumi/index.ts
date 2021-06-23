import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import * as prefix from "./prefix";
import { efsSubnets, clusterVPC, autoscalerEC2Subnets } from './network';
import { ecsDroneServerTaskExecutionRole } from './iam';

const region = "eu-central-1"

// *************************************************************
// ********************** Cloud Watch **************************
// *************************************************************
const droneLogGroup = new aws.cloudwatch.LogGroup(prefix.LOG_GROUP, {
  name: prefix.LOG_GROUP,
  retentionInDays: 3,
  tags: {
    Application: prefix.APP_NAME,
    Environment: prefix.APP_ENV,
  },
});

// *************************************************************
// ******************* Service discovery ***********************
// *************************************************************

const droneServerDNSNameSpace = new aws.servicediscovery.PrivateDnsNamespace(prefix.DRONE_NAMESPACE_DNS, {
  name: prefix.DRONE_NAMESPACE_DNS,
  vpc: clusterVPC.id,
})

const droneDNSService = new aws.servicediscovery.Service(prefix.DRONE_SERVER_DNS, {
  name: prefix.DRONE_SERVER_DNS,
  dnsConfig: {
    namespaceId: droneServerDNSNameSpace.id,
    dnsRecords: [{
      ttl: 10,
      type: "A",
    }],
    routingPolicy: "MULTIVALUE",
  },
  healthCheckCustomConfig: {
    failureThreshold: 10,
  },
})

// *************************************************************
// ******************* Cluster definition **********************
// *************************************************************

const ecsClusterSG = new awsx.ec2.SecurityGroup(
  prefix.CLUSTER_SECURITY_GROUP,
  { vpc: clusterVPC },
  { dependsOn: [clusterVPC] }
)

// Egress to allow the cluster to make requests to the internet
ecsClusterSG.createEgressRule(prefix.CLUSTER_SECURITY_GROUP_EGRESS, {
  location: new awsx.ec2.AnyIPv4Location(),
  ports: new awsx.ec2.AllTraffic(),
  description: "allow outbound access to anywhere",
})

// Ingress to allow the autoscaler service to talk to the drone server service using private ip
ecsClusterSG.createIngressRule(prefix.CLUSTER_SECURITY_GROUP_INGRESS_SELF, {
  location: { sourceSecurityGroupId: ecsClusterSG.id },
  // TODO: change to allow only access on port 80
  // As in this form all services can talk to all servicess on any port
  ports: new awsx.ec2.AllTcpPorts(),
  description: "allow self access",
});

const ecsCluster = new awsx.ecs.Cluster(prefix.ECS_CLUSTER, {
  securityGroups: [ecsClusterSG],
  vpc: clusterVPC,
  settings: [
    {
      name: "containerInsights",
      value: "enabled"
    }
  ]
}, { dependsOn: [clusterVPC] })

// *************************************************************
// ************** Autoscaler EC2 Security Group ****************
// *************************************************************
// Security Groups attached by Autoscaler to provisioned EC2 instances
// EC2 instances are fully managed by the autoscaler
// They give the instancess access to the internet
// Limit the inbound access from ECS cluster on private IP
// These rules are attached to the EC2 subnet by the autoscaler
const autoscalerEC2SubnetSecurityGroup = new awsx.ec2.SecurityGroup(prefix.AUTOSCALER_SECURITY_GROUP, { vpc: clusterVPC });

// ingress rule to allow access from ecs cluster to autoscaler subnets
autoscalerEC2SubnetSecurityGroup.createIngressRule(prefix.AUTOSCALER_SECURITY_GROUP_ECS_INGRESS, {
  location: {
    sourceSecurityGroupId: ecsClusterSG.id,
  },
  ports: new awsx.ec2.AllTraffic(),
  description: "allow inbound access from ECS Cluster",
})

autoscalerEC2SubnetSecurityGroup.createEgressRule(prefix.AUTOSCALER_SECURITY_GROUP_ECS_EGRESS, {
  location: new awsx.ec2.AnyIPv4Location(),
  ports: new awsx.ec2.AllTraffic(),
  description: "allow outbound access to anywhere",
})

// Ingress to allow the autoscaler service to talk to the drone server service using private ip
ecsClusterSG.createIngressRule(prefix.CLUSTER_SECURITY_GROUP_INGRESS_EC2, {
  location: { sourceSecurityGroupId: autoscalerEC2SubnetSecurityGroup.id },
  // TODO: change to allow only access on port 80
  // As in this form agents can talk to all servicess on any port
  ports: new awsx.ec2.AllTcpPorts(),
  description: "allow access from drone agent on ec2",
});

// *************************************************************
// *************************** EFS *****************************
// *************************************************************
const efsSecurityGroup = new awsx.ec2.SecurityGroup(prefix.EFS_SECURITY_GROUP, { vpc: clusterVPC });

// ingress rule to allow access from ecs cluster to efs subnets
efsSecurityGroup.createIngressRule(prefix.EFS_SECURITY_GROUP_ECS_INGRESS, {
  location: {
    sourceSecurityGroupId: ecsClusterSG.id,
  },
  ports: new awsx.ec2.AllTraffic(),
  description: "allow inbound access from ECS Cluster",
})

efsSecurityGroup.createEgressRule(prefix.EFS_SECURITY_GROUP_ECS_EGRESS, {
  location: new awsx.ec2.AnyIPv4Location(),
  ports: new awsx.ec2.AllTraffic(),
  description: "allow outbound access to anywhere",
})

const droneEFS = new aws.efs.FileSystem(prefix.EFS_DRONE, {
  encrypted: true,
  lifecyclePolicy: {
    transitionToIa: "AFTER_30_DAYS"
  }
})

const droneEFSMountPoint = efsSubnets.map((args, index) => {
  const mountTarget = new aws.efs.MountTarget(`${prefix.EFS_DRONE_MOUNTS}-${index}-${args.availabilityZone}`, {
    fileSystemId: droneEFS.id,
    subnetId: args.id,
    securityGroups: [efsSecurityGroup.id],
  })
})

const efsPolicy = {
  "Version": "2012-10-17",
  "Id": "efs-policy-wizard-drone-ecs",
  "Statement": [
    {
      "Sid": "efs-statement-drone-ecs-task-role-allow",
      "Effect": "Allow",
      "Principal": {
        "AWS": "*"
      },
      "Action": [
        "elasticfilesystem:ClientWrite"
      ],
      "Condition": {
        "Bool": {
          "elasticfilesystem:AccessedViaMountTarget": "true"
        }
      }
    },
    {
      "Sid": "efs-statement-efs-statement-drone-ecs-task-role-deny",
      "Effect": "Deny",
      "Principal": {
        "AWS": "*"
      },
      "Action": "*",
      "Condition": {
        "Bool": {
          "aws:SecureTransport": "false"
        }
      }
    }
  ]
}

const droneEFSMountPolicy = new aws.efs.FileSystemPolicy(prefix.EFS_DRONE_POLICY, {
  fileSystemId: droneEFS.id,
  policy: JSON.stringify(efsPolicy)
})

const droneServerEFSAccessPoint = new aws.efs.AccessPoint(prefix.EFS_DRONE_SERVER_ACCESS_POINT, {
  fileSystemId: droneEFS.id,
  posixUser: {
    gid: 10000,
    uid: 10000
  },
  rootDirectory: {
    path: "/ecs/server",
    creationInfo: {
      ownerGid: 10000,
      ownerUid: 10000,
      permissions: "755"
    }
  }
})

const droneAutoscalerEFSAccessPoint = new aws.efs.AccessPoint(prefix.EFS_DRONE_AUTOSCALER_ACCESS_POINT, {
  fileSystemId: droneEFS.id,
  posixUser: {
    gid: 10000,
    uid: 10001
  },
  rootDirectory: {
    path: "/ecs/autoscaler",
    creationInfo: {
      ownerGid: 10000,
      ownerUid: 10001,
      permissions: "755"
    }
  }
})

// *************************************************************
// *************************** ALB *****************************
// *************************************************************

const albSecurityGroup = new awsx.ec2.SecurityGroup(
  prefix.ALB_SECURITY_GROUP,
  { vpc: clusterVPC },
  { dependsOn: [clusterVPC] }
);

albSecurityGroup.createEgressRule(prefix.ALB_SECURITY_GROUP_EGRESS, {
  location: new awsx.ec2.AnyIPv4Location(),
  ports: new awsx.ec2.AllTraffic(),
  description: "allow outbound access to anywhere",
});

const alb = new awsx.lb.ApplicationLoadBalancer(prefix.ALB, {
  vpc: clusterVPC,
  securityGroups: [albSecurityGroup.id],
  idleTimeout: 4000
});

// *************************************************************
// ************************ LISTENERS **************************
// *************************************************************
// create alb https listener
const albListener = alb.createListener(prefix.ALB_LISTENER, {
  protocol: "HTTPS",
  sslPolicy: "ELBSecurityPolicy-TLS-1-2-2017-01",
  certificateArn: "<PRE_CREARED_TLS_CERTIFICATE>",
  port: 443,
  defaultActions: [{
    type: "fixed-response",
    fixedResponse: {
      contentType: "text/plain",
      messageBody: "not found",
      statusCode: "404",
    },
  }]
})

// *************************************************************
// ********************** TARGET GROUPS ************************
// *************************************************************
// 1 - Server endpoint
const albDroneServerTargetGroup = alb.createTargetGroup(prefix.DRONE_SERVER_TARGET_GROUP, {
  vpc: clusterVPC,
  targetType: "ip",
  port: 80,
  protocol: "HTTP",
  healthCheck: {
    path: "/healthz",
    timeout: 20,
    healthyThreshold: 3,
    unhealthyThreshold: 10,
    protocol: "HTTP",
  },
})

// 2 - Autoscaler endpoint
const albDroneAutoscalerTargetGroup = alb.createTargetGroup(prefix.DRONE_AUTOSCALER_TARGET_GROUP, {
  vpc: clusterVPC,
  targetType: "ip",
  port: 8080,
  protocol: "HTTP",
  healthCheck: {
    path: "/healthz",
    timeout: 20,
    healthyThreshold: 3,
    unhealthyThreshold: 10,
    protocol: "HTTP",
  },
})
// *************************************************************
// ********************** LISTENER RULES ***********************
// *************************************************************
// 1 - Drone Server Listener Rule
const albDroneServerListenerRule = new aws.lb.ListenerRule(prefix.DRONE_SERVER_LISTENER_RULE, {
  listenerArn: albListener.listener.arn,
  priority: 1,
  actions: [{
    type: "forward",
    targetGroupArn: albDroneServerTargetGroup.targetGroup.arn
  }],
  conditions: [{
    hostHeader: {
      values: ["drone.ctgo.dev"]
    }
  }]
})

// 1 - Drone Autoscaler Listener Rule
const albDroneAutoscalerListenerRule = new aws.lb.ListenerRule(prefix.DRONE_AUTOSCALER_LISTENER_RULE, {
  listenerArn: albListener.listener.arn,
  priority: 2,
  actions: [{
    type: "forward",
    targetGroupArn: albDroneAutoscalerTargetGroup.targetGroup.arn
  }],
  conditions: [{
    hostHeader: {
      values: ["autoscaler.ctgo.dev"]
    }
  }]
})

// *************************************************************
// ************************ SERVICES ***************************
// *************************************************************

ecsClusterSG.createIngressRule(prefix.CLUSTER_SECURITY_GROUP_INGRESS_ALB, {
  location: { sourceSecurityGroupId: alb.securityGroups[0].id },
  ports: new awsx.ec2.AllTcpPorts(),
  description: "allow alb access",
});

// Create the ECS Drone Server Service
const ecsDroneServerService = new awsx.ecs.FargateService(prefix.DRONE_SERVER_SERVICE, {
  cluster: ecsCluster,
  serviceRegistries: {
    registryArn: droneDNSService.arn
  },
  taskDefinitionArgs: {
    vpc: clusterVPC,
    taskRole: ecsDroneServerTaskExecutionRole,
    executionRole: ecsDroneServerTaskExecutionRole,
    cpu: "512",
    memory: "1024",
    volumes: [{
      name: "server_sqlite",
      efsVolumeConfiguration: {
        authorizationConfig: {
          accessPointId: droneServerEFSAccessPoint.id,
          iam: "ENABLED"
        },
        fileSystemId: droneEFS.id,
        transitEncryption: "ENABLED"
      }
    }],
    containers: {
      drone: {
        image: "<ECR image URL>",
        privileged: false,
        memory: 512,
        cpu: 128,
        secrets: [
          {
            "name": "DRONE_GITHUB_CLIENT_ID",
            "valueFrom": "<SECRETS_MANAGER_ARN>:DRONE_GITHUB_CLIENT_ID::",
          },
          {
            "name": "DRONE_GITHUB_CLIENT_SECRET",
            "valueFrom": "<SECRETS_MANAGER_ARN>:DRONE_GITHUB_CLIENT_SECRET::",
          },
          {
            // openssl rand -hex 16
            "name": "DRONE_RPC_SECRET",
            "valueFrom": "<SECRETS_MANAGER_ARN>:DRONE_RPC_SECRET::",
          },
          {
            // username:<GITHUB_USERNAME>,machine:false,admin:true,token:<openssl rand -hex 16>
            "name": "DRONE_USER_CREATE",
            "valueFrom": "<SECRETS_MANAGER_ARN>:DRONE_USER_CREATE::"
          }
        ],
        environment: [
          {
            "name": "DRONE_SERVER_PROTO",
            "value": "https"
          },
          {
            "name": "DRONE_SERVER_HOST",
            "value": "<subdomain.mycompany.com>"
          },
        ],
        portMappings: [
          {
            "protocol": "tcp",
            "containerPort": 80
          }
        ],
        mountPoints: [{
          sourceVolume: "server_sqlite",
          containerPath: "/data"
        }],
        logConfiguration: {
          logDriver: "awslogs",
          options: {
            "awslogs-stream-prefix": prefix.SERVER_LOG_GROUP,
            "awslogs-group": prefix.LOG_GROUP,
            "awslogs-region": region
          }
        }
      }
    }
  },
  desiredCount: 1,
  assignPublicIp: false,
  healthCheckGracePeriodSeconds: 30,
  loadBalancers: [{
    targetGroupArn: albDroneServerTargetGroup.targetGroup.arn,
    containerName: "drone",
    containerPort: 80
  }],
  deploymentMaximumPercent: 200,
  deploymentMinimumHealthyPercent: 100
}, { dependsOn: [albDroneServerTargetGroup] })

// Create the ECS Drone Autoscaler Service
const ecsDroneAutoscalerService = new awsx.ecs.FargateService(prefix.DRONE_AUTOSCALER_SERVICE, {
  cluster: ecsCluster,
  taskDefinitionArgs: {
    vpc: clusterVPC,
    taskRole: ecsDroneServerTaskExecutionRole,
    executionRole: ecsDroneServerTaskExecutionRole,
    cpu: "512",
    memory: "1024",
    volumes: [{
      name: "autoscaler_sqlite",
      efsVolumeConfiguration: {
        authorizationConfig: {
          accessPointId: droneAutoscalerEFSAccessPoint.id,
          iam: "ENABLED"
        },
        fileSystemId: droneEFS.id,
        transitEncryption: "ENABLED"
      }
    }],
    containers: {
      autoscaler: {
        image: "<ECR image URL>",
        privileged: false,
        memory: 512,
        cpu: 128,
        secrets: [
          {
            "name": "DRONE_SERVER_TOKEN",
            "valueFrom": "<SECRETS_MANAGER_ARN>:DRONE_SERVER_TOKEN::",
          },
          {
            "name": "DRONE_AGENT_TOKEN",
            "valueFrom": "<SECRETS_MANAGER_ARN>:DRONE_RPC_SECRET::",
          },
          {
            "name": "AWS_ACCESS_KEY_ID",
            "valueFrom": "<SECRETS_MANAGER_ARN>:AWS_ACCESS_KEY_ID::",
          },
          {
            "name": "AWS_SECRET_ACCESS_KEY",
            "valueFrom": "<SECRETS_MANAGER_ARN>:AWS_SECRET_ACCESS_KEY::",
          },
        ],
        environment: [
          {
            "name": "DRONE_POOL_MIN",
            "value": "1"
          },
          {
            "name": "DRONE_POOL_MAX",
            "value": "4"
          },
          {
            "name": "DRONE_SERVER_PROTO",
            "value": "http"
          },
          {
            "name": "DRONE_SERVER_HOST",
            "value": `${prefix.DRONE_SERVER_DNS}.${prefix.DRONE_NAMESPACE_DNS}`
          },
          {
            "name": "DRONE_AMAZON_INSTANCE",
            "value": "t2.medium"
          },
          {
            "name": "DRONE_AMAZON_REGION",
            "value": "eu-central-1"
          },
          {
            "name": "DRONE_AMAZON_SUBNET_ID",
            "value": autoscalerEC2Subnets[0].id
          },
          {
            "name": "DRONE_AMAZON_SECURITY_GROUP",
            "value": autoscalerEC2SubnetSecurityGroup.id
          },
          {
            "name": "DRONE_AMAZON_PRIVATE_IP",
            "value": "true"
          },
          {
            "name": "DRONE_ENABLE_REAPER",
            "value": "true"
          },
          {
            "name": "DRONE_GC_ENABLED",
            "value": "true"
          },
          {
            "name": "DRONE_ENABLE_PINGER",
            "value": "true"
          },
        ],
        portMappings: [
          {
            "protocol": "tcp",
            "containerPort": 8080
          }
        ],
        mountPoints: [{
          sourceVolume: "autoscaler_sqlite",
          containerPath: "/data"
        }],
        logConfiguration: {
          logDriver: "awslogs",
          options: {
            "awslogs-stream-prefix": prefix.SERVER_LOG_GROUP,
            "awslogs-group": prefix.LOG_GROUP,
            "awslogs-region": region
          }
        }
      }
    }
  },
  desiredCount: 1,
  assignPublicIp: false,
  healthCheckGracePeriodSeconds: 30,
  loadBalancers: [{
    targetGroupArn: albDroneAutoscalerTargetGroup.targetGroup.arn,
    containerName: "autoscaler",
    containerPort: 8080
  }],
  deploymentMaximumPercent: 200,
  deploymentMinimumHealthyPercent: 100
}, { dependsOn: [albDroneAutoscalerTargetGroup] })
