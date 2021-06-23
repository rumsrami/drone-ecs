// App name
export const APP_NAME = "drone"
export const APP_ENV = "production"

// CloudWatch
export const LOG_GROUP = `${APP_NAME}-ecs-log-group`
export const SERVER_LOG_GROUP = `${APP_NAME}-ecs-server-log-group`

// ECS
export const ECS_CLUSTER = `${APP_NAME}-ecs-cluster`
export const CLUSTER_SECURITY_GROUP = `${ECS_CLUSTER}-sg`
export const CLUSTER_SECURITY_GROUP_EGRESS = `${CLUSTER_SECURITY_GROUP}-egress`
export const CLUSTER_SECURITY_GROUP_INGRESS_ALB = `${CLUSTER_SECURITY_GROUP}-ingress`
export const CLUSTER_SECURITY_GROUP_INGRESS_SELF = `${CLUSTER_SECURITY_GROUP}-ingress-self`
export const CLUSTER_SECURITY_GROUP_INGRESS_EC2 = `${CLUSTER_SECURITY_GROUP}-ingress-agent-ec2`

// ALB
export const ALB = `${APP_NAME}-alb`
export const ALB_SECURITY_GROUP = `${ALB}-sg`
export const ALB_SECURITY_GROUP_EGRESS = `${ALB_SECURITY_GROUP}-egress`
export const ALB_LISTENER = `${ALB}-listener`
export const DRONE_SERVER_TARGET_GROUP = `${ALB}-server-tg`
export const DRONE_AUTOSCALER_TARGET_GROUP = `${ALB}-autoscaler-tg`

// Listener Rules
export const DRONE_SERVER_LISTENER_RULE = `${ALB}-drone-server-lr`
export const DRONE_AUTOSCALER_LISTENER_RULE = `${ALB}-drone-autoscaler-lr`

// Services
export const DRONE_SERVER_SERVICE = `${ECS_CLUSTER}-drone-server`
export const DRONE_AUTOSCALER_SERVICE = `${ECS_CLUSTER}-drone-autoscaler`

// Network
export const VPC = `${APP_NAME}-vpc`
export const SUBNET = `${VPC}-sn`
export const RDS_SUBNET = `${SUBNET}-rds`
export const AUTOSCALER_SUBNET = `${SUBNET}-autoscaler`
export const EFS_SUBNET = `${SUBNET}-efs`
export const DRONE_NAMESPACE_DNS = `${APP_NAME}.internal`
export const DRONE_SERVER_DNS = `server`

// IAM
export const EC2_IAM_SERVICE_NAME = "ec2.amazonaws.com"
export const ECS_IAM_SERVICE_NAME = "ecs-tasks.amazonaws.com"
export const ECS_READ_SECRETS_ROLE_POLICY = `${ECS_CLUSTER}-read-secrets-role-policy`
export const ECS_DRONE_SERVER_ROLE_POLICY = `${ECS_CLUSTER}-drone-server-role-policy`
export const ECS_TASK_EXEC_ROLE_POLICY = `${ECS_CLUSTER}-task-exec-role-policy`
export const ECS_TASK_EXEC_ROLE = `${ECS_CLUSTER}-task-exec-role`
export const ECS_TASK_ROLE_POLICY = `${ECS_CLUSTER}-task-role-policy`
export const ECS_TASK_ROLE = `${ECS_CLUSTER}-task-role`

// RDS
export const RDS_CLUSTER = `${APP_NAME}-rds-cluster`
export const RDS_SUBNET_GROUP = `${APP_NAME}-subnet-group`
export const RDS_SECURITY_GROUP = `${RDS_CLUSTER}-security-group`
export const RDS_SECURITY_GROUP_ECS_INGRESS = `${RDS_SECURITY_GROUP}-ecs-ingress`

// Autoscaler
export const AUTOSCALER_SECURITY_GROUP = `${AUTOSCALER_SUBNET}-security-group`
export const AUTOSCALER_SECURITY_GROUP_ECS_INGRESS = `${AUTOSCALER_SUBNET}-ecs-ingress`
export const AUTOSCALER_SECURITY_GROUP_ECS_EGRESS = `${AUTOSCALER_SUBNET}-ecs-egress`

// EFS
export const EFS_SECURITY_GROUP = `${EFS_SUBNET}-security-group`
export const EFS_SECURITY_GROUP_ECS_INGRESS = `${EFS_SUBNET}-ecs-ingress`
export const EFS_SECURITY_GROUP_ECS_EGRESS = `${EFS_SUBNET}-ecs-egress`
export const EFS_DRONE = `${APP_NAME}-efs`
export const EFS_DRONE_MOUNTS = `${APP_NAME}-efs-mount`
export const EFS_DRONE_POLICY = `${APP_NAME}-efs-policy`
export const EFS_DRONE_SERVER_ACCESS_POINT = `${APP_NAME}-efs-server-accesspoint`
export const EFS_DRONE_AUTOSCALER_ACCESS_POINT = `${APP_NAME}-efs-autoscaler-accesspoint`
