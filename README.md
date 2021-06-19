# Deploy Drone CI on AWS ECS using Pulumi

## Deployment description:
1. AWS VPC with public and private subnets.
2. ECS cluster with application load balancer.
3. DB is deployed in an isolated Subnet.
4. Security Groups and Ingress rules to allow access from ALB -> ECS.
5. Security Groups and Ingress rules to allow access from ECS -> DB.
6. IAM roles and policies to allow ECS to access different resources.
7. Secrets passed into ECS using AWS Secret manager.
8. Drone Server deployed in a Fargate task (done)
9. Drone autoscaler that spins EC2 instances for Queued jobs (in progress)

