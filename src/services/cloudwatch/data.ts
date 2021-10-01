import CloudGraph from '@cloudgraph/sdk'
import groupBy from 'lodash/groupBy'
import isEmpty from 'lodash/isEmpty'

import CloudWatch, {
  MetricAlarm,
  DescribeAlarmsInput,
  DescribeAlarmsOutput,
  ListTagsForResourceOutput,
  MetricAlarms,
} from 'aws-sdk/clients/cloudwatch'

import { AWSError } from 'aws-sdk/lib/error'

import { Credentials, TagMap, AwsTag } from '../../types'
import awsLoggerText from '../../properties/logger'
import { initTestEndpoint, generateAwsErrorLog, setAwsRetryOptions } from '../../utils'
import { convertAwsTagsToTagMap } from '../../utils/format'
import { CLOUDWATCH_CUSTOM_DELAY } from '../../config/constants'

/**
 * Cloudwatch
 */
const lt = { ...awsLoggerText }
const MAX_ITEMS = 100
const { logger } = CloudGraph
const serviceName = 'Cloudwatch'
const endpoint = initTestEndpoint(serviceName)
const customRetrySettings = setAwsRetryOptions({ baseDelay: CLOUDWATCH_CUSTOM_DELAY })

export interface RawAwsCloudwatch extends MetricAlarm {
  region: string
  Tags?: TagMap
}

const listMetricAlarmsForRegion = async ({
  cloudwatch,
  resolveRegion,
}: {
  cloudwatch: CloudWatch
  resolveRegion: () => void
}): Promise<MetricAlarm[]> =>
  new Promise<MetricAlarms>(resolve => {
    const metricAlarmsList: MetricAlarms = []
    const listMetricAlarmsOpts: DescribeAlarmsInput = {}
    const listAllAlarms = (token?: string): void => {
      listMetricAlarmsOpts.MaxRecords = MAX_ITEMS
      if (token) {
        listMetricAlarmsOpts.NextToken = token
      }
      try {
        cloudwatch.describeAlarms(
          listMetricAlarmsOpts,
          (err: AWSError, data: DescribeAlarmsOutput) => {
            const { NextToken: nextToken, MetricAlarms: metricAlarms } =
              data || {}
            if (err) {
              generateAwsErrorLog(serviceName, 'cloudwatch:describeAlarms', err)
            }
            /**
             * No metrics for this region
             */
            if (isEmpty(data)) {
              return resolveRegion()
            }

            metricAlarmsList.push(...metricAlarms)

            if (nextToken) {
              logger.debug(lt.foundMoreCloudwatchAlarms(metricAlarms.length))
              listAllAlarms(nextToken)
            }

            resolve(metricAlarmsList)
          }
        )
      } catch (error) {
        resolve([])
      }
    }
    listAllAlarms()
  })

const getResourceTags = async (cloudwatch: CloudWatch, arn: string) =>
  new Promise<TagMap>(resolve => {
    try {
      cloudwatch.listTagsForResource(
        { ResourceARN: arn },
        (err: AWSError, data: ListTagsForResourceOutput) => {
          if (err) {
            generateAwsErrorLog(serviceName, 'cloudwatch:listTagsForResource', err)
            return resolve({})
          }
          const { Tags = [] } = data || {}
          resolve(convertAwsTagsToTagMap(Tags as AwsTag[]))
        }
      )
    } catch (error) {
      resolve({})
    }
  })

export default async ({
  regions,
  credentials,
  opts
}: {
  regions: string
  credentials: Credentials
  opts?: Opts
}): Promise<{[property: string]: RawAwsCloudwatch[]}> =>
  new Promise(async resolve => {
    const cloudwatchData: Array<
      MetricAlarm & { Tags?: TagMap; region: string }
    > = []
    const regionPromises = []
    const tagsPromises = []
    const endpoint = initTestEndpoint('Cloudwatch', opts)

    // get all metrics for all regions
    regions.split(',').map(region => {
      const cloudwatch = new CloudWatch({
        region,
        credentials,
        endpoint,
      })
      const regionPromise = new Promise<void>(async resolveRegion => {
        const metricAlarmsList = await listMetricAlarmsForRegion({
          cloudwatch,
          resolveRegion,
        })
        cloudwatchData.push(
          ...metricAlarmsList.map(metricAlarm => ({
            ...metricAlarm,
            region,
          }))
        )
        resolveRegion()
      })
      regionPromises.push(regionPromise)
    })

    logger.debug(lt.gettingCloudwatchAlarms)
    await Promise.all(regionPromises)

    // get all tags for each environment
    cloudwatchData.map(({ AlarmArn, region }, idx) => {
      const cloudwatch = new CloudWatch({ region, credentials, endpoint, ...customRetrySettings })
      const tagsPromise = new Promise<void>(async resolveTags => {
        const envTags = await getResourceTags(cloudwatch, AlarmArn)
        cloudwatchData[idx].Tags = envTags
        resolveTags()
      })
      tagsPromises.push(tagsPromise)
    })

    logger.debug(lt.gettingCloudwatchAlarmTags)
    await Promise.all(tagsPromises)

    resolve(groupBy(cloudwatchData, 'region'))
  })
