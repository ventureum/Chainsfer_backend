// @flow
import type { Context, Callback } from 'flow-aws-lambda'
var dynamoDBTxOps = require('./dynamoDBTxOps.js')
var Config = require('./config.js')

// eslint-disable-next-line flowtype/no-weak-types
exports.handler = async (event: any, context: Context, callback: Callback) => {
  // parse request data
  // for local testing, use request = event.body
  let request = JSON.parse(event.body)

  // TODO: reject invalid clientId
  const clientId = request.clientId

  // eslint-disable-next-line flowtype/no-weak-types
  function handleResults (rv: any, err: any) {
    let response: {
      headers: {
        'Access-Control-Allow-Origin': string,
        'Access-Control-Allow-Credentials': boolean
      },
      'isBase64Encoded': boolean,
      statusCode: number,
      body: string
    } = {
      'headers': {
        'Access-Control-Allow-Origin': '*', // Required for CORS support to work
        'Access-Control-Allow-Credentials': true // Required for cookies, authorization headers with HTTPS
      },
      'isBase64Encoded': false,
      statusCode: 200,
      body: ''
    }

    if (!err) {
      response.statusCode = 200
      response.body = JSON.stringify(rv)
      callback(null, response)
    } else {
      console.log(err)
      response.statusCode = 500
      response.body = JSON.stringify(err)
      callback(null, response)
    }
  }

  // keep the following part light weight
  // heavy-lifting is done in dynamoDBTxOps
  // types are defined in transfer.flow.js
  try {
    let rv = null
    if (request.action === 'GET') {
      rv = await dynamoDBTxOps.getTransfer(request)
    } else if (request.action === 'BATCH_GET') {
      rv = await dynamoDBTxOps.getBatchTransfers(request)
    } else if (request.action === 'SEND') {
      rv = await dynamoDBTxOps.sendTransfer(request)
    } else if (request.action === 'RECEIVE') {
      rv = await dynamoDBTxOps.receiveTransfer(request)
    } else if (request.action === 'CANCEL') {
      rv = await dynamoDBTxOps.cancelTransfer(request)
    } else if (request.action === 'SET_LAST_USED_ADDRESS') {
      await dynamoDBTxOps.setLastUsedAddress(request)
    } else if (request.action === 'GET_LAST_USED_ADDRESS') {
      rv = await dynamoDBTxOps.getLastUsedAddress(request)
    } else {
      throw new Error('Invalid command')
    }

    handleResults(rv)
  } catch (err) {
    handleResults(null, err)
  }
}
