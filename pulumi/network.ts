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
// Autoscaler subnets
const autoscalerPrivateSubnets: Map<string, string> = new Map([
    ["172.41.0.32/28", zoneA],
])

// EFS subnets
const efsPrivateSubnets: Map<string, string> = new Map([
    ["172.41.0.48/28", zoneA],
    ["172.41.0.64/28", zoneB],
    ["172.41.0.80/28", zoneC],
])

const rdsIsolatedSubnetTags: pulumi.Input<aws.Tags> = {
  "app": prefix.APP_NAME,
  "resource": "rds",
  "access": "private",
}

const autoscalerPrivateSubnetTags: pulumi.Input<aws.Tags> = {
  "app": prefix.APP_NAME,
  "resource": "autoscaler",
  "access": "private",
}

const efsPrivateSubnetTags: pulumi.Input<aws.Tags> = {
  "app": prefix.APP_NAME,
  "resource": "efs",
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

// Create and export private autoscaler EC2 subnets
// TODO: change route table names to reflect that this is for autoscaler
export const autoscalerEC2Subnets = getSubnetArgs(autoscalerPrivateSubnetTags, clusterVPC.id, autoscalerPrivateSubnets)
    // for every subnet arg create a subnet
    .map((args, index) => {
        // create eks isolated subnet
        const autoscalerEC2Subnet = new aws.ec2.Subnet(`${prefix.AUTOSCALER_SUBNET}-${index}`, args)
        // for every subnet get subnet id
        autoscalerEC2Subnet.id.apply(id => {
            // for every subnet id get the nat gateway id
            clusterVPC.natGateways.then(x => {
                // use subnet id and nat gateway id to create a route table
                const routeTable = new aws.ec2.RouteTable(`${prefix.ECS_CLUSTER}-route-table-${id}`, {
                    vpcId: clusterVPC.id,
                    routes: [
                        {
                            cidrBlock: "0.0.0.0/0",
                            natGatewayId: x[0].natGateway.id // replace with the new nat gateway id
                        }
                    ]
                })
                // create route table association for every route table
                new aws.ec2.RouteTableAssociation(`${prefix.ECS_CLUSTER}-route-table-association-${id}`, {
                    routeTableId: routeTable.id,
                    subnetId: id
                });
            })
        })
        return autoscalerEC2Subnet
    })

    // Create and export EFS private subnets
export const efsSubnets = getSubnetArgs(efsPrivateSubnetTags, clusterVPC.id, efsPrivateSubnets)
    // for every subnet arg create a subnet
    .map((args, index) => {
        // create eks isolated subnet
        const efsSubnet = new aws.ec2.Subnet(`${prefix.EFS_SUBNET}-${index}`, args)
        // for every subnet get subnet id
        efsSubnet.id.apply(id => {
            // for every subnet id get the nat gateway id
            clusterVPC.natGateways.then(x => {
                // use subnet id and nat gateway id to create a route table
                const routeTable = new aws.ec2.RouteTable(`${prefix.ECS_CLUSTER}-efs-route-table-${id}`, {
                    vpcId: clusterVPC.id,
                    routes: [
                        {
                            cidrBlock: "0.0.0.0/0",
                            natGatewayId: x[0].natGateway.id // replace with the new nat gateway id
                        }
                    ]
                })
                // create route table association for every route table
                new aws.ec2.RouteTableAssociation(`${prefix.ECS_CLUSTER}-efs-route-table-association-${id}`, {
                    routeTableId: routeTable.id,
                    subnetId: id
                });
            })
        })
        return efsSubnet
    })