var moment = require('moment')
var UUID = require('uuid/v4')
var AWS = require('aws-sdk')
AWS.config.update({ region: 'us-east-1' })
var documentClient = new AWS.DynamoDB.DocumentClient()

async function queryTransferIdByReceivingId (tableName, receivingId) {
  const params = {
    TableName: tableName,
    IndexName: 'receivingId-index',
    KeyConditionExpression: 'receivingId = :rid',
    ExpressionAttributeValues: {
      ':rid': receivingId
    }
  }
  let data = await documentClient.query(params).promise()
  return data.Items[0].transferId
}

async function sendTransfer (tableName, clientId, sender, destination, transferAmount, cryptoType, data, sendTxHash, password) {
  const timestamp = moment().unix().toString()
  const transferId = UUID()
  const receivingId = UUID()

  let senderToChainsfer = {
    'txState': 'Pending',
    'txTimestamp': timestamp
  }

  if (Array.isArray(sendTxHash)) {
    if (sendTxHash.length === 2) {
      senderToChainsfer.txHash = sendTxHash[0]
      senderToChainsfer.gasTxHash = sendTxHash[1]
    } else if (sendTxHash.length === 1) {
      senderToChainsfer.txHash = sendTxHash[0]
    } else {
      throw new Error('sendTxHash array length is limited to 1 or 2')
    }
  } else {
    senderToChainsfer.txHash = sendTxHash
  }

  const params = {
    TableName: tableName,
    Item: {
      'clientId': clientId,
      'transferId': transferId,
      'receivingId': receivingId,
      'created': timestamp,
      'updated': timestamp,
      'transferStage': 'SenderToChainsfer',
      'sender': sender,
      'receiver': destination,
      'transferAmount': transferAmount,
      'cryptoType': cryptoType,
      'data': data,
      'password': password,
      'senderToChainsfer': senderToChainsfer
    }
  }
  await documentClient.put(params).promise()

  console.log('sendTransfer: transferId %s, receivingId %s', transferId, receivingId)
  let result = {
    sender: sender,
    destination: destination,
    transferAmount: transferAmount,
    cryptoType: cryptoType,
    sendingId: transferId,
    sendTxHash: sendTxHash,
    sendTimestamp: timestamp
  }

  if (senderToChainsfer.gasTxHash != null) {
    result.gasTxHash = senderToChainsfer.gasTxHash
  }
  return result
}

async function receiveTransfer (tableName, receivingId, receiveTxHash) {
  let transferId = await queryTransferIdByReceivingId(receivingId)
  const receiveTimestamp = moment().unix().toString()
  const params = {
    TableName: tableName,
    Key: {
      'transferId': transferId
    },
    ConditionExpression: 'attribute_not_exists(#ctr) and attribute_not_exists(#cts) and #stcTx.#stcTxSate = :stcTxSate',
    UpdateExpression: 'SET #ctr = :ctr, #tstage = :tstage, #upt = :upt',
    ExpressionAttributeNames: {
      '#ctr': 'chainsferToReceiver',
      '#cts': 'chainsferToSender',
      '#stcTx': 'senderToChainsfer',
      '#stcTxSate': 'txState',
      '#tstage': 'transferStage',
      '#upt': 'updated'
    },
    ExpressionAttributeValues: {
      ':ctr': {
        'txHash': receiveTxHash,
        'txState': 'Pending',
        'txTimestamp': receiveTimestamp
      },
      ':stcTxSate': 'Confirmed',
      ':tstage': 'ChainsferToReceiver',
      ':upt': receiveTimestamp
    },
    ReturnValues: 'ALL_NEW'
  }

  let data = await documentClient.update(params).promise()
  const attributes = data.Attributes
  const senderToChainsfer = attributes.senderToChainsfer

  let result = {
    sender: attributes.sender,
    destination: attributes.receiver,
    transferAmount: attributes.transferAmount,
    cryptoType: attributes.cryptoType,
    sendTxHash: senderToChainsfer.txHash,
    sendTimestamp: senderToChainsfer.txTimestamp,
    receivingId: receivingId,
    receiveTxHash: receiveTxHash,
    receiveTimestamp: receiveTimestamp
  }

  if (senderToChainsfer.gasTxHash != null) {
    result.gasTxHash = senderToChainsfer.gasTxHash
  }
  return result
}

async function cancelTransfer (tableName, transferId, cancelTxHash) {
  const cancelTimestamp = moment().unix().toString()
  const params = {
    TableName: tableName,
    Key: {
      'transferId': transferId
    },
    ConditionExpression: 'attribute_not_exists(#ctr) and attribute_not_exists(#cts) and #stcTx.#stcTxSate = :stcTxSate',
    UpdateExpression: 'SET #cts = :cts, #tstage = :tstage, #upt = :upt',
    ExpressionAttributeNames: {
      '#ctr': 'chainsferToReceiver',
      '#cts': 'chainsferToSender',
      '#stcTx': 'senderToChainsfer',
      '#stcTxSate': 'txState',
      '#tstage': 'transferStage',
      '#upt': 'updated'
    },
    ExpressionAttributeValues: {
      ':cts': {
        'txHash': cancelTxHash,
        'txState': 'Pending',
        'txTimestamp': cancelTimestamp
      },
      ':stcTxSate': 'Confirmed',
      ':tstage': 'ChainsferToSender',
      ':upt': cancelTimestamp
    },
    ReturnValues: 'ALL_NEW'
  }

  let data = await documentClient.update(params).promise()
  const attributes = data.Attributes
  const senderToChainsfer = attributes.senderToChainsfer

  let result = {
    sender: attributes.sender,
    destination: attributes.receiver,
    transferAmount: attributes.transferAmount,
    cryptoType: attributes.cryptoType,
    sendingId: transferId,
    sendTxHash: senderToChainsfer.txHash,
    sendTimestamp: senderToChainsfer.txTimestamp,
    cancelTxHash: cancelTxHash,
    cancelTimestamp: cancelTimestamp
  }

  if (senderToChainsfer.gasTxHash != null) {
    result.gasTxHash = senderToChainsfer.gasTxHash
  }
  return result
}

async function getTransfer (tableName, sendingId, receivingId) {
  let rv = sendingId ? (await getTransferByTransferId(tableName, sendingId)) : (await getTransferByReceivingId(tableName, receivingId))
  return rv
}

async function getTransferByTransferId (tableName, transferId) {
  const params = {
    TableName: tableName,
    Key: {
      'transferId': transferId
    }
  }
  let data = await documentClient.get(params).promise()
  const item = data.Item
  const senderToChainsfer = item.senderToChainsfer
  const chainsferToReceiver = item.chainsferToReceiver
  const chainsferToSender = item.chainsferToSender

  let result = {
    'sendingId': item.transferId,
    'sender': item.sender,
    'destination': item.receiver,
    'transferAmount': item.transferAmount,
    'cryptoType': item.cryptoType,
    'data': item.data,
    'sendTxHash': senderToChainsfer.txHash,
    'sendTimestamp': senderToChainsfer.txTimestamp,
    'sendTxState': senderToChainsfer.txState,
    'receiveTxHash': chainsferToReceiver ? chainsferToReceiver.txHash : null,
    'receiveTimestamp': chainsferToReceiver ? chainsferToReceiver.txTimestamp : null,
    'receiveTxState': chainsferToReceiver ? chainsferToReceiver.txState : null,
    'cancelTxHash': chainsferToSender ? chainsferToSender.txHash : null,
    'cancelTimestamp': chainsferToSender ? chainsferToSender.txTimestamp : null,
    'cancelTxState': chainsferToSender ? chainsferToSender.txState : null
  }

  if (senderToChainsfer.gasTxHash != null) {
    result.gasTxHash = senderToChainsfer.gasTxHash
  }
  return result
}

async function getTransferByReceivingId (tableName, receivingId) {
  let transferId = await queryTransferIdByReceivingId(tableName, receivingId)
  let data = await getTransferByTransferId(transferId)
  data.sendingId = null
  data.receivingId = receivingId
  return data
}

async function validateExpiration (tableName, expirationLength) {
  const timestamp = moment().unix()

  const params = {
    ExpressionAttributeValues: {
      ':tdelta': (timestamp - expirationLength).toString(),
      ':confirmed': 'Confirmed'
    },
    ExpressionAttributeNames: {
      '#ctrTx': 'chainsferToReceiver',
      '#ctsTx': 'chainsferToSender',
      '#stcTx': 'senderToChainsfer',
      '#txState': 'txState',
      '#crt': 'created'
    },
    FilterExpression: '#stcTx.#txState = :confirmed and attribute_not_exists(#ctrTx) and attribute_not_exists(#ctsTx) and (#crt < :tdelta)',
    TableName: tableName
  }

  try {
    let response = await documentClient.scan(params).promise()
    console.log('Scaned table successfully with valid count %d and total ScannedCount %s', response.Count, response.ScannedCount)
    return response.Items
  } catch (err) {
    throw new Error('Unable to scaned table . Error: ' + err.message)
  }
}

module.exports = {
  sendTransfer: sendTransfer,
  cancelTransfer: cancelTransfer,
  receiveTransfer: receiveTransfer,
  getTransfer: getTransfer,
  validateExpiration: validateExpiration
}
