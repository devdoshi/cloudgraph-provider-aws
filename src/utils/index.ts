import AWS, { AWSError, ConfigurationOptions } from 'aws-sdk'
import { APIVersions } from 'aws-sdk/lib/config'
import CloudGraph, { Opts } from '@cloudgraph/sdk'
import STS from 'aws-sdk/clients/sts'
import camelCase from 'lodash/camelCase'
import environment from '../config/environment'
import { Credentials } from '../types'
import {
  BASE_CUSTOM_RETRY_DELAY,
  MAX_FAILED_AWS_REQUEST_RETRIES,
} from '../config/constants'
import relations from '../enums/relations'

const { logger } = CloudGraph

export const toCamel = (o: any): any => {
  let origKey
  let newKey
  let value

  if (o instanceof Array) {
    return o.map(value => {
      if (typeof value === 'object') {
        value = toCamel(value)
      }
      return value
    })
  }

  const newObject = {}
  for (origKey in o) {
    if (o.hasOwnProperty(origKey)) {
      newKey = camelCase(origKey)
      value = o[origKey]
      if (
        value instanceof Array ||
        (value !== null && value.constructor === Object)
      ) {
        value = toCamel(value)
      }
      newObject[newKey] = value
    }
  }

  return newObject
}

export const getKeyByValue = (
  object: Record<string, unknown>,
  value: any
): string | undefined => {
  return Object.keys(object).find(key => object[key] === value)
}

export const intersectStringArrays = (
  a: Array<string>,
  b: Array<string>
): Array<string> => {
  const setA = new Set(a)
  const setB = new Set(b)
  const intersection = new Set([...setA].filter(x => setB.has(x)))
  return Array.from(intersection)
}

export async function getAccountId({
  credentials,
}: // opts,
{
  credentials: Credentials
  opts?: Opts
}): Promise<any> {
  try {
    return new Promise((resolve, reject) =>
      new STS({ credentials }).getCallerIdentity((err, data) => {
        if (err) {
          return reject(err)
        }
        return resolve({ accountId: data.Account })
      })
    )
  } catch (e) {
    return { accountId: '' }
  }
}

export function getCredentials(opts: Opts): Promise<Credentials> {
  return new Promise(resolve => {
    AWS.config.getCredentials((err: any) => {
      if (err) {
        opts.logger.log(err)
        throw new Error(
          'Unable to find Credentials for AWS, They could be stored in env variables or .aws/credentials file'
        )
      } else {
        resolve(AWS.config.credentials)
      }
    })
  })
}

export const setAwsRetryOptions = (opts: {
  baseDelay?: number
  global?: boolean
  maxRetries?: number
  configObj?: any
  profile?: string
}): void | (ConfigurationOptions & APIVersions) => {
  const {
    global = false,
    maxRetries = MAX_FAILED_AWS_REQUEST_RETRIES,
    baseDelay: base = BASE_CUSTOM_RETRY_DELAY,
    profile = undefined,
    configObj = undefined,
    ...rest
  } = opts
  const config: ConfigurationOptions & APIVersions = {
  // logger.log = logger.debug
    maxRetries,
    // logger,
      base,
    retryDelayOptions: {
    },
    ...rest,
  }
    configObj.profile = profile
  if (profile && configObj) {
  }
  global && AWS.config.update(config)
  return config
}
export function initTestEndpoint(
  service?: string,
  opts?: Opts
): string | undefined {
  const devOrTestMode = !!(environment.NODE_ENV === 'test' || opts?.devMode)
  // TODO: Find a way to parametrize the localstackEndpoint when running the cli
  const localstackEndpoint =
    environment.LOCALSTACK_AWS_ENDPOINT || 'http://localhost:4566'
  devOrTestMode &&
    logger.debug(`environment.LOCALSTACK_AWS_ENDPOINT? ${localstackEndpoint}`)
  const endpoint = devOrTestMode ? localstackEndpoint : undefined
  devOrTestMode &&
    service &&
    endpoint &&
    logger.info(`${service} getData in test mode!`)
  devOrTestMode && logger.debug(`endpoint ${endpoint}`)
  return endpoint
}

export function initTestConfig(): void {
  jest.setTimeout(300000)
}

export function generateAwsErrorLog(
  service: string,
  functionName: string,
  err?: AWSError
): void {
  if (err.statusCode === 400) {
    err.retryable = true
  }
  const notAuthorized = 'not authorized' // part of the error string aws passes back for permissions errors
  const accessDenied = 'AccessDeniedException' // an error code aws sometimes sends back for permissions errors
  logger.warn(
    `There was a problem getting data for service ${service}, CG encountered an error calling ${functionName}`
  )
  if (err?.message?.includes(notAuthorized) || err?.code === accessDenied) {
    logger.warn(err.message)
  }
  logger.debug(err)
}

export const settleAllPromises = async (
  promises: Promise<any>[]
): Promise<any[]> =>
  (await Promise.allSettled(promises)).map(
    /** We force the PromiseFulfilledResult interface
     *  because all promises that we input to Promise.allSettled
     *  are always resolved, that way we suppress the compiler error complaining
     *  that Promise.allSettled returns an Array<PromiseFulfilledResult | PromiseRejectedResult>
     *  and that the value property doesn't exist for the PromiseRejectedResult interface */
    i => (i as PromiseFulfilledResult<any>).value
  )

/**
 * Sorts a services list depending on his dependencies
 * @param resourceNames services to sort
 * @returns sorted list of services
 */
export const sortResourcesDependencies = (resourceNames: string[]): string[] =>
  resourceNames.sort((prevResource, nextResource) => {
    const dependecies = relations[prevResource]

    if (dependecies && dependecies.includes(nextResource)) {
      return -1
    }
    return 0
  })
