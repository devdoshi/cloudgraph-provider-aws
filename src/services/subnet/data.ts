import groupBy from 'lodash/groupBy'
import isEmpty from 'lodash/isEmpty'

import { Request } from 'aws-sdk'
import EC2, {
  Subnet,
  DescribeSubnetsResult,
  DescribeSubnetsRequest,
} from 'aws-sdk/clients/ec2'
import { AWSError } from 'aws-sdk/lib/error'

import CloudGraph, { Opts } from '@cloudgraph/sdk'
import { Credentials, TagMap, AwsTag } from '../../types'

import awsLoggerText from '../../properties/logger'
// import { Tag } from '../../types/generated'
import { initTestEndpoint } from '../../utils'
import { convertAwsTagsToTagMap } from '../../utils/format'

const lt = { ...awsLoggerText }
const { logger } = CloudGraph

/**
 * Subnets
 */

export interface AwsSubnet extends Omit<Subnet, 'Tags'> {
  region: string
  tags: TagMap
}

export default ({
  regions,
  credentials,
  opts
}: {
  regions: string
  credentials: Credentials
  opts?: Opts
}): Promise<{ [property: string]: AwsSubnet[] }> =>
  new Promise(async resolve => {
    const subnetData: AwsSubnet[] = []
    const regionPromises = []
    const endpoint = initTestEndpoint('Subnet', opts)

    const listSubnetData = async ({
      ec2,
      region,
      token: NextToken = '',
      resolveSubnet,
    }: {
      ec2: EC2
      region: string
      token?: string
      resolveSubnet: () => void
    }): Promise<Request<DescribeSubnetsResult, AWSError>> => {
      let args: DescribeSubnetsRequest = {}

      if (NextToken) {
        args = { ...args, NextToken }
      }

      return ec2.describeSubnets(
        args,
        (err: AWSError, data: DescribeSubnetsResult) => {
          if (err) {
            logger.warn(
              'There was an error getting data for service subnet: unable to describeSubnets'
            )
            logger.debug(err)
          }

          /**
           * No Subnet data for this region
           */

          if (isEmpty(data)) {
            return resolveSubnet()
          }

          const { Subnets: subnets, NextToken: token } = data

          logger.debug(lt.fetchedSubnets(subnets.length))

          /**
           * No subnets Found
           */

          if (isEmpty(subnets)) {
            return resolveSubnet()
          }

          /**
           * Check to see if there are more
           */

          if (token) {
            listSubnetData({ region, token, ec2, resolveSubnet })
          }

          /**
           * Add the found subnets to the subnetData
           */

          subnetData.push(
            ...subnets.map(({ Tags, ...subnet }) => ({
              ...subnet,
              region,
              tags: convertAwsTagsToTagMap(Tags as AwsTag[]),
            }))
          )

          /**
           * If this is the last page of data then return
           */

          if (!token) {
            resolveSubnet()
          }
        }
      )
    }

    regions.split(',').map(region => {
      const ec2 = new EC2({ region, credentials, endpoint })
      const regionPromise = new Promise<void>(resolveSubnet =>
        listSubnetData({ region, ec2, resolveSubnet })
      )
      regionPromises.push(regionPromise)
    })

    await Promise.all(regionPromises)

    resolve(groupBy(subnetData, 'region'))
  })
