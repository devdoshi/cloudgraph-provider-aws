import t from '../../properties/translations'
import { AwsCloudTrail } from '../../types/generated';
import { formatTagsFromMap } from '../../utils/format';
import { RawAwsCloudTrail } from './data';

export default ({
  service: rawData,
  region,
}: {
  service: RawAwsCloudTrail
  region: string
}): AwsCloudTrail => {
  const {
    Name: name,
    S3BucketName: s3BucketName,
    S3KeyPrefix: s3KeyPrefix,
    SnsTopicName: snsTopicName,
    SnsTopicARN: snsTopicARN,
    IncludeGlobalServiceEvents: includeGlobalServiceEvents,
    IsMultiRegionTrail: isMultiRegionTrail,
    HomeRegion: homeRegion,
    TrailARN: arn,
    LogFileValidationEnabled: logFileValidationEnabled,
    CloudWatchLogsLogGroupArn: cloudWatchLogsLogGroupArn,
    CloudWatchLogsRoleArn: cloudWatchLogsRoleArn,
    KmsKeyId: kmsKeyId,
    HasCustomEventSelectors: hasCustomEventSelectors,
    HasInsightSelectors: hasInsightSelectors,
    IsOrganizationTrail: isOrganizationTrail,
    Tags,
  } = rawData

  const cloudTrail = {
    id: arn,
    arn,
    name,
    s3BucketName,
    s3KeyPrefix,
    snsTopicName,
    snsTopicARN,
    includeGlobalServiceEvents: includeGlobalServiceEvents? t.yes : t.no,
    isMultiRegionTrail: isMultiRegionTrail? t.yes : t.no,
    homeRegion,
    logFileValidationEnabled: logFileValidationEnabled? t.yes : t.no,
    cloudWatchLogsLogGroupArn,
    cloudWatchLogsRoleArn,
    kmsKeyId,
    hasCustomEventSelectors: hasCustomEventSelectors? t.yes : t.no,
    hasInsightSelectors: hasInsightSelectors? t.yes : t.no,
    isOrganizationTrail: isOrganizationTrail? t.yes : t.no,
    tags: formatTagsFromMap(Tags),
    region,
  }

  return cloudTrail
}
