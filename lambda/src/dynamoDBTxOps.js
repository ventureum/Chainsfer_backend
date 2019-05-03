// @flow
import type { CryptoType, WalletType } from './typeConst'
var moment = require('moment')
var UUID = require('uuid/v4')
var AWS = require('aws-sdk')
AWS.config.update({ region: 'us-east-1' })
var documentClient = new AWS.DynamoDB.DocumentClient()

async function getLastUsedAddress (walletAddressTableName: string, googleId: string) {
  const params = {
    TableName: walletAddressTableName,
    Key: {
      'googleId': googleId
    }
  }
  let data = await documentClient.get(params).promise()
  return data.Item
}

async function setLastUsedAddress (walletAddressTableName: string, googleId: string, walletType: WalletType, cryptoType: CryptoType, address: string) {
  const timestamp = moment().unix().toString()

  const wallet : { [key: string] : string } = {
    'address': address,
    'timestamp': timestamp
  }

  let params : { [key: string] : any } = {
    TableName: walletAddressTableName
  }

  params['Item'] = await getLastUsedAddress(walletAddressTableName, googleId)
  if (!params['Item']) {
    params['Item'] = {
      'googleId': googleId
    }
  }

  if (!params['Item'][walletType]) {
    params['Item'][walletType] = {}
  }
  params['Item'][walletType][cryptoType] = wallet
  params['Item']['lastUpdatedWalletType'] = walletType
  params['Item']['lastUpdatedCryptoType'] = cryptoType

  await documentClient.put(params).promise()
}

async function batchQueryTransfersByIds (transActionDataTableName: string, ids: Array<string>, forReceiver: boolean) {
  let items = []
  for (let index = 0; index < ids.length; index++) {
    const id = ids[index]
    let item
    if (forReceiver === false) {
      item = await getTransferByTransferId(transActionDataTableName, id)
    } else {
      item = await getTransferByReceivingId(transActionDataTableName, id)
    }
    items.push(formatQueriedTransfer(item, forReceiver))
  }
  return items
}

async function getTransferByReceivingId (transActionDataTableName: string, receivingId: string) {
  const params = {
    TableName: transActionDataTableName,
    IndexName: 'receivingId-index',
    KeyConditionExpression: 'receivingId = :rid',
    ExpressionAttributeValues: {
      ':rid': receivingId
    }
  }
  let data = await documentClient.query(params).promise()
  return data.Items[0]
}

async function getTransferByTransferId (transActionDataTableName: string, transferId: string) {
  const params = {
    TableName: transActionDataTableName,
    Key: {
      'transferId': transferId
    }
  }
  let data = await documentClient.get(params).promise()
  return data.Item
}

function formatQueriedTransfer (item, forReceiver) {
  const senderToChainsfer = item.senderToChainsfer
  const chainsferToReceiver = item.chainsferToReceiver
  const chainsferToSender = item.chainsferToSender

  let result : { [key: string] : ?string } = {
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

  if (forReceiver === true) {
    result.receivingId = item.receivingId
    result.sendingId = null
  }
  return result
}

async function getTransfer (transActionDataTableName: string, sendingId: string, receivingId: string) {
  let rv = sendingId ? (await getTransferByTransferId(transActionDataTableName, sendingId)) : (await getTransferByReceivingId(transActionDataTableName, receivingId))
  return sendingId ? formatQueriedTransfer(rv, false) : formatQueriedTransfer(rv, true)
}

async function getBatchTransfers (transActionDataTableName: string, sendingIds: Array<string>, receivingIds: Array<string>) {
  let rv = sendingIds ? (await batchQueryTransfersByIds(transActionDataTableName, sendingIds, false)) : (await batchQueryTransfersByIds(transActionDataTableName, receivingIds, true))
  return rv
}

async function sendTransfer (transActionDataTableName: string, clientId: string, sender: string, destination: string, transferAmount: string, cryptoType: CryptoType, data: string, sendTxHash: string, password: string) {
  const timestamp = moment().unix().toString()
  const transferId = UUID()
  const receivingId = UUID()

  let senderToChainsfer: { [key: string] : string } = {
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
    TableName: transActionDataTableName,
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
  let result: { [key: string] : string} = {
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

async function receiveTransfer (transActionDataTableName: string, receivingId: string, receiveTxHash: string) {
  let transfer = await getTransferByReceivingId(transActionDataTableName, receivingId)
  const receiveTimestamp = moment().unix().toString()
  const params = {
    TableName: transActionDataTableName,
    Key: {
      'transferId': transfer.transferId
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

  let result : { [key: string] : string } = {
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

async function cancelTransfer (transActionDataTableName: string, transferId: string, cancelTxHash: string) {
  const cancelTimestamp = moment().unix().toString()
  const params = {
    TableName: transActionDataTableName,
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

  let result: { [key: string] : string } = {
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

async function validateExpiration (transActionDataTableName: string, expirationLength: number) {
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
    TableName: transActionDataTableName
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
  getBatchTransfers: getBatchTransfers,
  validateExpiration: validateExpiration,
  setLastUsedAddress: setLastUsedAddress,
  getLastUsedAddress: getLastUsedAddress
}
