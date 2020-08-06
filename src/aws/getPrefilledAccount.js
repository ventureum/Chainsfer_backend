// @flow
import type { Context, Callback, ProxyResult } from 'flow-aws-lambda'
import Config from './config'

const AWS = require('aws-sdk')
const dynamodb = new AWS.DynamoDB({ region: 'us-east-1' })

function getItemBuilder (): {
  ProjectionExpression: string,
  TableName: string,
  Limit: string,
  ConsistentRead: boolean
} {
  return {
    ProjectionExpression: 'ALL_ATTRIBUTES',
    TableName: 'AlphaTestEthereumAddress',
    Limit: '1',
    ConsistentRead: true
  }
}

function deleteItemBuilder (
  address: string
): {
  Key: {
    address: {
      S: string
    }
  },
  TableName: string,
  ReturnValues: string
} {
  return {
    Key: {
      address: {
        S: address
      }
    },
    TableName: 'AlphaTestEthereumAddress',
    ReturnValues: 'ALL_OLD'
  }
}

// eslint-disable-next-line flowtype/no-weak-types
exports.handler = async (event: any, context: Context, callback: Callback) => {
  let response: ProxyResult = {
    headers: {
      'Access-Control-Allow-Origin': Config.getAllowOrigin(event.headers), // Required for CORS support to work
      'Access-Control-Allow-Credentials': true // Required for cookies, authorization headers with HTTPS
    },
    isBase64Encoded: false
  }

  try {
    let result = await dynamodb.scan(getItemBuilder()).promise()
    if (result.LastEvaluatedKey) {
      const address = result.LastEvaluatedKey.address.S
      result = await dynamodb.deleteItem(deleteItemBuilder(address)).promise()
      response.statusCode = 200
      response.body = JSON.stringify({
        address: result.Attributes.address.S,
        privateKey: result.Attributes.privateKey.S
      })
      callback(null, response)
    } else {
      response.statusCode = 500
      response.body = 'ETH test account list exhausted.'
      callback(null, response)
    }
  } catch (e) {
    callback(JSON.stringify(e))
  }
}
