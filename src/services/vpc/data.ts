import get from 'lodash/get'
import groupBy from 'lodash/groupBy'
import isEmpty from 'lodash/isEmpty'
import upperFirst from 'lodash/upperFirst'

import { Request } from 'aws-sdk'
import { AWSError } from 'aws-sdk/lib/error'
import EC2, {
  DescribeVpcsRequest,
  DescribeVpcsResult,
  Vpc,
} from 'aws-sdk/clients/ec2'
import CloudGraph, { Opts } from '@cloudgraph/sdk'

import { AwsTag, Credentials, TagMap } from '../../types'
import awsLoggerText from '../../properties/logger'
import { initTestEndpoint, generateAwsErrorLog } from '../../utils'
import { convertAwsTagsToTagMap } from '../../utils/format'

const lt = { ...awsLoggerText }
const { logger } = CloudGraph
const serviceName = 'VPC'
const endpoint = initTestEndpoint(serviceName)

/**
 * VPC
 */
export interface RawAwsVpc extends Omit<Vpc, 'Tags'> {
  enableDnsHostnames?: boolean
  enableDnsSupport?: boolean
  region: string
  Tags: TagMap
}

export default async ({
  regions,
  credentials,
  opts,
}: {
  regions: string
  credentials: Credentials
  opts?: Opts
}): Promise<{ [property: string]: RawAwsVpc[] }> =>
  new Promise(async resolve => {
    const vpcData: RawAwsVpc[] = []
    const endpoint = initTestEndpoint('VPC', opts)
    const regionPromises = []
    const additionalAttrPromises = []

    /**
     * Step 1) Get all the VPC data for each region
     */

    const listVpcData = async ({
      ec2,
      region,
      token: NextToken = '',
      resolveRegion,
    }: {
      ec2: EC2
      region: string
      token?: string
      resolveRegion: () => void
    }): Promise<Request<DescribeVpcsResult, AWSError>> => {
      let args: DescribeVpcsRequest = {}

      if (NextToken) {
        args = { ...args, NextToken }
      }

      return ec2.describeVpcs(
        args,
        (err: AWSError, data: DescribeVpcsResult) => {
          if (err) {
            generateAwsErrorLog(serviceName, 'ec2:describeVpcs', err)
          }

          /**
           * No Vpc data for this region
           */
          if (isEmpty(data)) {
            return resolveRegion()
          }

          const { Vpcs: vpcs, NextToken: token } = data

          logger.debug(lt.fetchedVpcs(vpcs.length))

          /**
           * No Vpcs Found
           */

          if (isEmpty(vpcs)) {
            return resolveRegion()
          }

          /**
           * Check to see if there are more
           */

          if (token) {
            listVpcData({ region, token, ec2, resolveRegion })
          }

          /**
           * Add the found Vpcs to the vpcData
           */

          vpcData.push(
            ...vpcs.map(vpc => {
              return {
                ...vpc,
                region,
                Tags: convertAwsTagsToTagMap(vpc.Tags as AwsTag[]),
              }
            })
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
        listVpcData({ ec2, region, resolveRegion })
      )
      regionPromises.push(regionPromise)
    })

    await Promise.all(regionPromises)

    /**
     * Step 2) For each VPC get Enable DNS Support/Hostnames configuration
     */

    const fetchVpcAttribute = (Attribute): void[] =>
      vpcData.map(({ region, VpcId }, idx): void => {
        const ec2 = new EC2({ region, credentials, endpoint })

        const additionalAttrPromise = new Promise<void>(resolveAdditionalAttr =>
          ec2.describeVpcAttribute({ VpcId, Attribute }, (err, data) => {
            if (err) {
              generateAwsErrorLog(serviceName, 'ec2:describeVpcAttribute', err)
            }

            /**
             * No attribute
             */

            if (isEmpty(data)) {
              return resolveAdditionalAttr()
            }

            /**
             * Add the attribute to the VPC
             */

            vpcData[idx][upperFirst(Attribute)] = get(
              data[upperFirst(Attribute)],
              'Value'
            )

            resolveAdditionalAttr()
          })
        )

        additionalAttrPromises.push(additionalAttrPromise)
      })

    logger.debug(lt.fetchingVpcDnsSupportData)
    fetchVpcAttribute('enableDnsSupport')
    await Promise.all(additionalAttrPromises)

    logger.debug(lt.fetchingVpcDnsHostnamesData)
    fetchVpcAttribute('enableDnsHostnames')
    await Promise.all(additionalAttrPromises)

    resolve(groupBy(vpcData, 'region'))
  })
