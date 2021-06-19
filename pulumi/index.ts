import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import * as prefix from "./prefix";
import { rdsSubnets, clusterVPC } from './network';
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

const droneServerDNSNameSpace = new aws.servicediscovery.PrivateDnsNamespace(prefix.DRONE_DNS_NAMESPACE, {
  name: prefix.DRONE_DNS_NAMESPACE,
  vpc: clusterVPC.id,
})

const droneDNSService = new aws.servicediscovery.Service(prefix.DRONE_DNS_SERVICE, {
  name: prefix.DRONE_DNS_SERVICE,
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

ecsClusterSG.createEgressRule(prefix.CLUSTER_SECURITY_GROUP_EGRESS, {
  location: new awsx.ec2.AnyIPv4Location(),
  ports: new awsx.ec2.AllTraffic(),
  description: "allow outbound access to anywhere",
})

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

// *************************************************************
// ************************ SERVICES ***************************
// *************************************************************

ecsClusterSG.createIngressRule(prefix.CLUSTER_SECURITY_GROUP_INGRESS, {
  location: { sourceSecurityGroupId: alb.securityGroups[0].id },
  ports: new awsx.ec2.AllTcpPorts(),
  description: "allow alb access",
});

// Create the ECS Drone Server Service
const ecsDroneServerService = new awsx.ecs.FargateService(prefix.DRONE_SERVER_SERVICE, {
  cluster: ecsCluster,
  taskDefinitionArgs: {
    vpc: clusterVPC,
    taskRole: ecsDroneServerTaskExecutionRole,
    executionRole: ecsDroneServerTaskExecutionRole,
    cpu: "512",
    memory: "1024",
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
            // postgres://user:password@1.2.3.4:5432/postgres?sslmode=require
            "name": "DRONE_DATABASE_DATASOURCE", 
            "valueFrom": "<SECRETS_MANAGER_ARN>:DRONE_DATABASE_DATASOURCE::",
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
          {
            "name": "DRONE_DATABASE_DRIVER",
            "value": "postgres"
          }
        ],
        portMappings: [
          {
            "protocol": "tcp",
            "containerPort": 80
          }
        ],
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

// *************************************************************
// *********************** Databases ***************************
// *************************************************************

// rds subnet group name
const rdsSubnetGroup = new aws.rds.SubnetGroup(prefix.RDS_SUBNET_GROUP, {
  name: prefix.RDS_SUBNET_GROUP,
  subnetIds: rdsSubnets.map(x => x.id)
})

// security group to provide access to aurora from eks cluster
const accessToRDSSecurityGroup = new awsx.ec2.SecurityGroup(prefix.RDS_SECURITY_GROUP, { vpc: clusterVPC });

// ingress rule to allow access from k8s cluster node groups to RDS
accessToRDSSecurityGroup.createIngressRule(prefix.RDS_SECURITY_GROUP_ECS_INGRESS, {
  location: {
    sourceSecurityGroupId: ecsClusterSG.id,
  },
  ports: {
    fromPort: 5432,
    protocol: "tcp"
  }
})

// Actual DB is created manually to avoid accidental deletion
