import CloudGraph from '@cloudgraph/sdk'

import { Request } from 'aws-sdk'
import EC2, {
  DescribeInternetGatewaysRequest,
  DescribeInternetGatewaysResult,
  InternetGateway,
} from 'aws-sdk/clients/ec2'
import { AWSError } from 'aws-sdk/lib/error'

import groupBy from 'lodash/groupBy'
import isEmpty from 'lodash/isEmpty'

import { Credentials, AwsTag, TagMap } from '../../types'
import awsLoggerText from '../../properties/logger'
import { initTestEndpoint, generateAwsErrorLog } from '../../utils'
import { convertAwsTagsToTagMap } from '../../utils/format'

const lt = { ...awsLoggerText }
const { logger } = CloudGraph
const serviceName = 'IGW'
const endpoint = initTestEndpoint(serviceName)
/**
 * IGW
 */

export interface RawAwsIgw extends Omit<InternetGateway, 'Tags'> {
  Tags: TagMap
  region: string
}

export default async ({
  credentials,
  regions,
  opts
}: {
  credentials: Credentials
  regions: string
  opts?: Opts
}): Promise<{ [property: string]: RawAwsIgw[] }> =>
  new Promise(async resolve => {
    const igwData: RawAwsIgw[] = []
    const regionPromises = []
    const endpoint = initTestEndpoint('IGW', opts)

    const listIgwData = async ({
      ec2,
      region,
      token: NextToken = '',
      resolveRegion,
    }: {
      ec2: EC2
      region: string
      token?: string
      resolveRegion: () => void
    }): Promise<Request<DescribeInternetGatewaysResult, AWSError>> => {
      let args: DescribeInternetGatewaysRequest = {}

      if (NextToken) {
        args = { ...args, NextToken }
      }

      return ec2.describeInternetGateways(
        args,
        (err: AWSError, data: DescribeInternetGatewaysResult) => {
          if (err) {
            generateAwsErrorLog(serviceName, 'ec2:describeInternetGateways', err)
          }

          /**
           * No IGW data for this region
           */
          if (isEmpty(data)) {
            return resolveRegion()
          }

          const { InternetGateways: igws, NextToken: token } = data

          logger.debug(lt.fetchedIgws(igws.length))

          /**
           * No IGWs Found
           */

          if (isEmpty(igws)) {
            return resolveRegion()
          }

          /**
           * Check to see if there are more
           */

          if (token) {
            listIgwData({ region, token, ec2, resolveRegion })
          }

          /**
           * Add the found IGWs to the igwData
           */

          igwData.push(
            ...igws.map(({ Tags, ...igw }) => ({
              ...igw,
              region,
              Tags: convertAwsTagsToTagMap(Tags as AwsTag[])
            }))
          )

          /**
           * If this is the last page of data then return
           */

          if (!token) {
            resolveRegion()
          }
        }
      )
    }

    regions.split(',').map(region => {
      const ec2 = new EC2({ region, credentials, endpoint })
      const regionPromise = new Promise<void>(resolveRegion =>
        listIgwData({ ec2, region, resolveRegion })
      )
      regionPromises.push(regionPromise)
    })

    await Promise.all(regionPromises)
    resolve(groupBy(igwData, 'region'))
  })
