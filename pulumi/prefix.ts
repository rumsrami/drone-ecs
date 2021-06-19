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
export const CLUSTER_SECURITY_GROUP_INGRESS = `${CLUSTER_SECURITY_GROUP}-ingress`

// ALB
export const ALB = `${APP_NAME}-alb`
export const ALB_SECURITY_GROUP = `${ALB}-sg`
export const ALB_SECURITY_GROUP_EGRESS = `${ALB_SECURITY_GROUP}-egress`
export const ALB_LISTENER = `${ALB}-listener`
export const DRONE_SERVER_TARGET_GROUP = `${ALB}-server-tg`

// Listener Rules
export const DRONE_SERVER_LISTENER_RULE = `${ALB}-drone-server-lr`

// Services
export const DRONE_SERVER_SERVICE = `${ECS_CLUSTER}-drone-server`

// Network
export const VPC = `${APP_NAME}-vpc`
export const SUBNET = `${VPC}-sn`
export const RDS_SUBNET = `${SUBNET}-rds`
export const DRONE_DNS_NAMESPACE = `${APP_NAME}-service-discovery-namespace`
export const DRONE_DNS_SERVICE = `${APP_NAME}-service-discovery-service`

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
