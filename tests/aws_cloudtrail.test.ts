import CloudGraph from '@cloudgraph/sdk'

import CloudTrailClass from '../src/services/cloudtrail'
import S3Service from '../src/services/s3'
import KmsClass from '../src/services/kms'
import { initTestConfig } from '../src/utils'
import { credentials, region } from '../src/properties/test'
import { RawAwsCloudTrail } from '../src/services/cloudtrail/data'
import services from '../src/enums/services'

describe('CloudTrail Service Test: ', () => {
  let getDataResult
  let formatResult
  let s3Result
  let kmsResult
  let cloudTrailConnections
  let cloudTrailId

  initTestConfig()

  beforeAll(
    async () =>
      new Promise<void>(async resolve => {
        try {
          const cloudTrailClass = new CloudTrailClass({ logger: CloudGraph.logger })
          const s3Service = new S3Service({logger: CloudGraph.logger,})
          const kmsClass = new KmsClass({logger: CloudGraph.logger,})

          getDataResult = await cloudTrailClass.getData({
            credentials,
            regions: region,
          })
          formatResult = getDataResult[region].map((item: RawAwsCloudTrail) =>
            cloudTrailClass.format({ service: item, region })
          )

          // Get S3 data
          s3Result = await s3Service.getData({
            credentials,
            regions: region,
          })

          // Get kms data 
          kmsResult = await kmsClass.getData({
            credentials,
            regions: region,
          })

          const [cloudTrail] = getDataResult[region]
          cloudTrailId = cloudTrail.TrailARN

          cloudTrailConnections = cloudTrailClass.getConnections({
            service: cloudTrail,
            data: [
              {
                name: services.s3,
                data: s3Result,
                region,
              },
              {
                name: services.kms,
                data: kmsResult,
                region,
              },
            ],
            region,
          })
        } catch (error) {
          console.error(error) // eslint-disable-line no-console
        }
        resolve()
      })
  )

  describe('getData', () => {
    test('should return a truthy value ', () => {
      expect(getDataResult).toBeTruthy()
    })

    test('should return data from a region in the correct format', () => {
      expect(getDataResult[region]).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            Name: expect.any(String),
            TrailARN: expect.any(String),
            region: expect.any(String),
          }),
        ])
      )
    })
  })

  describe('format', () => {
    test('should return data in the correct format matching the schema type', () => {
      expect(formatResult).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: expect.any(String),
            arn: expect.any(String),
            name: expect.any(String),
            region: expect.any(String),
          }),
        ])
      )
    })
  })

  describe('connections', () => {
    test('should verify the connections to s3', () => {
      const s3Connections = cloudTrailConnections[cloudTrailId]?.find(
        s3 => s3.resourceType === services.s3
      )
      expect(s3Connections).toBeDefined()
    })

    test('should verify the connections to kms', () => {
      const kmsConnections = cloudTrailConnections[cloudTrailId]?.find(
        kms => kms.resourceType === services.kms
      )
      expect(kmsConnections).toBeDefined()
    })

    test.todo('should verify the connections to SNS Topic')
  })
})
