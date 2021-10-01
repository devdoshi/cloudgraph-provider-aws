import { ServiceConnection } from '@cloudgraph/sdk'
import { MetricAlarm } from 'aws-sdk/clients/cloudwatch'
import { NatGateway, Vpc } from 'aws-sdk/clients/ec2'
import { isEmpty } from 'lodash'
import regions, { globalRegionName } from '../../enums/regions'
import services from '../../enums/services'
import { RawAwsAppSync } from '../appSync/data'
import { RawAwsCloudFormationStack } from '../cloudFormationStack/data'
import { RawAwsCloudFormationStackSet } from '../cloudFormationStackSet/data'
import { RawAwsCloudfront } from '../cloudfront/data'
import { RawAwsCognitoIdentityPool } from '../cognitoIdentityPool/data'
import { RawAwsCognitoUserPool } from '../cognitoUserPool/data'
import { RawAwsKinesisFirehose } from '../kinesisFirehose/data'
import { RawAwsNetworkAcl } from '../nacl/data'

const findServiceInstancesWithTag = (tag, service) => {
  const { id } = tag
  return service.filter(({ Tags }) => {
    for (const [key, value] of Object.entries(Tags)) {
      if (id === `${key}:${value}`) {
        return true
      }
    }
    return false
  })
}

export default ({
  service: tag,
  data,
}: {
  service: any
  data: Array<{ name: string; data: { [property: string]: any[] } }>
}): {
  [property: string]: ServiceConnection[]
} => {
  // console.log(`Searching for connections for tag ${JSON.stringify(tag)}`)
  const connections: ServiceConnection[] = []
  for (const region of regions) {
    /**
     * Find related ALBs
     */
    const albs: { name: string; data: { [property: string]: any[] } } =
      data.find(({ name }) => name === services.alb)
    if (albs?.data?.[region]) {
      const dataAtRegion: any = findServiceInstancesWithTag(
        tag,
        albs.data[region]
      )
      if (!isEmpty(dataAtRegion)) {
        for (const alb of dataAtRegion) {
          const { LoadBalancerName: id } = alb
          connections.push({
            id,
            resourceType: services.alb,
            relation: 'child',
            field: 'alb',
          })
        }
      }
    }

    /**
     * Find related ASG
     */
    const asgQueues: {
      name: string
      data: { [property: string]: any[] }
    } = data.find(({ name }) => name === services.asg)
    if (asgQueues?.data?.[region]) {
      const dataAtRegion = findServiceInstancesWithTag(
        tag,
        asgQueues.data[region]
      )
      if (!isEmpty(dataAtRegion)) {
        for (const asg of dataAtRegion) {
          const { AutoScalingGroupARN: id } = asg
          connections.push({
            id,
            resourceType: services.asg,
            relation: 'child',
            field: 'asg',
          })
        }
      }
    }

    /**
     * Find related Cloudwatch
     */
    const cws: { name: string; data: { [property: string]: any[] } } =
      data.find(({ name }) => name === services.cloudwatch)
    if (cws?.data?.[region]) {
      const dataAtRegion: any = findServiceInstancesWithTag(
        tag,
        cws.data[region]
      )
      if (!isEmpty(dataAtRegion)) {
        for (const cw of dataAtRegion) {
          const { AlarmArn: id }: MetricAlarm = cw
          connections.push({
            id,
            resourceType: services.cloudwatch,
            relation: 'child',
            field: 'cloudwatch',
          })
        }
      }
    }

    /**
     * Find related CognitoIdentityPools
     */
    const pools: { name: string; data: { [property: string]: any[] } } =
      data.find(({ name }) => name === services.cognitoIdentityPool)
    if (pools?.data?.[region]) {
      const dataAtRegion: any = findServiceInstancesWithTag(
        tag,
        pools.data[region]
      )
      if (!isEmpty(dataAtRegion)) {
        for (const pool of dataAtRegion) {
          const { IdentityPoolId: id }: RawAwsCognitoIdentityPool = pool
          connections.push({
            id,
            resourceType: services.cognitoIdentityPool,
            relation: 'child',
            field: 'cognitoIdentityPool',
          })
        }
      }
    }

    /**
     * Find related CognitoUserPools
     */
    const userPools: { name: string; data: { [property: string]: any[] } } =
      data.find(({ name }) => name === services.cognitoUserPool)
    if (userPools?.data?.[region]) {
      const dataAtRegion: RawAwsCognitoUserPool[] = findServiceInstancesWithTag(
        tag,
        userPools.data[region]
      )
      if (!isEmpty(dataAtRegion)) {
        for (const pool of dataAtRegion) {
          const { Id: id } = pool
          connections.push({
            id,
            resourceType: services.cognitoUserPool,
            relation: 'child',
            field: 'cognitoUserPool',
          })
        }
      }
    }

    /**
     * Find related KMS keys
     */
    const kmsKeys: { name: string; data: { [property: string]: any[] } } =
      data.find(({ name }) => name === services.kms)
    if (kmsKeys?.data?.[region]) {
      const dataAtRegion: any = findServiceInstancesWithTag(
        tag,
        kmsKeys.data[region]
      )
      if (!isEmpty(dataAtRegion)) {
        for (const key of dataAtRegion) {
          const { KeyId: id } = key
          connections.push({
            id,
            resourceType: services.kms,
            relation: 'child',
            field: 'kms',
          })
        }
      }
    }

    /**
     * Find related ec2 instances
     */
    const ec2s: { name: string; data: { [property: string]: any[] } } =
      data.find(({ name }) => name === services.ec2Instance)
    if (ec2s?.data?.[region]) {
      const dataAtRegion = findServiceInstancesWithTag(tag, ec2s.data[region])
      if (!isEmpty(dataAtRegion)) {
        for (const instance of dataAtRegion) {
          const { InstanceId: id } = instance

          connections.push({
            id,
            resourceType: services.ec2Instance,
            relation: 'child',
            field: 'ec2Instance',
          })
        }
      }
    }

    /**
     * Find related lambdas
     */
    const lambdas: { name: string; data: { [property: string]: any[] } } =
      data.find(({ name }) => name === services.lambda)
    if (lambdas?.data?.[region]) {
      const dataAtRegion = findServiceInstancesWithTag(
        tag,
        lambdas.data[region]
      )
      if (!isEmpty(dataAtRegion)) {
        for (const instance of dataAtRegion) {
          const { FunctionArn: id } = instance

          connections.push({
            id,
            resourceType: services.lambda,
            relation: 'child',
            field: 'lambda',
          })
        }
      }
    }

    /**
     * Find related SecurityGroups
     */
    const securityGroups: {
      name: string
      data: { [property: string]: any[] }
    } = data.find(({ name }) => name === services.sg)
    if (securityGroups?.data?.[region]) {
      const dataAtRegion = findServiceInstancesWithTag(
        tag,
        securityGroups.data[region]
      )
      if (!isEmpty(dataAtRegion)) {
        for (const instance of dataAtRegion) {
          const { GroupId: id } = instance

          connections.push({
            id,
            resourceType: services.sg,
            relation: 'child',
            field: 'securityGroups',
          })
        }
      }
    }

    /**
     * Find related SQS
     */
    const sqsQueues: {
      name: string
      data: { [property: string]: any[] }
    } = data.find(({ name }) => name === services.sqs)
    if (sqsQueues?.data?.[region]) {
      const dataAtRegion = findServiceInstancesWithTag(
        tag,
        sqsQueues.data[region]
      )
      if (!isEmpty(dataAtRegion)) {
        for (const instance of dataAtRegion) {
          const {
            sqsAttributes: { QueueArn: id },
          } = instance

          connections.push({
            id,
            resourceType: services.sqs,
            relation: 'child',
            field: 'sqs',
          })
        }
      }
    }

    /**
     * Find related EIP
     */
    const eips: { name: string; data: { [property: string]: any[] } } =
      data.find(({ name }) => name === services.eip)
    if (eips?.data?.[region]) {
      const dataAtRegion = findServiceInstancesWithTag(tag, eips.data[region])
      if (!isEmpty(dataAtRegion)) {
        for (const instance of dataAtRegion) {
          const { AllocationId: id } = instance

          connections.push({
            id,
            resourceType: services.eip,
            relation: 'child',
            field: 'eip',
          })
        }
      }
    }

    /**
     * Find related EBS
     */
    const ebs: { name: string; data: { [property: string]: any[] } } =
      data.find(({ name }) => name === services.ebs)
    if (ebs?.data?.[region]) {
      const dataAtRegion = findServiceInstancesWithTag(tag, ebs.data[region])
      if (!isEmpty(dataAtRegion)) {
        for (const instance of dataAtRegion) {
          const { VolumeId: id } = instance

          connections.push({
            id,
            resourceType: services.ebs,
            relation: 'child',
            field: 'ebs',
          })
        }
      }
    }

    /**
     * Find related IGW
     */
    const igws: { name: string; data: { [property: string]: any[] } } =
      data.find(({ name }) => name === services.igw)
    if (igws?.data?.[region]) {
      const dataAtRegion = findServiceInstancesWithTag(tag, igws.data[region])
      if (!isEmpty(dataAtRegion)) {
        for (const instance of dataAtRegion) {
          const { InternetGatewayId: id } = instance

          connections.push({
            id,
            resourceType: services.igw,
            relation: 'child',
            field: 'igw',
          })
        }
      }
    }

    /**
     * Find related Network Interface
     */
    const networkInterfaces: {
      name: string
      data: { [property: string]: any[] }
    } = data.find(({ name }) => name === services.networkInterface)
    if (networkInterfaces?.data?.[region]) {
      const dataAtRegion = findServiceInstancesWithTag(
        tag,
        networkInterfaces.data[region]
      )
      if (!isEmpty(dataAtRegion)) {
        for (const instance of dataAtRegion) {
          const { NetworkInterfaceId: id } = instance

          connections.push({
            id,
            resourceType: services.networkInterface,
            relation: 'child',
            field: 'networkInterface',
          })
        }
      }
    }

    /**
     * Find related VPCs
     */
    const vpcs: { name: string; data: { [property: string]: any[] } } =
      data.find(({ name }) => name === services.vpc)
    if (vpcs?.data?.[region]) {
      const dataAtRegion = findServiceInstancesWithTag(tag, vpcs.data[region])
      if (!isEmpty(dataAtRegion)) {
        for (const instance of dataAtRegion) {
          const { VpcId: id }: Vpc = instance

          connections.push({
            id,
            resourceType: services.vpc,
            relation: 'child',
            field: 'vpc',
          })
        }
      }
    }
    /**

     * Find related ELB
     */
    const elbs: { name: string; data: { [property: string]: any[] } } =
      data.find(({ name }) => name === services.elb)
    if (elbs?.data?.[region]) {
      const dataAtRegion = findServiceInstancesWithTag(tag, elbs.data[region])
      if (!isEmpty(dataAtRegion)) {
        for (const instance of dataAtRegion) {
          const { LoadBalancerName: id } = instance

          connections.push({
            id,
            resourceType: services.elb,
            relation: 'child',
            field: 'elb',
          })
        }
      }
    }
    /**
     * Find related NAT GWs
     */
    const natgws: { name: string; data: { [property: string]: any[] } } =
      data.find(({ name }) => name === services.nat)
    if (natgws?.data?.[region]) {
      const dataAtRegion = findServiceInstancesWithTag(tag, natgws.data[region])
      if (!isEmpty(dataAtRegion)) {
        for (const instance of dataAtRegion) {
          const { NatGatewayId: id }: NatGateway = instance

          connections.push({
            id,
            resourceType: services.nat,
            relation: 'child',
            field: 'natGateway',
          })
        }
      }
    }

    /**
     * Find related Route Tables
     */
    const routeTables: { name: string; data: { [property: string]: any[] } } =
      data.find(({ name }) => name === services.routeTable)
    if (routeTables?.data?.[region]) {
      const dataAtRegion = findServiceInstancesWithTag(
        tag,
        routeTables.data[region]
      )
      if (!isEmpty(dataAtRegion)) {
        for (const instance of dataAtRegion) {
          const { RouteTableId: id } = instance

          connections.push({
            id,
            resourceType: services.routeTable,
            relation: 'child',
            field: 'routeTable',
          })
        }
      }
    }

    /**
     * Find related S3 buckets
     */
    const buckets: { name: string; data: { [property: string]: any[] } } =
      data.find(({ name }) => name === services.s3)
    if (buckets?.data?.[region]) {
      const dataAtRegion = findServiceInstancesWithTag(
        tag,
        buckets.data[region]
      )
      if (!isEmpty(dataAtRegion)) {
        for (const instance of dataAtRegion) {
          const { Id: id } = instance

          connections.push({
            id,
            resourceType: services.s3,
            relation: 'child',
            field: 's3',
          })
        }
      }
    }

    /**
     * Find related Cloudfront distros
     */
    const distros: { name: string; data: { [property: string]: any[] } } =
      data.find(({ name }) => name === services.cloudfront)
    if (distros?.data?.[globalRegionName]) {
      const dataAtRegion: RawAwsCloudfront[] = findServiceInstancesWithTag(
        tag,
        distros.data[globalRegionName]
      )
      if (!isEmpty(dataAtRegion)) {
        for (const instance of dataAtRegion) {
          const {
            summary: { Id: id },
          } = instance

          connections.push({
            id,
            resourceType: services.cloudfront,
            relation: 'child',
            field: 'cloudfront',
          })
        }
      }
    }

    /**
     * Find related Kinesis Firehose streams
     */
    const KFStreams: { name: string; data: { [property: string]: any[] } } =
      data.find(({ name }) => name === services.kinesisFirehose)
    if (KFStreams?.data?.[region]) {
      const dataAtRegion: RawAwsKinesisFirehose[] = findServiceInstancesWithTag(
        tag,
        KFStreams.data[region]
      )
      if (!isEmpty(dataAtRegion)) {
        for (const instance of dataAtRegion) {
          const { DeliveryStreamARN: id } = instance

          connections.push({
            id,
            resourceType: services.kinesisFirehose,
            relation: 'child',
            field: 'kinesisFirehose',
          })
        }
      }
    }

    /**
     * Find related App sync
     */
    const appSyncs: { name: string; data: { [property: string]: any[] } } =
      data.find(({ name }) => name === services.appSync)

    if (appSyncs?.data?.[region]) {
      const dataAtRegion: RawAwsAppSync[] = findServiceInstancesWithTag(
        tag,
        appSyncs.data[region]
      )

      if (!isEmpty(dataAtRegion)) {
        for (const instance of dataAtRegion) {
          const { apiId: id } = instance

          connections.push({
            id,
            resourceType: services.appSync,
            relation: 'child',
            field: 'appSync',
          })
        }
      }
    }

    /**
     * Find related Cloudformation stacks
     */
    const CFStacks: { name: string; data: { [property: string]: any[] } } =
      data.find(({ name }) => name === services.cloudFormationStack)
    if (CFStacks?.data?.[region]) {
      const dataAtRegion: RawAwsCloudFormationStack[] =
        findServiceInstancesWithTag(tag, CFStacks.data[region])
      if (!isEmpty(dataAtRegion)) {
        for (const instance of dataAtRegion) {
          const { StackId: id } = instance

          connections.push({
            id,
            resourceType: services.cloudFormationStack,
            relation: 'child',
            field: 'cloudFormationStack',
          })
        }
      }
    }

    /**
     * Find related Cloudformation stack sets
     */
    const CFStacksSets: { name: string; data: { [property: string]: any[] } } =
      data.find(({ name }) => name === services.cloudFormationStackSet)
    if (CFStacksSets?.data?.[region]) {
      const dataAtRegion: RawAwsCloudFormationStackSet[] =
        findServiceInstancesWithTag(tag, CFStacksSets.data[region])
      if (!isEmpty(dataAtRegion)) {
        for (const instance of dataAtRegion) {
          const { StackSetId: id } = instance

          connections.push({
            id,
            resourceType: services.cloudFormationStackSet,
            relation: 'child',
            field: 'cloudFormationStackSet',
          })
        }
      }
    }

    /**
     * Find related Network ACLs
     */
    const NetworkACLs: { name: string; data: { [property: string]: any[] } } =
      data.find(({ name }) => name === services.nacl)
    if (NetworkACLs?.data?.[region]) {
      const dataAtRegion: RawAwsNetworkAcl[] = findServiceInstancesWithTag(
        tag,
        NetworkACLs.data[region]
      )
      if (!isEmpty(dataAtRegion)) {
        for (const instance of dataAtRegion) {
          const { NetworkAclId: id } = instance

          connections.push({
            id,
            resourceType: services.nacl,
            relation: 'child',
            field: 'nacl',
          })
        }
      }
    }
  }

  const tagResult = {
    [tag.id]: connections,
  }
  return tagResult
}
