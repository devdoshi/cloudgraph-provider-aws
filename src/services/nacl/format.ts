import { NetworkAclEntry } from 'aws-sdk/clients/ec2'
import cuid from 'cuid'
import t from '../../properties/translations'
import { AwsNetworkAcl } from '../../types/generated'
import { RawAwsNetworkAcl } from './data'
import { networkAclArn } from '../../utils/generateArns'

/**
 * NACL
 */
export default ({
  service: rawData,
  account,
  region,
}: {
  service: RawAwsNetworkAcl
  account: string
  region: string
}): AwsNetworkAcl => {
  const {
    NetworkAclId: id,
    Associations: associations,
    Entries: entries,
    VpcId: vpcId,
    IsDefault: isDefault,
  } = rawData

  const associatedSubnets = (associations || []).map(
    ({
      NetworkAclAssociationId: networkAclAssociationId,
      SubnetId: subnetId,
    }) => ({ id: cuid(), networkAclAssociationId, subnetId })
  )

  const egress = (entries || []).filter(({ Egress: e }) => e)
  const ingress = (entries || []).filter(({ Egress: e }) => !e)

  const [outboundRules, inboundRules] = [
    { data: egress, direction: t.destination },
    { data: ingress, direction: t.source },
  ].map(({ data, direction }) =>
    data.map((rule: NetworkAclEntry) => {
      const {
        CidrBlock: cidrBlock,
        Ipv6CidrBlock: ipv6CidrBlock,
        PortRange: { To: toPort, From: fromPort } = {},
        Protocol: protocol,
        RuleNumber: ruleNumber,
        RuleAction: ruleAction,
      } = rule

      let portRange = ''

      if (!fromPort && !toPort) {
        portRange = t.all
      } else if (fromPort === toPort) {
        portRange = fromPort.toString()
      } else {
        portRange = `${fromPort} - ${toPort}`
      }

      return {
        id: cuid(),
        ruleNumber,
        protocol: protocol === '-1' ? t.all : protocol,
        portRange,
        source:
          direction === t.source ? cidrBlock || ipv6CidrBlock || '' : undefined,
        destination:
          direction === t.destination
            ? cidrBlock || ipv6CidrBlock || ''
            : undefined,
        allowOrDeny: ruleAction,
      }
    })
  )

  return {
    id,
    vpcId,
    arn: networkAclArn({ region, account, id }),
    associatedSubnets,
    inboundRules,
    outboundRules,
    default: isDefault,
    region,
  }
}
