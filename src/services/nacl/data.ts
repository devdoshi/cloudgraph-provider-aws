import CloudGraph from '@cloudgraph/sdk'
import { AWSError } from 'aws-sdk'
import EC2, { DescribeNetworkAclsRequest, DescribeNetworkAclsResult, NetworkAcl } from 'aws-sdk/clients/ec2';
import groupBy from 'lodash/groupBy';
import isEmpty from 'lodash/isEmpty'

import awsLoggerText from '../../properties/logger'
import { AwsTag, Credentials, TagMap } from '../../types'
import { convertAwsTagsToTagMap } from '../../utils/format'
import {
  generateAwsErrorLog,
  initTestEndpoint,
} from '../../utils'


const lt = { ...awsLoggerText }
const { logger } = CloudGraph
const serviceName = 'NetworkACL'
const endpoint = initTestEndpoint(serviceName)

export interface RawAwsNetworkAcl extends Omit<NetworkAcl, 'Tags'> {
  Tags?: TagMap
  region: string
}

/**
 * Network ACL
 */
export default async ({
  regions,
  credentials,
}: {
  regions: string
  credentials: Credentials
}): Promise<{ [property: string]: RawAwsNetworkAcl[] }> =>
  new Promise(async resolve => {
    const naclData = []
    const regionPromises = []

    const listNaclData = async ({
      ec2,
      region,
      token: NextToken = '',
      resolveRegion,
    }): Promise<void> => {
      let args: DescribeNetworkAclsRequest = {}

      if (NextToken) {
        args = { ...args, NextToken }
      }

      return ec2.describeNetworkAcls(
        args,
        (err: AWSError, data: DescribeNetworkAclsResult) => {
          if (err) {
            generateAwsErrorLog(serviceName, 'nacl:describeNetworkAcls',err)
          }

          if (isEmpty(data)) {
            return resolveRegion()
          }

          const { NetworkAcls: nacls, NextToken: token } = data

          if (isEmpty(nacls)) {
            return resolveRegion()
          }

          if (token) {
            listNaclData({ region, token, ec2, resolveRegion })
          }

          naclData.push(
            ...nacls.map(({ Tags, ...nacl }) => ({
              ...nacl,
              region,
              Tags: convertAwsTagsToTagMap(Tags as AwsTag[]),
            }))
          )

          if (!token) {
            logger.info(lt.fetchedNacls(nacls.length))
            resolveRegion()
          }
        }
      )
    }

    regions.split(',').map(region => {
      const ec2 = new EC2({ region, credentials, endpoint })
      const regionPromise = new Promise<void>(resolveRegion =>
        listNaclData({ ec2, region, resolveRegion })
      )
      regionPromises.push(regionPromise)
    })

    await Promise.all(regionPromises)
    resolve(groupBy(naclData, 'region'))
  })