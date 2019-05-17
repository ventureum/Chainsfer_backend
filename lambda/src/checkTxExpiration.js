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

const reminderInterval = Config.ReminderIntervalConfig[deploymentStage] || Config.ReminderIntervalConfig['default']

async function insertExpiredState (transferId) {
  const ts = moment().unix().toString()
  const params = {
    TableName: transactionDataTableName,
    Key: {
      'transferId': transferId
    },
    ConditionExpression: '(attribute_not_exists(#ctr) or (attribute_exists(#ctr.#txState) and #ctr.#txState = :expired)) and attribute_not_exists(#cts)  and #stcTx.#txState = :confirmed',
    UpdateExpression: 'SET #ctr = :ctr, #upt = :upt, #re.#rtsc = #re.#rtsc + :inc',
    ExpressionAttributeNames: {
      '#ctr': 'chainsferToReceiver',
      '#cts': 'chainsferToSender',
      '#stcTx': 'senderToChainsfer',
      '#txState': 'txState',
      '#upt': 'updated',
      '#re': 'reminder',
      '#rtsc': 'reminderToSenderCount'
    },
    ExpressionAttributeValues: {
      ':ctr': {
        'txState': 'Expired',
        'txTimestamp': ts
      },
      ':expired': 'Expired',
      ':confirmed': 'Confirmed',
      ':upt': ts,
      ':inc': 1
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
  const timestamp = moment().unix()
  let potentialExpirationRemainderList = await dynamoDBTxOps.collectPotentialExpirationRemainderList(transactionDataTableName)
  console.log(potentialExpirationRemainderList)
  for (let index = 0; index < potentialExpirationRemainderList.length; index++) {
    // conditions to send remiander for expirations:
    // (1) ChainsferToSender does not exist
    // (2) ChainsferToReceiver does not exist or is in Expired state
    // (3) timestamp >= reminder.ExpirationTime
    // (4) Floor((timestamp - reminder.ExpirationTime) / reminderInterval) + 1 > reminder.reminderToSenderCount
    //
    // collectPotentialExpirationRemainderList has satisfied (1) - (3), so only (4) is cheked here
    const item = potentialExpirationRemainderList[index]
    const reminderToSenderCount = item.reminder.reminderToSenderCount
    if (Math.floor((timestamp - item.reminder.expirationTime) / reminderInterval) + 1 > reminderToSenderCount) {
      const str = `For tarnsfer ${item.transferId}, expiration remiander is sent to sender`
      console.log(str)
      await insertExpiredState(item.transferId)
      await email.expireAction(
        ses,
        item.transferId,
        item.receivingId,
        item.sender,
        item.receiver,
        item.transferAmount,
        item.cryptoType,
        reminderToSenderCount === 0
      )
    }
  }

  let potentialReceiverRemainderList = await dynamoDBTxOps.collectPotentialReceiverRemainderList(transactionDataTableName)
  for (let index = 0; index < potentialReceiverRemainderList.length; index++) {
    // conditions to send remiander to receiver:
    // (1) ChainsferToSender dose not exist
    // (2) ChainsferToReceiver dose not exist
    // (3) timestamp < reminder.ExpirationTime
    // (4) reminder.availableReminderToReceiver > 0
    // (5) Floor((timestamp - created) / reminderInterval) + 1 > reminder.reminderToReceiverCount
    //
    // collectPotentialReceiverRemainderList has satisfied (1)-(4), so only (5) is cheked here
    const item = potentialReceiverRemainderList[index]
    const reminderToReceiverCount = item.reminder.reminderToReceiverCount
    if (reminderToReceiverCount > 0 && Math.floor((timestamp - item.created) / reminderInterval) + 1 > reminderToReceiverCount) {
      const str = `For tarnsfer ${item.transferId}, remiander is sent to receiver`
      console.log(str)
      await email.receiverReminderAction(
        ses,
        item.transferId,
        item.receivingId,
        item.sender,
        item.receiver,
        item.transferAmount,
        item.cryptoType,
        item.senderToChainsfer.txHash,
        item.created
      )
      await dynamoDBTxOps.updateReminderToReceiver(transactionDataTableName, item.transferId)
    }
  }
  callback(null, 'message')
}
