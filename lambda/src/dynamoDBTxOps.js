// @flow
import type { CryptoType, WalletType } from './typeConst'
var moment = require('moment')
var UUID = require('uuid/v4')
var AWS = require('aws-sdk')
AWS.config.update({ region: 'us-east-1' })
var documentClient = new AWS.DynamoDB.DocumentClient()
const { OAuth2Client } = require('google-auth-library')

async function verifyGoogleIdToken (clientId: string, idToken: string) {
  try {
    const client = new OAuth2Client(clientId)
    const ticket = await client.verifyIdToken({
      idToken: idToken,
      audience: clientId
    })
    const payload = ticket.getPayload()
    return payload['sub']
  } catch (err) {
    console.error('Failed to verify Id Token: ' + err.message)
    throw new Error('Failed to verify Id Token')
  }
}

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
  if (!item) {
    return { 'error': 'Not Found' }
  }
  const senderToChainsfer = item.senderToChainsfer
  const chainsferToReceiver = item.chainsferToReceiver
  const chainsferToSender = item.chainsferToSender

  let result : { [key: string] : ?string } = {
    'sendingId': item.transferId,
    'senderName': item.senderName,
    'sender': item.sender,
    'destination': item.receiver,
    'transferAmount': item.transferAmount,
    'message': item.message,
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
  if (!sendingIds) sendingIds = []
  if (!receivingIds) receivingIds = []
  let sendTransfers = await batchQueryTransfersByIds(transActionDataTableName, sendingIds, false)
  let receiveTransfers = await batchQueryTransfersByIds(transActionDataTableName, receivingIds, true)
  return [...sendTransfers, ...receiveTransfers]
}

async function sendTransfer (
  transActionDataTableName: string,
  clientId: string,
  senderName: string,
  sender: string,
  destination: string,
  transferAmount: string,
  message: ?string,
  cryptoType: CryptoType,
  data: string,
  sendTxHash: string | Array < string >,
  expirationLength: number,
  reminderInterval: number
) {
  const ts = moment().unix()
  const timestamp = ts.toString()
  const transferId = UUID()
  const receivingId = UUID()

  // due to limitation of dynamodb, convert senderName is it is an empty string
  message = (message && message.length > 0) ? message : null

  let senderToChainsfer: { [key: string] : string | Array<string> } = {
    'txState': 'Pending',
    'txTimestamp': timestamp
  }

  let reminder: { [key: string] : number} = {
    'expirationTime': ts + expirationLength,
    'availableReminderToReceiver': Math.floor(expirationLength / reminderInterval),
    'reminderToSenderCount': 0,
    'reminderToReceiverCount': 0
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
      'reminder': reminder,
      'transferStage': 'SenderToChainsfer',
      'senderName': senderName,
      'sender': sender,
      'receiver': destination,
      'transferAmount': transferAmount,
      'message': message,
      'cryptoType': cryptoType,
      'data': data,
      'senderToChainsfer': senderToChainsfer
    }
  }
  await documentClient.put(params).promise()

  console.log('sendTransfer: transferId %s, receivingId %s', transferId, receivingId)
  let result: { [key: string] : ?string | Array<string> } = {
    senderName: senderName,
    sender: sender,
    destination: destination,
    transferAmount: transferAmount,
    message: message,
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
    senderName: attributes.senderName,
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
    ConditionExpression: '(attribute_not_exists(#ctr) or attribute_not_exists(#ctr.#ctrTxHash)) and attribute_not_exists(#cts) and #stcTx.#stcTxSate = :stcTxSate',
    UpdateExpression: 'SET #cts = :cts, #tstage = :tstage, #upt = :upt',
    ExpressionAttributeNames: {
      '#ctr': 'chainsferToReceiver',
      '#cts': 'chainsferToSender',
      '#stcTx': 'senderToChainsfer',
      '#stcTxSate': 'txState',
      '#ctrTxHash': 'txHash',
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
    senderName: attributes.senderName,
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

async function collectPotentialExpirationRemainderList (
  transActionDataTableName: string) {
  const timestamp = moment().unix()

  const params = {
    ExpressionAttributeValues: {
      ':ts': timestamp,
      ':confirmed': 'Confirmed',
      ':expired': 'Expired'
    },
    ExpressionAttributeNames: {
      '#ctr': 'chainsferToReceiver',
      '#cts': 'chainsferToSender',
      '#stc': 'senderToChainsfer',
      '#txState': 'txState',
      '#reminder': 'reminder',
      '#exp': 'expirationTime'
    },
    FilterExpression: '(attribute_not_exists(#ctr) or (attribute_exists(#ctr.#txState) and #ctr.#txState = :expired)) and attribute_not_exists(#cts) and (#stc.#txState = :confirmed) and (#reminder.#exp <= :ts)',
    TableName: transActionDataTableName
  }

  try {
    let response = await documentClient.scan(params).promise()
    console.log('CollectPotentialExpirationRemainderList: scaned table successfully with valid count %d and total ScannedCount %s', response.Count, response.ScannedCount)
    return response.Items
  } catch (err) {
    throw new Error('CollectPotentialExpirationRemainderList: unable to scaned table . Error: ' + err.message)
  }
}

async function collectPotentialReceiverRemainderList (transActionDataTableName: string) {
  const timestamp = moment().unix()

  const params = {
    ExpressionAttributeValues: {
      ':ts': timestamp,
      ':confirmed': 'Confirmed',
      ':zero': 0
    },
    ExpressionAttributeNames: {
      '#ctrTx': 'chainsferToReceiver',
      '#ctsTx': 'chainsferToSender',
      '#stcTx': 'senderToChainsfer',
      '#txState': 'txState',
      '#reminder': 'reminder',
      '#exp': 'expirationTime',
      '#artc': 'availableReminderToReceiver'
    },
    FilterExpression: '#stcTx.#txState = :confirmed and attribute_not_exists(#ctrTx) and attribute_not_exists(#ctsTx) and (#reminder.#exp > :ts) and (#reminder.#artc > :zero)',
    TableName: transActionDataTableName
  }

  try {
    let response = await documentClient.scan(params).promise()
    console.log('CollectReceiverRemainderList: scaned table successfully with valid count %d and total ScannedCount %s', response.Count, response.ScannedCount)
    return response.Items
  } catch (err) {
    throw new Error('CollectReceiverRemainderList: unable to scaned table . Error: ' + err.message)
  }
}

async function updateReminderToReceiver (transactionDataTableName: string, transferId: string) {
  const ts = moment().unix().toString()
  const params = {
    TableName: transactionDataTableName,
    Key: {
      'transferId': transferId
    },
    ConditionExpression: 'attribute_not_exists(#ctr) and attribute_not_exists(#cts) and #stcTx.#stcTxSate = :stcTxSate and #re.#artc > :zero',
    UpdateExpression: 'SET #upt = :upt, #re.#artc = #re.#artc - :inc, #re.#rtrc = #re.#rtrc + :inc',
    ExpressionAttributeNames: {
      '#ctr': 'chainsferToReceiver',
      '#cts': 'chainsferToSender',
      '#stcTx': 'senderToChainsfer',
      '#stcTxSate': 'txState',
      '#upt': 'updated',
      '#re': 'reminder',
      '#artc': 'availableReminderToReceiver',
      '#rtrc': 'reminderToReceiverCount'
    },
    ExpressionAttributeValues: {
      ':stcTxSate': 'Confirmed',
      ':upt': ts,
      ':inc': 1,
      ':zero': 0
    },
    ReturnValues: 'ALL_NEW'
  }
  try {
    let data = await documentClient.update(params).promise()
    console.log('ReminderToReceiver is updated successfully to be: ', data)
  } catch (err) {
    throw new Error('Unable to update ReminderToReceiver. Error: ' + err.message)
  }
}

module.exports = {
  sendTransfer: sendTransfer,
  cancelTransfer: cancelTransfer,
  receiveTransfer: receiveTransfer,
  getTransfer: getTransfer,
  getBatchTransfers: getBatchTransfers,
  setLastUsedAddress: setLastUsedAddress,
  getLastUsedAddress: getLastUsedAddress,
  collectPotentialExpirationRemainderList: collectPotentialExpirationRemainderList,
  collectPotentialReceiverRemainderList: collectPotentialReceiverRemainderList,
  updateReminderToReceiver: updateReminderToReceiver,
  verifyGoogleIdToken: verifyGoogleIdToken
}
