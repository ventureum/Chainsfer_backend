var AWS = require('aws-sdk')
AWS.config.update({ region: 'us-east-1' })
var ddb = new AWS.DynamoDB.DocumentClient({ region: 'us-east-1' })
var email = require('./email.js')
var ses = new AWS.SES({ apiVersion: '2010-12-01' })
var sqs = new AWS.SQS({ region: 'us-east-1' })
var moment = require('moment')
var blockexplorer = require('blockchain.info/blockexplorer')
var ethers = require('ethers')
var ethProvider = ethers.getDefaultProvider('rinkeby')
var utils = require('./utils.js')
var Config = require('./config.js')
const tableName = process.env.TABLE_NAME;
const sqsName = process.env.SQS_NAME;

async function checkEthTxConfirmation (txHash) {
  let transactionReceipt = await ethProvider.getTransactionReceipt(txHash)
  if (transactionReceipt !== null && transactionReceipt.status === 1) {
    return 1
  }
  return 0
}

async function checkBtcTxConfirmation (txHash) {
  let transactionReceipt = await blockexplorer.getTx(txHash)
  if (transactionReceipt.block_height !== undefined) {
    return 1
  }
  return 0
}

async function processTxConfirmation (retryCount, checkFunction, cryptoType, txHash, gasTxHash, txHashConfirmed, gasTxHashConfirmed, item, messageBody) {
  try {
    const maxRetry = Config.TxConfirmationConfig[cryptoType].maxRetry
    if (retryCount <= maxRetry) {
      if (txHash !== null && txHashConfirmed === 0) {
        txHashConfirmed =  await checkFunction(txHash)
        console.log('For %s, checking confirmation with RetryCount %d: transaction txHash %s (status: %d)',
          cryptoType, retryCount, txHash, txHashConfirmed)
      }
      if (gasTxHash !== null && gasTxHashConfirmed === 0) {
        gasTxHashConfirmed =  await checkFunction(gasTxHash)
        console.log('For %s, checking confirmation with RetryCount %d: transaction gasTxHash %s (status: %d)',
          cryptoType, retryCount, gasTxHash, gasTxHashConfirmed)
      }
      if (txHashConfirmed + gasTxHashConfirmed < 2) {
        await sendMessageBackToSQS(messageBody, retryCount, txHashConfirmed, gasTxHashConfirmed, cryptoType)
      } else {
        await updateTxState('Confirmed', item)
        const result = await sendEmail(item)
        console.log('For %s, suceeded to confirm with RetryCount %d: transaction txHash %s and gasTxHash %s',
          cryptoType, retryCount, txHash, gasTxHash)
      }
    } else {
      const errStr = `For ${cryptoType}, failed to confirm within the given RetryCount ${maxRetry}: transaction txHash ${txHash} (status:  ${txHashConfirmed}) and gasTxHash  ${gasTxHash} (status:  ${gasTxHashConfirmed})`
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
    TableName: tableName,
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
    console.log('txState is updated successfully')
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

async function sendEmail (item) {
  const transferStage = item.transferStage.S
  switch (transferStage) {
    case 'SenderToChainsfer':
      return email.sendAction(
        ses,
        item.transferId.S,
        item.receivingId.S,
        item.sender.S,
        item.receiver.S,
        item.transferAmount.S,
        item.cryptoType.S,
        item.senderToChainsfer.M.txHash.S,
        item.created.S,
        item.password.S
      )
    case 'ChainsferToReceiver':
      return email.receiveAction(
        ses,
        item.transferId.S,
        item.receivingId.S,
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

exports.handler = async (event, context, callback) => {
  for (let index = 0; index < event.Records.length; index++) {
    const record = event.Records[index]
    const messageBody = record.body
    const item = JSON.parse(messageBody)
    console.log('Message Id', record.messageId)
    try {
      const retryCount = parseInt(record.messageAttributes.RetryCount.stringValue) + 1
      let txHashConfirmed = parseInt(record.messageAttributes.TxHashConfirmed.stringValue)
      let gasTxHashConfirmed = parseInt(record.messageAttributes.GasTxHashConfirmed.stringValue)

      const transferStage = item.transferStage.S
      const transferStageMetaData = item[utils.lowerCaseFirstLetter(transferStage)].M
      const txHash = transferStageMetaData.txHash.S
  
      await deleteMessageFromSQS(record.receiptHandle) 
  
      if (txHash === null) {
        throw new Error('Null txHash for record ' + JSON.stringify(record, null, 2))
      }
  
      let gasTxHash = null
      if (transferStageMetaData.gasTxHash != null) {
        gasTxHash = transferStageMetaData.gasTxHash.S
      }
    
      const cryptoType = item.cryptoType.S
      switch (cryptoType) {
        case 'bitcoin':
          await processTxConfirmation(retryCount, checkBtcTxConfirmation, cryptoType, txHash, null, txHashConfirmed, 1, item, messageBody)
          break
        case 'ethereum':
          await processTxConfirmation(retryCount, checkEthTxConfirmation, cryptoType, txHash, null, txHashConfirmed, 1, item, messageBody)
          break
        default: // ERC20
          if (gasTxHash === null) {
            throw new Error('Null gasTxHash for record ' + JSON.stringify(record, null, 2))
          }
          await processTxConfirmation(retryCount, checkEthTxConfirmation, cryptoType, txHash, gasTxHash, txHashConfirmed, gasTxHashConfirmed, item, messageBody)
      }
    } catch (err) {
      await updateTxState('Failed', item)
      console.error('Failed to validate Tx Confirmation with error: ' +  err.message)
    }
  }
  callback(null, 'message')
}
