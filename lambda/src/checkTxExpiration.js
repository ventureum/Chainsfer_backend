// @flow
import type { Context, Callback } from 'flow-aws-lambda'
var Config = require('./config.js')
var moment = require('moment')
var AWS = require('aws-sdk')
AWS.config.update({ region: 'us-east-1' })
var dynamoDBTxOps = require('./dynamoDBTxOps.js')
var ddb = new AWS.DynamoDB.DocumentClient({ region: 'us-east-1' })

if (!process.env.TRANSACTION_DATA_TABLE_NAME) throw new Error('TRANSACTION_DATA_TABLE_NAME missing')
const transactionDataTableName = process.env.TRANSACTION_DATA_TABLE_NAME

if (!process.env.ENV_VALUE) throw new Error('ENV_VALUE missing')
const deploymentStage = process.env.ENV_VALUE.toLowerCase()

var ses = new AWS.SES({ apiVersion: '2010-12-01' })
var email = require('./email.js')

async function insertExpiredState (transferId) {
  const receiveTimestamp = moment().unix().toString()
  const params = {
    TableName: transactionDataTableName,
    Key: {
      'transferId': transferId
    },
    ConditionExpression: 'attribute_not_exists(#ctr) and attribute_not_exists(#cts) and #stcTx.#stcTxSate = :stcTxSate',
    UpdateExpression: 'SET #ctr = :ctr, #upt = :upt',
    ExpressionAttributeNames: {
      '#ctr': 'chainsferToReceiver',
      '#cts': 'chainsferToSender',
      '#stcTx': 'senderToChainsfer',
      '#stcTxSate': 'txState',
      '#upt': 'updated'
    },
    ExpressionAttributeValues: {
      ':ctr': {
        'txState': 'Expired',
        'txTimestamp': receiveTimestamp
      },
      ':stcTxSate': 'Confirmed',
      ':upt': receiveTimestamp
    },
    ReturnValues: 'ALL_NEW'
  }
  try {
    await ddb.update(params).promise()
    console.log('chainsferToReceiver txState is updated successfully with State Expired')
  } catch (err) {
    throw new Error('Unable to update chainsferToReceiver txState. Error: ' + err.message)
  }
}

exports.handler = async (event: any, context: Context, callback: Callback) => {
  const expirationLength = Config.ExpirationLengthConfig[deploymentStage] || Config.ExpirationLengthConfig['default']
  let items = await dynamoDBTxOps.validateExpiration(transactionDataTableName, expirationLength)
  for (let index = 0; index < items.length; index++) {
    const item = items[index]
    console.log('Expired tarnsfer: ', item.transferId)
    await insertExpiredState(item.transferId)
    await email.expireAction(
      ses,
      item.transferId,
      item.receivingId,
      item.sender,
      item.receiver,
      item.transferAmount,
      item.cryptoType
    )
  }
  callback(null, 'message')
}
