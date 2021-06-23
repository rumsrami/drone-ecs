# Deploy Drone CI on AWS ECS using Pulumi

## Deployment description:
1. AWS VPC with public and private subnets.
2. ECS cluster with application load balancer.
3. AWS EFS to persist Drone Server and Autoscaler's sqlite DB
4. Security Groups and Ingress rules to allow access from:
  a. ALB -> ECS.
  b. ECS <-> EC2 instances running Drone agent.
  c. ECS -> EFS.
6. IAM roles and policies to allow ECS to access different resources.
7. Secrets passed into ECS using AWS Secret manager.
8. Drone Server and Autoscaler deployed in a 2 Fargate tasks
9. Drone autoscaler spins EC2 instances for Queued jobs
10. All resources run in private IPs and communicate within the VPC\
11. Logs are sent to a cloud watch log group

