// @flow
import type { Context, Callback } from 'flow-aws-lambda'
import type { CryptoType } from './typeConst'
import type {
  WalletLastUsedAddressType,
  WalletAddressDataType,
  TxStateType,
  TransferDataType,
  SendTransferParamsType,
  SendTransferReturnType,
  ReceiveTransferParamsType,
  ReceiveTransferReturnType,
  CancelTransferParamsType,
  CancelTransferReturnType
} from './transfer.flow'
import type {
  TransferDataEmailCompatibleType,
  TemplateType,
  SendTemplatedEmailReturnType
} from './email.flow'
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

if (!process.env.TRANSACTION_DATA_TABLE_NAME)
  throw new Error('TRANSACTION_DATA_TABLE_NAME missing')
const transactionDataTableName = process.env.TRANSACTION_DATA_TABLE_NAME

if (!process.env.SQS_NAME) throw new Error('SQS_NAME missing')
const sqsName = process.env.SQS_NAME

if (!process.env.ENV_VALUE) throw new Error('ENV_VALUE missing')
const deploymentStage = process.env.ENV_VALUE.toLowerCase()

const expirationLength =
  Config.ExpirationLengthConfig[deploymentStage] || Config.ExpirationLengthConfig['default']
const reminderInterval =
  Config.ReminderIntervalConfig[deploymentStage] || Config.ReminderIntervalConfig['default']

const ethProvider = Config.EthTxAPIConfig[deploymentStage] || Config.EthTxAPIConfig['default']
const btcApiURL = Config.BtcAPIConfig[deploymentStage] || Config.BtcAPIConfig['default']

async function checkEthTxConfirmation (txHash: string): Promise<number> {
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

async function checkBtcTxConfirmation (txHash: string): Promise<number> {
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

async function checkLibraTxConfirmation (txHash: string): Promise<number> {
  // libra tx is almost instant
  return 1
}

async function processTxConfirmation (
  retryCount: number,
  checkFunction: (txHash: string) => Promise<number>,
  cryptoType: CryptoType,
  txHash: string,
  gasTxHash: ?string,
  txHashConfirmed: number,
  gasTxHashConfirmed: number,
  item: TransferDataType,
  messageBody: string
) {
  try {
    const maxRetry = Config.TxConfirmationConfig[cryptoType].maxRetry
    if (retryCount <= maxRetry) {
      if (txHash !== null && txHashConfirmed === 0) {
        txHashConfirmed = await checkFunction(txHash)
        console.log(
          'For %s, checking confirmation with RetryCount %d: transaction txHash %s (status: %d)',
          cryptoType,
          retryCount,
          txHash,
          txHashConfirmed
        )
      }
      if (gasTxHash && gasTxHashConfirmed === 0) {
        gasTxHashConfirmed = await checkFunction(gasTxHash)
        console.log(
          'For %s, checking confirmation with RetryCount %d: transaction gasTxHash %s (status: %d)',
          cryptoType,
          retryCount,
          gasTxHash,
          gasTxHashConfirmed
        )
      }
      if (txHashConfirmed + gasTxHashConfirmed < 2) {
        await sendMessageBackToSQS(
          messageBody,
          retryCount,
          txHashConfirmed,
          gasTxHashConfirmed,
          cryptoType
        )
      } else {
        await updateTxState('Confirmed', item)
        if (item.transferStage != 'SenderToReceiver') {
          // only send email for email transfer
          // stage == SenderToReceiver indicates a direct
          // transfer
          await sendEmail(item)
        }
        if (item.transferStage === 'SenderToChainsfer') {
          await dynamoDBTxOps.updateReminderToReceiver(item.transferId)
        }
        console.log(
          'For %s, suceeded to confirm with RetryCount %d: transaction txHash %s and gasTxHash %s',
          cryptoType,
          retryCount,
          txHash,
          gasTxHash
        )
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

async function updateTxState (state: string, item: TransferDataType) {
  const ts = moment().unix()
  const transferStage = item.transferStage
  let inEscrow = item.inEscrow
  let expiresAt = item.expiresAt

  if (state === 'Confirmed') {
    if (transferStage === 'SenderToChainsfer') {
      // funds sucessfully received by the email
      inEscrow = 1
      // update expiration time
      expiresAt = ts + expirationLength
    } else if (transferStage === 'ChainsferToSender' || transferStage === 'ChainsferToReceiver') {
      // funds sucessfully received or returned
      inEscrow = 0
    }
  }

  let params
  if (transferStage != 'SenderToReceiver') {
    // regular transfer
    params = {
      TableName: transactionDataTableName,
      Key: {
        transferId: item.transferId
      },
      UpdateExpression:
        'SET #stcTx.#state = :stcTxState, #upt = :up,' +
        ' #inEscrow = :inEscrow, #re.#nrt = :nrt, #expiresAt = :expiresAt',
      ExpressionAttributeNames: {
        '#stcTx': utils.lowerCaseFirstLetter(transferStage),
        '#state': 'txState',
        '#inEscrow': 'inEscrow',
        '#upt': 'updated',
        '#re': 'reminder',
        '#nrt': 'nextReminderTimestamp',
        '#expiresAt': 'expiresAt'
      },
      ExpressionAttributeValues: {
        ':stcTxState': state,
        ':inEscrow': inEscrow,
        ':up': ts,
        ':nrt': ts + reminderInterval,
        ':expiresAt': expiresAt
      }
    }
  } else {
    // direct transfer
    params = {
      TableName: transactionDataTableName,
      Key: {
        transferId: item.transferId
      },
      UpdateExpression: 'SET #strTx.#state = :strTxState, #upt = :up',
      ExpressionAttributeNames: {
        '#strTx': utils.lowerCaseFirstLetter(transferStage),
        '#state': 'txState',
        '#upt': 'updated'
      },
      ExpressionAttributeValues: {
        ':strTxState': state,
        ':up': ts
      }
    }
  }

  try {
    await ddb.update(params).promise()
    console.log('txState is updated successfully with State ', state)
  } catch (err) {
    throw new Error('Unable to update txState. Error: ' + err.message)
  }
}

async function sendMessageBackToSQS (
  messageBody: string,
  retryCount: number,
  txHashConfirmed: number,
  gasTxHash: number,
  cryptoType: string
) {
  const delaySeconds = Config.TxConfirmationConfig[cryptoType].delaySeconds
  const params = {
    DelaySeconds: delaySeconds,
    MessageBody: messageBody,
    QueueUrl: Config.QueueURLPrefix + sqsName,
    MessageAttributes: {
      RetryCount: {
        DataType: 'Number',
        StringValue: retryCount.toString()
      },
      TxHashConfirmed: {
        DataType: 'Number',
        StringValue: txHashConfirmed.toString()
      },
      GasTxHashConfirmed: {
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

async function deleteMessageFromSQS (receiptHandle: string) {
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

type SqsMessageType = {
  MessageId: string,
  ReceiptHandle: string,
  Body: string,
  MessageAttributes: {
    RetryCount: {
      DataType: string,
      StringValue: string
    },
    TxHashConfirmed: {
      DataType: string,
      StringValue: string // O means False, 1 means true
    },
    GasTxHashConfirmed: {
      DataType: string,
      StringValue: string // O means False, 1 means true
    }
  }
}

async function receiveMessagesFromSQS (): Promise<{ Messages: Array<SqsMessageType> }> {
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

async function sendEmail (item: TransferDataType): Promise<Array<SendTemplatedEmailReturnType>> {
  const transferStage = item.transferStage
  switch (transferStage) {
    case 'SenderToChainsfer':
      return email.sendAction(item)
    case 'ChainsferToReceiver':
      return email.receiveAction(item)
    case 'ChainsferToSender':
      return email.cancelAction(item)
    default:
      throw new Error(`Invalid transferStage ${transferStage}`)
  }
}

// eslint-disable-next-line flowtype/no-weak-types
exports.handler = async (event: any, context: Context, callback: Callback) => {
  let data = await receiveMessagesFromSQS()
  if (data.Messages) {
    let messages = data.Messages
    for (let index = 0; index < messages.length; index++) {
      const record = messages[index]
      const messageBody = record.Body
      const item: TransferDataType = JSON.parse(messageBody)
      console.log('Message Id', record.MessageId)
      try {
        const retryCount = parseInt(record.MessageAttributes.RetryCount.StringValue) + 1
        let txHashConfirmed = parseInt(record.MessageAttributes.TxHashConfirmed.StringValue)
        let gasTxHashConfirmed = parseInt(record.MessageAttributes.GasTxHashConfirmed.StringValue)

        const transferStage = item.transferStage
        const transferStageMetaData = item[utils.lowerCaseFirstLetter(transferStage)]
        const txHash = transferStageMetaData.txHash

        await deleteMessageFromSQS(record.ReceiptHandle)

        if (txHash === null) {
          throw new Error('Null txHash for record ' + JSON.stringify(record, null, 2))
        }

        let gasTxHash = null
        if (transferStageMetaData.gasTxHash != null) {
          gasTxHash = transferStageMetaData.gasTxHash
        }

        const cryptoType: string = item.cryptoType
        if (cryptoType === 'bitcoin') {
          await processTxConfirmation(
            retryCount,
            checkBtcTxConfirmation,
            cryptoType,
            txHash,
            null,
            txHashConfirmed,
            1,
            item,
            messageBody
          )
        } else if (cryptoType === 'ethereum' || Config.ERC20Tokens[cryptoType]) {
          await processTxConfirmation(
            retryCount,
            checkEthTxConfirmation,
            cryptoType,
            txHash,
            null,
            txHashConfirmed,
            1,
            item,
            messageBody
          )
        } else {
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
