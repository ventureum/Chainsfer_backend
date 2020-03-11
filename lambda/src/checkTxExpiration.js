// @flow
import type { Context, Callback } from 'flow-aws-lambda'
var moment = require('moment')
var AWS = require('aws-sdk')
AWS.config.update({ region: 'us-east-1' })
var dynamoDBTxOps = require('./dynamoDBTxOps.js')
var ddb = new AWS.DynamoDB.DocumentClient({ region: 'us-east-1' })
var ses = new AWS.SES({ apiVersion: '2010-12-01' })
var email = require('./email.js')
var Config = require('./config.js')

if (!process.env.TRANSACTION_DATA_TABLE_NAME) throw new Error('TRANSACTION_DATA_TABLE_NAME missing')
const transactionDataTableName = process.env.TRANSACTION_DATA_TABLE_NAME

if (!process.env.ENV_VALUE) throw new Error('ENV_VALUE missing')
const deploymentStage = process.env.ENV_VALUE.toLowerCase()

const expirationLength =
  Config.ExpirationLengthConfig[deploymentStage] || Config.ExpirationLengthConfig['default']
const reminderInterval =
  Config.ReminderIntervalConfig[deploymentStage] || Config.ReminderIntervalConfig['default']

async function insertExpiredState (transferId: string) {
  const ts = moment().unix()
  const params = {
    TableName: transactionDataTableName,
    Key: {
      transferId: transferId
    },
    UpdateExpression:
      'SET #expired = :expired, #upt = :upt, #re.#rtsc = #re.#rtsc + :inc, #re.#nrt = :nrt',
    ExpressionAttributeNames: {
      '#expired': 'expired',
      '#upt': 'updated',
      '#re': 'reminder',
      '#rtsc': 'reminderToSenderCount',
      '#nrt': 'nextReminderTimestamp'
    },
    ExpressionAttributeValues: {
      ':expired': true,
      ':upt': ts,
      ':inc': 1,
      ':nrt': ts + reminderInterval
    },
    ReturnValues: 'ALL_NEW'
  }
  try {
    await ddb.update(params).promise()
    console.log('transfer is updated successfully with State Expired')
  } catch (err) {
    throw new Error('Unable to update chainsferToReceiver txState. Error: ' + err.message)
  }
}

// eslint-disable-next-line flowtype/no-weak-types
exports.handler = async (event: any, context: Context, callback: Callback) => {
  /* 
    Once the escrow receives funds sucessfully (),
    we begain periodically send out reminder/expiration emails till the funds leave
    the escrow wallet (returned or received)
   */
  try {
    const timestamp = moment().unix()
    const reminderList = await dynamoDBTxOps.collectReminderList()
    console.log('reminderList', reminderList)
    for (let item of reminderList) {
      // classify reminder type:
      // 1. expiration >= timestamp => send reminder to receiver
      // 2. expiration < timestamp => send reminder to sender for cancellation
      const { senderToChainsfer, reminder } = item
      if (senderToChainsfer.txState !== 'Confirmed') {
        // this should not happen by the definition of inEscrow value
        console.warn('senderToChainsfer tx is not confirmed')
      }
      const expirationTime = senderToChainsfer.txTimestamp + expirationLength
      if (expirationTime >= timestamp) {
        // case 1, not expired
        await email.receiverReminderAction(item)
        await dynamoDBTxOps.updateReminderToReceiver(item.transferId)
        console.log(`For tarnsfer ${item.transferId}, remiander is sent to receiver`)
      } else {
        // case 2, expired
        if (reminder) {
          if (reminder.reminderToSenderCount === 0) {
            // just expired, sent expiration notice to both
            // sender and receiver
            await insertExpiredState(item.transferId)
            await email.expireAction(item)
            console.log(
              `For tarnsfer ${item.transferId}, expiration notice is sent to sender and receiver`
            )
          } else if (reminder.reminderToSenderCount <= 1) {
            // has already expired, send notice to sender to cancel the transfer
            // max one notifications
            await email.senderReminderAction(item)
            await dynamoDBTxOps.updateReminderToSender(item.transferId)
            console.log(`For tarnsfer ${item.transferId}, expiration remiander is sent to sender`)
          }
        } else {
          console.warn(`Reminder is null for transfer ${item.transferId}`)
        }
      }
    }
    callback(null, 'message')
  } catch (err) {
    callback(err)
  }
}
