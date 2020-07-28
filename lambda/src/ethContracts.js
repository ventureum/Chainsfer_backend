// @flow
import type { Context, Callback } from 'flow-aws-lambda'
import type { EthContractType } from './ethContracts.flow'
import Config from './config'
import AWS from 'aws-sdk'

AWS.config.update({ region: 'us-east-1' })

const ethContractsTableName = process.env.ETH_CONTRACTS_TABLE_NAME
if (!process.env.ETH_CONTRACTS_TABLE_NAME) throw new Error('ETH_CONTRACTS_TABLE_NAME missing')

const documentClient = new AWS.DynamoDB.DocumentClient()

async function getContract (address: string): Promise<EthContractType> {
  if (!address) {
    throw new Error('Missing contract address')
  }
  const param = {
    TableName: ethContractsTableName,
    KeyConditionExpression: 'address = :ad',
    ExpressionAttributeValues: {
      ':ad': address
    },
    Select: 'ALL_ATTRIBUTES'
  }
  const rv = await documentClient.query(param).promise()
  return rv.Items[0]
}

async function getContracts (): Promise<Array<EthContractType>> {
  let param = {
    TableName: ethContractsTableName,
    Select: 'ALL_ATTRIBUTES'
  }
  let contracts = []

  let rv = await documentClient.scan(param).promise()
  while (true) {
    if (!rv.LastEvaluatedKey) {
      contracts = rv.Items
      break
    } else {
      contracts = [...contracts, ...rv.Items]
      //$FlowFixMe
      param.ExclusiveStartKey = rv.LastEvaluatedKey
      rv = await documentClient.scan(param).promise()
    }
  }
  return contracts
}

// eslint-disable-next-line flowtype/no-weak-types
exports.handler = async (event: any, context: Context, callback: Callback) => {
  // eslint-disable-next-line flowtype/no-weak-types
  function handleResults (rv: Object, err: Object) {
    let response = {
      headers: {
        'Access-Control-Allow-Origin': Config.getAllowOrigin(event.headers.origin), // Required for CORS support to work
        'Access-Control-Allow-Credentials': true // Required for cookies, authorization headers with HTTPS
      },
      isBase64Encoded: false,
      statusCode: 200,
      body: ''
    }

    if (!err) {
      response.statusCode = 200
      response.body = JSON.stringify(rv)
      callback(null, response)
    } else {
      console.log(err)
      response.statusCode = 400
      response.body = err.message
      callback(null, response)
    }
  }

  let rv

  try {
    const body = JSON.parse(event.body)
    const { action, address } = body
    switch (action) {
      case 'GET_ALL_CONTRACTS':
        rv = await getContracts()
        break
      case 'GET_CONTRACT':
        rv = await getContract(address)
        break
      default:
        throw new Error('Invalid action')
    }
    handleResults(rv)
  } catch (err) {
    handleResults(null, err)
  }
}
