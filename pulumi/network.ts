import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import * as prefix from "./prefix";
import {CidrBlock} from "@pulumi/awsx/ec2";

// VPC settings
// might want to check availability of the zone
// before creating the network
const vpcCidr: pulumi.Input<CidrBlock> = "172.41.0.0/22"
const zoneA: string = "eu-central-1a"
const zoneB: string = "eu-central-1b"
const zoneC: string = "eu-central-1c"
// nat gateways are what gives private subnets access to the internet
// they are expensive to only one is created
const natGatewayNum = 1

// RDS subnets
const rdsIsolatedSubnets: Map<string, string> = new Map([
    ["172.41.0.0/28", zoneA],
    ["172.41.0.16/28", zoneB],
])

const rdsIsolatedSubnetTags: pulumi.Input<aws.Tags> = {
  "app": prefix.APP_NAME,
  "resource": "rds",
  "access": "private",
}

// ECS Subnets
const ecsPublicSubnets: Map<string, string> = new Map([
    ["172.41.1.0/27", zoneA],
    ["172.41.1.32/27", zoneB],
    ["172.41.1.64/27", zoneC],
])
const ecsPrivateSubnets: Map<string, string> = new Map([
    ["172.41.1.96/27", zoneA],
    ["172.41.1.128/27", zoneB],
    ["172.41.1.160/27", zoneC],
])

// ECS Subnet Tags
const ecsPrivateSubnetTags: pulumi.Input<aws.Tags> = {
    "app": prefix.APP_NAME,
    "resource": "ecs",
    "access": "private",
}
const ecsPublicSubnetTags: pulumi.Input<aws.Tags> = {
    "app": prefix.APP_NAME,
    "resource": "ecs",
    "access": "public",
}

// create public/private subnet from CIDR block
// added to VPC on creation
const getVPNSubnetArgs = (
    tags: pulumi.Input<aws.Tags>,
    type: awsx.ec2.VpcSubnetType,
    record: Map<string, string>,
) => {
    return Array.from(record.keys()).map((cidr) => {
        const subnetArg: awsx.ec2.VpcSubnetArgs = {
            location: {
                cidrBlock: cidr,
                availabilityZone: record.get(cidr),
            },
            tags: tags,
            type: type,
            name: `${prefix.SUBNET}-${type}-${cidr}`,
        }
        return subnetArg
    })
}

// create isolated subnet from CIDR block
// added after the VPC is created
const getSubnetArgs = (
    tags: pulumi.Input<aws.Tags>,
    vpcID: pulumi.Input<string>,
    record: Map<string, string>
) => {
    return Array.from(record.keys()).map((cidr) => {
        const subnetArg: aws.ec2.SubnetArgs = {
            vpcId: vpcID,
            cidrBlock: cidr,
            availabilityZone: record.get(cidr),
            tags: {"name": `${prefix.SUBNET}-${cidr}`, ...tags}
        }
        return subnetArg
    })
}

// Create public and private subnets for ecs cluster
// Add more subnets to the VPC when needed
const ecsVPCPublicSubnets = getVPNSubnetArgs(ecsPublicSubnetTags, "public", ecsPublicSubnets)
const ecsVPCPrivateSubnets = getVPNSubnetArgs(ecsPrivateSubnetTags, "private", ecsPrivateSubnets)
const vpcSubnets = ecsVPCPublicSubnets.concat(ecsVPCPrivateSubnets)

// Create and export main VPC
export const clusterVPC = new awsx.ec2.Vpc(prefix.VPC, {
    cidrBlock: vpcCidr,
    numberOfNatGateways: natGatewayNum,
    subnets: vpcSubnets
})

// Create and export isolated subnets for rds
export const rdsSubnets = getSubnetArgs(rdsIsolatedSubnetTags, clusterVPC.id, rdsIsolatedSubnets)
    .map((args, index) => new aws.ec2.Subnet(`${prefix.RDS_SUBNET}-${index}`, args))

