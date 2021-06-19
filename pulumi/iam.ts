import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { ecsReadSecretsPolicyStatement, ecsDroneServerPolicyStatement } from "./policies";
import * as prefix from "./prefix";

const ecsReadSecretsRolePolicy = new aws.iam.Policy(prefix.ECS_READ_SECRETS_ROLE_POLICY, {
  name: prefix.ECS_READ_SECRETS_ROLE_POLICY,
  policy: ecsReadSecretsPolicyStatement,
})

const ecsDroneServerRolePolicy = new aws.iam.Policy(prefix.ECS_DRONE_SERVER_ROLE_POLICY, {
  name: prefix.ECS_DRONE_SERVER_ROLE_POLICY,
  policy: ecsDroneServerPolicyStatement,
})

const ecsTaskExecutionRolePolicyArns: (string | pulumi.Output<string>)[] = [
  "arn:aws:iam::aws:policy/service-role/AmazonEC2ContainerServiceRole",
  "arn:aws:iam::aws:policy/service-role/AmazonEC2ContainerServiceforEC2Role",
  "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy",
  "arn:aws:iam::aws:policy/service-role/AmazonEC2ContainerServiceAutoscaleRole",
  "arn:aws:iam::aws:policy/AmazonRDSDataFullAccess",
  "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly",
  ecsReadSecretsRolePolicy.arn,
  ecsDroneServerRolePolicy.arn,
];

// Creates a role and attaches it to a policy
const createRole = (
  roleName: string,
  serviceName: string,
  policyName: string,
  managedPolicyArns: (string | pulumi.Output<string>)[]
): aws.iam.Role => {
  const role = new aws.iam.Role(roleName, {
    assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({
      Service: serviceName,
    }),
  });

  let counter = 0;
  for (const policy of managedPolicyArns) {
    // Create RolePolicyAttachment without returning it.
    const rpa = new aws.iam.RolePolicyAttachment(`${policyName}-${counter++}`,
      { policyArn: policy, role: role },
    );
  }

  return role;
}

export const ecsDroneServerTaskExecutionRole = createRole(
  prefix.ECS_TASK_EXEC_ROLE,
  prefix.ECS_IAM_SERVICE_NAME,
  prefix.ECS_TASK_EXEC_ROLE_POLICY,
  ecsTaskExecutionRolePolicyArns
)
