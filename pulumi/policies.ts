import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

export const ecsReadSecretsPolicyStatement: aws.iam.PolicyDocument = {
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue",
        "kms:Decrypt"
      ],
      "Resource": [
        "*" // Add a specific secret resource ARN in production using * for demo purposes
      ]
    }
  ]
}

export const ecsDroneServerPolicyStatement: aws.iam.PolicyDocument = {
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ec2:Describe*",
        "elasticloadbalancing:DeregisterInstancesFromLoadBalancer",
        "elasticloadbalancing:DeregisterTargets",
        "elasticloadbalancing:Describe*",
        "elasticloadbalancing:RegisterInstancesWithLoadBalancer",
        "elasticloadbalancing:RegisterTargets"
      ],
      "Resource": "*"
    }
  ]
}
 