import CloudGraph from '@cloudgraph/sdk';
import DynamoDB, {
  ListTablesOutput,
  TableName,
  DescribeTableOutput,
  ListTagsOfResourceInput,
  TagList,
  TimeToLiveDescription,
  ListTagsOfResourceOutput,
  DescribeTimeToLiveOutput,
  TableDescription,
  DescribeContinuousBackupsOutput,
  TableNameList,
  ListTablesInput,
  ContinuousBackupsDescription,
} from 'aws-sdk/clients/dynamodb'
import { AWSError } from 'aws-sdk/lib/error'
import isEmpty from 'lodash/isEmpty'
import groupBy from 'lodash/groupBy'

import awsLoggerText from '../../properties/logger'
import { AwsTag, Credentials, TagMap } from '../../types'
import { convertAwsTagsToTagMap } from '../../utils/format'

import {
  generateAwsErrorLog,
  initTestEndpoint
} from '../../utils'

const lt = { ...awsLoggerText }
const { logger } = CloudGraph
const serviceName = 'DynamoDB'
const endpoint = initTestEndpoint(serviceName)

export interface RawAwsDynamoDbTable extends TableDescription {
  region: string
  ttlEnabled?: boolean
  pointInTimeRecoveryEnabled?: boolean
  tags?: TagMap
}

const checkIfEnabled = (status: string): boolean =>
  status && !['DISABLED', 'DISABLING'].includes(status)

const ttlInfoFormatter = (ttlInfo: TimeToLiveDescription): boolean => {
  const { TimeToLiveStatus } = ttlInfo
  return checkIfEnabled(TimeToLiveStatus)
}

const backupInfoFormatter = (
  backupInfo: ContinuousBackupsDescription
): boolean => {
  const {
    PointInTimeRecoveryDescription: { PointInTimeRecoveryStatus },
  } = backupInfo
  return checkIfEnabled(PointInTimeRecoveryStatus)
}

/**
 * DynamoDB
 */
const listTableNamesForRegion = async ({ dynamoDb, resolveRegion }): Promise<TableName[]> =>
  new Promise<TableName[]>(resolve => {
    const tableList: TableNameList = []
    const listTableNameOpts: ListTablesInput = {}
    const listTables = (exclusiveStartTableName?: string): void => {
      if (exclusiveStartTableName) {
        listTableNameOpts.ExclusiveStartTableName = exclusiveStartTableName
      }
      dynamoDb.listTables(
        listTableNameOpts,
        (err: AWSError, listTablesOutput: ListTablesOutput) => {
          if (err) {
            generateAwsErrorLog(serviceName, 'dynamodb:listTables', err)
          }
          /**
           * No DynamoDB data for this region
           */
          if (isEmpty(listTablesOutput)) {
            return resolveRegion()
          }

          const {
            TableNames,
            LastEvaluatedTableName: lastEvaluatedTable,
          } = listTablesOutput

          /**
           * No DynamoDB Tables for this region
           */
          if (isEmpty(TableNames)) {
            return resolveRegion()
          }
          tableList.push(...TableNames)

          if (lastEvaluatedTable) {
            listTables(lastEvaluatedTable)
          }

          resolve(tableList)
        }
      )
    }
    listTables()
  })

const getTableDescription = async (
  dynamoDb: DynamoDB,
  tableName: TableName
): Promise<TableDescription> =>
  new Promise(resolve => {
    dynamoDb.describeTable(
      { TableName: tableName },
      (err: AWSError, tableInfoOutput: DescribeTableOutput) => {
        if (err || !tableInfoOutput) {
          generateAwsErrorLog(serviceName, 'dynamodb:describeTable', err)
        }
        resolve(tableInfoOutput.Table)
      }
    )
  })

const getTableTags = async (
  dynamoDb: DynamoDB,
  resourceArn: string
): Promise<TagMap> =>
  new Promise(resolveTags => {
    const tags: TagList = []

    const listAllTagsOpts: ListTagsOfResourceInput = {
      ResourceArn: resourceArn,
    }
    const listAllTags = (token?: string): void => {
      if (token) {
        listAllTagsOpts.NextToken = token
      }
      try {
        dynamoDb.listTagsOfResource(
          listAllTagsOpts,
          (err: AWSError, data: ListTagsOfResourceOutput) => {
            const { Tags, NextToken: nextToken } = data || {}
            if (err) {
              generateAwsErrorLog(serviceName, 'dynamodb:listTagsOfResource', err)
            }

            tags.push(...Tags)

            if (nextToken) {
              logger.info(lt.foundAnotherThousand)
              listAllTags(nextToken)
            } else {
              resolveTags(convertAwsTagsToTagMap(tags as AwsTag[]))
            }
          }
        )
      } catch (error) {
        resolveTags({})
      }
    }
    listAllTags()
  })

const getTableTTLDescription = async (
  dynamoDb: DynamoDB,
  tableName: TableName
): Promise<TimeToLiveDescription> =>
  new Promise(resolve => {
    dynamoDb.describeTimeToLive(
      {
        TableName: tableName,
      },
      (err: AWSError, data: DescribeTimeToLiveOutput) => {
        if (err) {
          generateAwsErrorLog(serviceName, 'dynamodb:describeTimeToLive', err)
        }

        resolve(data.TimeToLiveDescription)
      }
    )
  })

const getTableBackupsDescription = async (
  dynamoDb: DynamoDB,
  tableName: TableName
): Promise<ContinuousBackupsDescription> =>
  new Promise(resolve => {
    dynamoDb.describeContinuousBackups(
      {
        TableName: tableName,
      },
      (err: AWSError, data: DescribeContinuousBackupsOutput) => {
        if (err) {
          generateAwsErrorLog(serviceName, 'dynamodb:describeContinuousBackups', err)
        }

        resolve(data.ContinuousBackupsDescription)
      }
    )
  })

export default async ({
  regions,
  credentials,
}: {
  regions: string
  credentials: Credentials
}): Promise<{[property: string]: RawAwsDynamoDbTable[]}> =>
  new Promise(async resolve => {
    const tableNames: Array<{ name: TableName; region: string }> = []
    const tableData: Array<RawAwsDynamoDbTable> = []
    const regionPromises = []
    const tablePromises = []
    const tagsPromises = []
    const ttlInfoPromises = []
    const backupInfoPromises = []

    // First we get all table name for all regions
    regions.split(',').map(region => {
      const dynamoDb = new DynamoDB({ region, credentials, endpoint })
      const regionPromise = new Promise<void>(async resolveRegion => {
        const regionTableNameList = await listTableNamesForRegion({
          dynamoDb,
          resolveRegion,
        })
        tableNames.push(...regionTableNameList.map(name => ({ name, region })))
        resolveRegion()
      })
      regionPromises.push(regionPromise)
    })
    await Promise.all(regionPromises)
    logger.info(lt.fetchedDynamoDbTableNames(tableNames.length))

    // Then we get the full table description for each name
    tableNames.map(({ name: tableName, region }) => {
      const dynamoDb = new DynamoDB({ region, credentials, endpoint })
      const tablePromise = new Promise<void>(async resolveTable => {
        const tableDescription: TableDescription = await getTableDescription(
          dynamoDb,
          tableName
        )
        tableData.push({
          region,
          ...tableDescription,
        })
        resolveTable()
      })
      tablePromises.push(tablePromise)
    })
    logger.info(lt.gettingTableDetails)
    await Promise.all(tablePromises)

    // Afterwards we get all tags for each table
    tableData.map(({ TableArn: tableArn, region }, idx) => {
      const dynamoDb = new DynamoDB({ region, credentials, endpoint })
      const tagsPromise = new Promise<void>(async resolveTags => {
        const tableTags: TagMap = await getTableTags(dynamoDb, tableArn)
        if (!isEmpty(tableTags)) {
          tableData[idx].tags = tableTags
        }
        resolveTags()
      })
      tagsPromises.push(tagsPromise)
    })
    logger.info(lt.gettingTableTags)
    await Promise.all(tagsPromises)

    // Then we get the ttl description for each table
    tableData.map(({ TableName, region }, idx) => {
      const dynamoDb = new DynamoDB({ region, credentials, endpoint })
      const ttlInfoPromise = new Promise<void>(async resolveTtlInfo => {
        const ttlInfo: TimeToLiveDescription = await getTableTTLDescription(
          dynamoDb,
          TableName
        )
        tableData[idx].ttlEnabled = ttlInfoFormatter(ttlInfo)
        resolveTtlInfo()
      })
      ttlInfoPromises.push(ttlInfoPromise)
    })
    logger.info(lt.gettingTableTtlInfo)
    await Promise.all(ttlInfoPromises)

    // Finally we get the backup information for each table
    tableData.map(({ TableName, region }, idx) => {
      const dynamoDb = new DynamoDB({ region, credentials, endpoint })
      const backupInfoPromise = new Promise<void>(async resolveBackupInfo => {
        const backupInfo: ContinuousBackupsDescription = await getTableBackupsDescription(
          dynamoDb,
          TableName
        )
        tableData[idx].pointInTimeRecoveryEnabled = backupInfoFormatter(
          backupInfo
        )
        resolveBackupInfo()
      })
      backupInfoPromises.push(backupInfoPromise)
    })
    logger.info(lt.gettingTableBackupInfo)
    await Promise.all(backupInfoPromises)

    resolve(groupBy(tableData, 'region'))
  })
