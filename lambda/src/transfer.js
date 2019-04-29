// @flow
import type { Context, Callback } from 'flow-aws-lambda'
var dynamoDBTxOps = require('./dynamoDBTxOps.js')

if (!process.env.TRANSACTION_DATA_TABLE_NAME) throw new Error('TRANSACTION_DATA_TABLE_NAME missing')
const transactionDataTableName = process.env.TRANSACTION_DATA_TABLE_NAME

exports.handler = async (event: any, context: Context, callback: Callback) => {
  // parse request data
  // for local testing, use request = event.body
  let request = JSON.parse(event.body)

  // TODO reject invalid clientId
  const clientId = request.clientId

  function handleResults (rv, err) {
    let response: Object = {
      'headers': {
        'Access-Control-Allow-Origin': '*', // Required for CORS support to work
        'Access-Control-Allow-Credentials': true // Required for cookies, authorization headers with HTTPS
      },
      'isBase64Encoded': false
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

  try {
    let rv = null
    if (request.action === 'GET') {
      rv = await dynamoDBTxOps.getTransfer(transactionDataTableName, request.sendingId, request.receivingId)
    } else if (request.action === 'BATCH_GET') {
      rv = await dynamoDBTxOps.getBatchTransfers(transactionDataTableName, request.sendingId, request.receivingId)
    } else if (request.action === 'SEND') {
      rv = await dynamoDBTxOps.sendTransfer(transactionDataTableName, clientId, request.sender, request.destination, request.transferAmount, request.cryptoType, request.data, request.sendTxHash, request.password)
    } else if (request.action === 'RECEIVE') {
      rv = await dynamoDBTxOps.receiveTransfer(transactionDataTableName, request.receivingId, request.receiveTxHash)
    } else if (request.action === 'CANCEL') {
      rv = await dynamoDBTxOps.cancelTransfer(transactionDataTableName, request.sendingId, request.cancelTxHash)
    } else {
      throw new Error('Invalid command')
    }

    handleResults(rv)
  } catch (err) {
    handleResults(null, err)
  }
}
