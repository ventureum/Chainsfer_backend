// @flow
import type { Context, Callback } from 'flow-aws-lambda'
import type { CryptoType } from './typeConst'
var AWS = require('aws-sdk')
AWS.config.update({ region: 'us-east-1' })
var ddb = new AWS.DynamoDB.DocumentClient({ region: 'us-east-1' })
var email = require('./email.js')
var ses = new AWS.SES({ apiVersion: '2010-12-01' })
var sqs = new AWS.SQS({ region: 'us-east-1' })
var moment = require('moment')
var utils = require('./utils.js')
var Config = require('./config.js')
var dynamoDBTxOps = require('./dynamoDBTxOps.js')

if (!process.env.TRANSACTION_DATA_TABLE_NAME) throw new Error('TRANSACTION_DATA_TABLE_NAME missing')
const transactionDataTableName = process.env.TRANSACTION_DATA_TABLE_NAME

if (!process.env.SQS_NAME) throw new Error('SQS_NAME missing')
const sqsName = process.env.SQS_NAME

if (!process.env.ENV_VALUE) throw new Error('ENV_VALUE missing')
const deploymentStage = process.env.ENV_VALUE.toLowerCase()

const ethProvider = Config.EthTxAPIConfig[deploymentStage] || Config.EthTxAPIConfig['default']
const btcApiURL = Config.BtcAPIConfig[deploymentStage] || Config.BtcAPIConfig['default']

async function checkEthTxConfirmation (txHash) {
  try {
    let transactionReceipt = await ethProvider.getTransactionReceipt(txHash)
    if (transactionReceipt !== null && transactionReceipt.status === 1) {
      return 1
    }
    return 0
  } catch (err) {
    throw new Error('Failed to check Eth Tx Confirmation with error: ' + err.message)
  }
}

async function checkBtcTxConfirmation (txHash) {
  try {
    let transactionReceipt = await Config.getBtcTx(txHash, btcApiURL)
    if (transactionReceipt.block_height !== undefined && transactionReceipt.block_height > 0) {
      return 1
    }
    return 0
  } catch (err) {
    throw new Error('Failed to check Btc Tx Confirmation with error: ' + err.message)
  }
}

async function checkLibraTxConfirmation (txHash) {
  // libra tx is almost instant
  return 1
}

async function processTxConfirmation (retryCount: number, checkFunction: Function, cryptoType: CryptoType, txHash: string, gasTxHash: ?string, txHashConfirmed: number, gasTxHashConfirmed: number, item: any, messageBody: any) {
  try {
    const maxRetry = Config.TxConfirmationConfig[cryptoType].maxRetry
    if (retryCount <= maxRetry) {
      if (txHash !== null && txHashConfirmed === 0) {
        txHashConfirmed = await checkFunction(txHash)
        console.log('For %s, checking confirmation with RetryCount %d: transaction txHash %s (status: %d)',
          cryptoType, retryCount, txHash, txHashConfirmed)
      }
      if (gasTxHash !== null && gasTxHashConfirmed === 0) {
        gasTxHashConfirmed = await checkFunction(gasTxHash)
        console.log('For %s, checking confirmation with RetryCount %d: transaction gasTxHash %s (status: %d)',
          cryptoType, retryCount, gasTxHash, gasTxHashConfirmed)
      }
      if (txHashConfirmed + gasTxHashConfirmed < 2) {
        await sendMessageBackToSQS(messageBody, retryCount, txHashConfirmed, gasTxHashConfirmed, cryptoType)
      } else {
        await updateTxState('Confirmed', item)
        await sendEmail(item)
        if (item.transferStage.S === 'SenderToChainsfer') {
          await dynamoDBTxOps.updateReminderToReceiver(transactionDataTableName, item.transferId.S)
        }
        console.log('For %s, suceeded to confirm with RetryCount %d: transaction txHash %s and gasTxHash %s',
          cryptoType, retryCount, txHash, gasTxHash)
      }
    } else {
      let errStr
      if (gasTxHash != null) {
        errStr = `For ${cryptoType}, failed to confirm within the given RetryCount ${maxRetry}: transaction txHash ${txHash} (status:  ${txHashConfirmed}) and gasTxHash  ${gasTxHash} (status:  ${gasTxHashConfirmed})`
      } else {
        errStr = `For ${cryptoType}, failed to confirm within the given RetryCount ${maxRetry}: transaction txHash ${txHash} (status:  ${txHashConfirmed})`
      }
      throw new Error(errStr)
    }
  } catch (err) {
    throw new Error('Failed to process Tx Confirmation with error: ' + err.message)
  }
}

async function updateTxState (state, item) {
  const ts = moment().unix().toString()
  const transferStage = item.transferStage.S
  const params = {
    TableName: transactionDataTableName,
    Key: {
      'transferId': item.transferId.S
    },
    UpdateExpression: 'SET #stcTx.#state = :stcTxState, #upt = :up, #stcTx.#ts = :ts',
    ExpressionAttributeNames: {
      '#stcTx': utils.lowerCaseFirstLetter(transferStage),
      '#state': 'txState',
      '#ts': 'txTimestamp',
      '#upt': 'updated'
    },
    ExpressionAttributeValues: {
      ':stcTxState': state,
      ':up': ts,
      ':ts': ts
    }
  }

  try {
    await ddb.update(params).promise()
    console.log('txState is updated successfully with State ', state)
  } catch (err) {
    throw new Error('Unable to update txState. Error: ' + err.message)
  }
}

async function sendMessageBackToSQS (messageBody, retryCount, txHashConfirmed, gasTxHash, cryptoType) {
  const delaySeconds = Config.TxConfirmationConfig[cryptoType].delaySeconds
  const params = {
    DelaySeconds: delaySeconds,
    MessageBody: messageBody,
    QueueUrl: Config.QueueURLPrefix + sqsName,
    MessageAttributes: {
      'RetryCount': {
        DataType: 'Number',
        StringValue: retryCount.toString()
      },
      'TxHashConfirmed': {
        DataType: 'Number',
        StringValue: txHashConfirmed.toString()
      },
      'GasTxHashConfirmed': {
        DataType: 'Number',
        StringValue: gasTxHash.toString()
      }
    }
  }
  try {
    let response = await sqs.sendMessage(params).promise()
    console.log('Message is sent back to SQS successfully', response)
  } catch (err) {
    throw new Error('Unable to send Message. Error: ' + err.message)
  }
}

async function deleteMessageFromSQS (receiptHandle) {
  const deleteParams = {
    QueueUrl: Config.QueueURLPrefix + sqsName,
    ReceiptHandle: receiptHandle
  }

  try {
    let response = await sqs.deleteMessage(deleteParams).promise()
    console.log('Message is deleted from SQS successfully', response)
  } catch (err) {
    throw new Error('Unable to delete message. Error: ' + err.message)
  }
}

async function receiveMessagesFromSQS () {
  const params = {
    QueueUrl: Config.QueueURLPrefix + sqsName,
    MaxNumberOfMessages: '10',
    VisibilityTimeout: '120',
    MessageAttributeNames: ['All']
  }
  try {
    let response = await sqs.receiveMessage(params).promise()
    console.log('Messages are received from SQS successfully', response)
    return response
  } catch (err) {
    throw new Error('Unable to receive message. Error: ' + err.message)
  }
}

async function sendEmail (item) {
  const transferStage = item.transferStage.S
  switch (transferStage) {
    case 'SenderToChainsfer':
      return email.sendAction(
        ses,
        item.transferId.S,
        item.receivingId.S,
        item.senderName.S,
        item.sender.S,
        item.receiver.S,
        item.transferAmount.S,
        item.cryptoType.S,
        item.senderToChainsfer.M.txHash.S,
        item.created.S
      )
    case 'ChainsferToReceiver':
      return email.receiveAction(
        ses,
        item.transferId.S,
        item.receivingId.S,
        item.senderName.S,
        item.sender.S,
        item.receiver.S,
        item.transferAmount.S,
        item.cryptoType.S,
        item.senderToChainsfer.M.txHash.S,
        item.senderToChainsfer.M.txTimestamp.S,
        item.chainsferToReceiver.M.txHash.S,
        item.chainsferToReceiver.M.txTimestamp.S
      )
    case 'ChainsferToSender':
      return email.cancelAction(
        ses,
        item.transferId.S,
        item.receivingId.S,
        item.senderName.S,
        item.sender.S,
        item.receiver.S,
        item.transferAmount.S,
        item.cryptoType.S,
        item.senderToChainsfer.M.txHash.S,
        item.senderToChainsfer.M.txTimestamp.S,
        item.chainsferToSender.M.txHash.S,
        item.chainsferToSender.M.txTimestamp.S
      )
  }
}

exports.handler = async (event: any, context: Context, callback: Callback) => {
  let data = await receiveMessagesFromSQS()
  if (data.Messages) {
    let messages = data.Messages
    for (let index = 0; index < messages.length; index++) {
      const record = messages[index]
      const messageBody = record.Body
      const item = JSON.parse(messageBody)
      console.log('Message Id', record.MessageId)
      try {
        const retryCount = parseInt(record.MessageAttributes.RetryCount.StringValue) + 1
        let txHashConfirmed = parseInt(record.MessageAttributes.TxHashConfirmed.StringValue)
        let gasTxHashConfirmed = parseInt(record.MessageAttributes.GasTxHashConfirmed.StringValue)

        const transferStage = item.transferStage.S
        const transferStageMetaData = item[utils.lowerCaseFirstLetter(transferStage)].M
        const txHash = transferStageMetaData.txHash.S

        await deleteMessageFromSQS(record.ReceiptHandle)

        if (txHash === null) {
          throw new Error('Null txHash for record ' + JSON.stringify(record, null, 2))
        }

        let gasTxHash = null
        if (transferStageMetaData.gasTxHash != null) {
          gasTxHash = transferStageMetaData.gasTxHash.S
        }

        const cryptoType: CryptoType = item.cryptoType.S
        switch (cryptoType) {
          case 'bitcoin':
            await processTxConfirmation(retryCount, checkBtcTxConfirmation, cryptoType, txHash, null, txHashConfirmed, 1, item, messageBody)
            break
          case 'ethereum':
            await processTxConfirmation(retryCount, checkEthTxConfirmation, cryptoType, txHash, null, txHashConfirmed, 1, item, messageBody)
            break
          case 'dai': // ERC20
            if (gasTxHash === null) {
              // assume gasTx is confirmed if it is null
              // necessary for validating a single erc20 tx (without prepaid eth tx)
              gasTxHashConfirmed = 1
            }
            await processTxConfirmation(retryCount, checkEthTxConfirmation, cryptoType, txHash, gasTxHash, txHashConfirmed, gasTxHashConfirmed, item, messageBody)
            break
          case 'libra':
            processTxConfirmation(retryCount, checkLibraTxConfirmation, cryptoType, txHash, null, txHashConfirmed, 1, item, messageBody)
            break
          default:
            throw new Error(`Invalid cryptoType: ${cryptoType}`)
        }
      } catch (err) {
        await updateTxState('Failed', item)
        console.error('Failed to validate Tx Confirmation with error: ' + err.message)
      }
    }
  }
  callback(null, 'message')
}
