// @flow
import type { Context, Callback } from 'flow-aws-lambda'
var Config = require('./config.js')
var AWS = require('aws-sdk')
AWS.config.update({ region: 'us-east-1' })
var dynamoDBTxOps = require('./dynamoDBTxOps.js')

if (!process.env.TRANSACTION_DATA_TABLE_NAME) throw new Error('TRANSACTION_DATA_TABLE_NAME missing')
const transactionDataTableName = process.env.TRANSACTION_DATA_TABLE_NAME

if (!process.env.ENV_VALUE) throw new Error('ENV_VALUE missing')
const deploymentStage = process.env.ENV_VALUE.toLowerCase()

var ses = new AWS.SES({ apiVersion: '2010-12-01' })
var email = require('./email.js')

exports.handler = async (event: any, context: Context, callback: Callback) => {
  const expirationLength = Config.ExpirationLengthConfig[deploymentStage] || Config.ExpirationLengthConfig['default']
  let items = await dynamoDBTxOps.validateExpiration(transactionDataTableName, expirationLength)
  for (let index = 0; index < items.length; index++) {
    const item = items[index]
    console.log('Expired tarnsfer: ', item.transferId)
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
