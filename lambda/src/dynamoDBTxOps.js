// @flow
import type { CryptoType, WalletType } from './typeConst'
import type {
  WalletLastUsedAddressType,
  WalletAddressDataType,
  TransferDataType,
  SendTransferParamsType,
  SendTransferReturnType,
  ReceiveTransferParamsType,
  ReceiveTransferReturnType,
  CancelTransferParamsType,
  CancelTransferReturnType,
  GetMultiSigSigningDataParamsType,
  GetMultiSigSigningDataReturnType,
  DirectTransferParamsType,
  DirectTransferReturnType
} from './transfer.flow'
import ethMultiSig from './EthMultiSig'
import BtcMultiSig from './BtcMultiSig'
var moment = require('moment')
var UUID = require('uuid/v4')
var AWS = require('aws-sdk')
AWS.config.update({ region: 'us-east-1' })
var documentClient = new AWS.DynamoDB.DocumentClient()
var Config = require('./config.js')
var utils = require('./utils.js')
const { OAuth2Client } = require('google-auth-library')
const SimpleMultiSigContractArtifacts = require('./contracts/SimpleMultiSig.json')

if (!process.env.TRANSACTION_DATA_TABLE_NAME) throw new Error('TRANSACTION_DATA_TABLE_NAME missing')
const transActionDataTableName = process.env.TRANSACTION_DATA_TABLE_NAME

if (!process.env.WALLET_ADDRESSES_DATA_TABLE_NAME)
  throw new Error('WALLET_ADDRESSES_DATA_TABLE_NAME missing')
const walletAddressTableName = process.env.WALLET_ADDRESSES_DATA_TABLE_NAME

if (!process.env.ENV_VALUE) throw new Error('ENV_VALUE missing')
const deploymentStage = process.env.ENV_VALUE.toLowerCase()

const expirationLength =
  Config.ExpirationLengthConfig[deploymentStage] || Config.ExpirationLengthConfig['default']
const reminderInterval =
  Config.ReminderIntervalConfig[deploymentStage] || Config.ReminderIntervalConfig['default']
const googleAPIConfig = Config.GoogleAPIConfig[deploymentStage] || Config.GoogleAPIConfig['default']

// returns googleId given an idToken
async function verifyGoogleIdToken (clientId: string, idToken: string): Promise<string> {
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

async function getLastUsedAddress (params: { idToken: string }): Promise<WalletAddressDataType> {
  const googleId = await verifyGoogleIdToken(googleAPIConfig['clientId'], params.idToken)
  let data = await documentClient
    .get({
      TableName: walletAddressTableName,
      Key: {
        googleId: googleId
      }
    })
    .promise()
  return data.Item
}

async function setLastUsedAddress (params: {
  idToken: string,
  walletType: WalletType,
  cryptoType: CryptoType,
  address: string
}) {
  const googleId = await verifyGoogleIdToken(googleAPIConfig['clientId'], params.idToken)
  const timestamp = moment()
    .unix()
    .toString()

  const wallet: WalletLastUsedAddressType = {
    address: params.address,
    timestamp: timestamp
  }

  let dbParams: {
    TableName: string,
    Item: WalletAddressDataType
  } = {
    TableName: walletAddressTableName,
    Item: {
      googleId: googleId,
      lastUpdatedWalletType: '',
      lastUpdatedCryptoType: ''
    }
  }

  dbParams['Item'] = await getLastUsedAddress(params)
  if (!dbParams['Item']) {
    dbParams['Item'] = {
      googleId: googleId,
      lastUpdatedWalletType: '',
      lastUpdatedCryptoType: ''
    }
  }

  if (!dbParams['Item'][params.walletType]) {
    dbParams['Item'][params.walletType] = {}
  }
  dbParams['Item'][params.walletType][params.cryptoType] = wallet
  dbParams['Item'].lastUpdatedWalletType = params.walletType
  dbParams['Item'].lastUpdatedCryptoType = params.cryptoType
  await documentClient.put(dbParams).promise()
}

async function batchQueryTransfersByIds (
  ids: Array<string>,
  forReceiver: boolean
): Promise<Array<TransferDataType | { error: string }>> {
  let items = []
  for (let index = 0; index < ids.length; index++) {
    const id = ids[index]
    let item
    if (forReceiver === false) {
      item = await getTransferByTransferId(id)
    } else {
      item = await getTransferByReceivingId(id)
    }
    items.push(formatQueriedTransfer(item, forReceiver))
  }
  return items
}

async function getTransferByReceivingId (receivingId: string): Promise<TransferDataType> {
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

async function getTransferByTransferId (transferId: string): Promise<TransferDataType> {
  const params = {
    TableName: transActionDataTableName,
    Key: {
      transferId: transferId
    }
  }
  let data = await documentClient.get(params).promise()
  return data.Item
}

function formatQueriedTransfer (
  item: TransferDataType,
  forReceiver: boolean
): TransferDataType | { error: string } {
  if (!item) {
    return { error: 'Not Found' }
  }
  if (forReceiver === true) {
    item.receivingId = item.receivingId
    // mask out transferId for receiver
    item.transferId = ''
  }
  return item
}

async function getTransfer (params: {
  transferId: string,
  receivingId: string
}): Promise<TransferDataType | { error: string }> {
  let rv = params.transferId
    ? await getTransferByTransferId(params.transferId)
    : await getTransferByReceivingId(params.receivingId)
  return params.transferId ? formatQueriedTransfer(rv, false) : formatQueriedTransfer(rv, true)
}

async function getBatchTransfers (params: {
  transferIds: Array<string>,
  receivingIds: Array<string>
}): Promise<Array<TransferDataType | { error: string }>> {
  if (!params.transferIds) params.transferIds = []
  if (!params.receivingIds) params.receivingIds = []
  let sendTransfers = await batchQueryTransfersByIds(params.transferIds, false)
  let receiveTransfers = await batchQueryTransfersByIds(params.receivingIds, true)
  return [...sendTransfers, ...receiveTransfers]
}

async function sendTransfer (params: SendTransferParamsType): Promise<SendTransferReturnType> {
  // due to limitation of dynamodb, convert message to undefined if it is an empty string
  params.sendMessage =
    params.sendMessage && params.sendMessage.length > 0 ? params.sendMessage : null

  const ts = moment().unix()
  const timestamp = ts.toString()
  const transferId = UUID()
  const receivingId = UUID()

  let senderToChainsfer: { [key: string]: string | Array<string> } = {
    txState: 'Pending',
    txTimestamp: timestamp
  }

  let chainsferToReceiver: { [key: ?string]: ?string | Array<?string> } = {
    txState: null,
    txTimestamp: null
  }

  let chainsferToSender: { [key: ?string]: ?string | Array<?string> } = {
    txState: null,
    txTimestamp: null
  }

  let reminder: { [key: string]: number } = {
    expirationTime: ts + expirationLength,
    availableReminderToReceiver: Math.floor(expirationLength / reminderInterval),
    reminderToSenderCount: 0,
    reminderToReceiverCount: 0
  }

  if (Array.isArray(params.sendTxHash)) {
    if (params.sendTxHash.length === 2) {
      senderToChainsfer.txHash = params.sendTxHash[0]
      senderToChainsfer.gasTxHash = params.sendTxHash[1]
    } else if (params.sendTxHash.length === 1) {
      senderToChainsfer.txHash = params.sendTxHash[0]
    } else {
      throw new Error('sendTxHash array length is limited to 1 or 2')
    }
  } else {
    senderToChainsfer.txHash = params.sendTxHash
  }
  let {
    // sender
    senderName,
    senderAvatar,
    sender,
    senderAccount,
    // receiver
    receiverName,
    destination,
    // crypto
    cryptoType,
    cryptoSymbol,
    transferAmount,
    transferFiatAmountSpot,
    fiatType,
    data,
    // others
    sendMessage,
    sendTxHash,
    // multisig wallet
    walletId
  } = params

  await documentClient
    .put({
      TableName: transActionDataTableName,
      Item: {
        // sender
        senderName,
        senderAvatar,
        sender,
        senderAccount,
        // receiver
        receiverName,
        destination,
        // crypto
        cryptoType,
        cryptoSymbol,
        transferAmount,
        transferFiatAmountSpot,
        fiatType,
        data,
        // others
        sendMessage,
        sendTxHash,
        // auto generated
        transferId: transferId,
        receivingId: receivingId,
        created: timestamp,
        updated: timestamp,
        reminder: reminder,
        transferStage: 'SenderToChainsfer',
        senderToChainsfer: senderToChainsfer,
        chainsferToReceiver: chainsferToReceiver,
        chainsferToSender: chainsferToSender,
        // multisig wallet
        walletId: walletId
      }
    })
    .promise()

  console.log('sendTransfer: transferId %s, receivingId %s', transferId, receivingId)
  let result: SendTransferReturnType = {
    transferId: transferId,
    sendTimestamp: timestamp
  }

  return result
}

async function receiveTransfer (
  params: ReceiveTransferParamsType
): Promise<ReceiveTransferReturnType> {
  // due to limitation of dynamodb, convert message to undefined if it is an empty string
  params.receiveMessage =
    params.receiveMessage && params.receiveMessage.length > 0 ? params.receiveMessage : null

  let transfer = await getTransferByReceivingId(params.receivingId)

  const receiveTimestamp = moment()
    .unix()
    .toString()

  let receiveTxHash = '0x'

  // eth based coins
  if (['ethereum', 'dai'].includes(transfer.cryptoType)) {
    // execute tx in multisig wallet
    receiveTxHash = await ethMultiSig.executeMultiSig(
      transfer,
      params.clientSig,
      transfer.destinationAddress
    )
  } else {
    // bitcoin
    receiveTxHash = await BtcMultiSig.sendBtcMultiSigTransaction({
      psbt: params.clientSig
    })
  }

  let data = await documentClient
    .update({
      TableName: transActionDataTableName,
      Key: {
        transferId: transfer.transferId
      },
      ConditionExpression:
        'attribute_not_exists(#ctr) and attribute_not_exists(#cts) and #stcTx.#stcTxSate = :stcTxSate',
      UpdateExpression:
        'SET #ctr = :ctr, #tstage = :tstage, #upt = :upt, #rMsg = :rMsgValue, #rAcc = :rAcc, #rTxHash = :rTxHash',
      ExpressionAttributeNames: {
        '#ctr': 'chainsferToReceiver',
        '#cts': 'chainsferToSender',
        '#stcTx': 'senderToChainsfer',
        '#stcTxSate': 'txState',
        '#tstage': 'transferStage',
        '#rMsg': 'receiveMessage',
        '#upt': 'updated',
        '#rAcc': 'receiverAccount',
        '#rTxHash': 'receiveTxHash'
      },
      ExpressionAttributeValues: {
        ':ctr': {
          txHash: receiveTxHash,
          txState: 'Pending',
          txTimestamp: receiveTimestamp
        },
        ':stcTxSate': 'Confirmed',
        ':tstage': 'ChainsferToReceiver',
        ':rTxHash': receiveTxHash,
        ':rMsgValue': params.receiveMessage,
        ':upt': receiveTimestamp,
        ':rAcc': params.receiverAccount
      },
      ReturnValues: 'ALL_NEW'
    })
    .promise()

  let result: ReceiveTransferReturnType = {
    receiveTxHash: receiveTxHash,
    receiveTimestamp: receiveTimestamp
  }

  return result
}

async function cancelTransfer (params: CancelTransferParamsType): Promise<CancelTransferReturnType> {
  // due to limitation of dynamodb, convert message to undefined if it is an empty string
  params.cancelMessage =
    params.cancelMessage && params.cancelMessage.length > 0 ? params.cancelMessage : null

  let transfer = await getTransferByTransferId(params.transferId)

  const cancelTimestamp = moment()
    .unix()
    .toString()

  let cancelTxHash = '0x'

  // eth based coins
  if (['ethereum', 'dai'].includes(transfer.cryptoType)) {
    // execute tx in multisig wallet
    cancelTxHash = await ethMultiSig.executeMultiSig(
      transfer,
      params.clientSig,
      // destinationAddress is pre-set by getMultiSigSigningData()
      transfer.destinationAddress
    )
  } else {
    // bitcoin
    cancelTxHash = await BtcMultiSig.sendBtcMultiSigTransaction({
      psbt: params.clientSig
    })
  }

  let data = await documentClient
    .update({
      TableName: transActionDataTableName,
      Key: {
        transferId: params.transferId
      },
      ConditionExpression:
        '(attribute_not_exists(#ctr) or attribute_not_exists(#ctr.#ctrTxHash)) and attribute_not_exists(#cts) and #stcTx.#stcTxSate = :stcTxSate',
      UpdateExpression:
        'SET #cts = :cts, #tstage = :tstage, #upt = :upt, #cMsg = :cMsgValue, #cTxHash = :cTxHash',
      ExpressionAttributeNames: {
        '#ctr': 'chainsferToReceiver',
        '#cts': 'chainsferToSender',
        '#stcTx': 'senderToChainsfer',
        '#stcTxSate': 'txState',
        '#ctrTxHash': 'txHash',
        '#tstage': 'transferStage',
        '#cMsg': 'cancelMessage',
        '#upt': 'updated',
        '#cTxHash': 'cancelTxHash'
      },
      ExpressionAttributeValues: {
        ':cts': {
          txHash: cancelTxHash,
          txState: 'Pending',
          txTimestamp: cancelTimestamp
        },
        ':stcTxSate': 'Confirmed',
        ':tstage': 'ChainsferToSender',
        ':cTxHash': cancelTxHash,
        ':cMsgValue': params.cancelMessage,
        ':upt': cancelTimestamp
      },
      ReturnValues: 'ALL_NEW'
    })
    .promise()
  const attributes = data.Attributes
  const senderToChainsfer = attributes.senderToChainsfer

  let result: CancelTransferReturnType = {
    cancelTxHash: cancelTxHash,
    cancelTimestamp: cancelTimestamp
  }

  return result
}

async function getMultiSigSigningData (
  params: GetMultiSigSigningDataParamsType
): Promise<GetMultiSigSigningDataReturnType> {
  // retrieve transfer data first
  let transfer
  if (params.transferId) {
    transfer = await getTransferByTransferId(params.transferId)
  } else {
    transfer = await getTransferByReceivingId(params.receivingId)
  }

  let destinationAddress

  // eth based coins
  if (['ethereum', 'dai'].includes(transfer.cryptoType)) {
    if (params.transferId) {
      // cancellation
      // send it back to sender
      destinationAddress = await ethMultiSig.getSenderAddress(transfer)
    } else {
      // receiving
      // use the receiver's designated address
      destinationAddress = params.destinationAddress
    }

    // prepare signing data
    const signingData = await ethMultiSig.createSigningData(transfer.walletId, destinationAddress)

    // sign data with master first
    const masterSig = await ethMultiSig.getMasterSig(signingData)

    // store master signature and destinationAddress in transfer data
    await documentClient
      .update({
        TableName: transActionDataTableName,
        Key: {
          transferId: transfer.transferId
        },
        UpdateExpression: 'SET #ms = :ms, #dr = :dr',
        ExpressionAttributeNames: {
          '#ms': 'masterSig',
          '#dr': 'destinationAddress'
        },
        ExpressionAttributeValues: {
          ':ms': masterSig,
          ':dr': destinationAddress
        },
        ReturnValues: 'ALL_NEW'
      })
      .promise()

    // return signingData for client to sign
    return {
      data: signingData
    }
  } else {
    // NOT IMPLMENTED
    throw new Error('Not implemented')
  }
}

async function directTransfer (params: DirectTransferParamsType): Promise<DirectTransferReturnType> {
  const ts = moment().unix()
  const timestamp = ts.toString()
  const transferId = UUID()

  let senderToReceiver: { [key: string]: string | Array<string> } = {
    txState: 'Pending',
    txTimestamp: timestamp,
    txHash: params.sendTxHash
  }

  let {
    // sender
    senderAccount,
    // receiver
    destinationAccount,
    // crypto
    cryptoType,
    transferAmount,
    transferFiatAmountSpot,
    fiatType,
    // others
    sendTxHash
  } = params

  await documentClient
    .put({
      TableName: transActionDataTableName,
      Item: {
        // sender
        senderAccount,
        // receiver
        destinationAccount,
        // crypto
        cryptoType,
        transferAmount,
        transferFiatAmountSpot,
        fiatType,
        // others
        sendTxHash,
        // auto generated
        transferId: transferId,
        created: timestamp,
        updated: timestamp,
        transferStage: 'SenderToReceiver',
        senderToReceiver
      }
    })
    .promise()

  console.log('directTransfer: transferId %s', transferId)
  let result: DirectTransferReturnType = {
    transferId: transferId,
    sendTimestamp: timestamp
  }

  return result
}

// eslint-disable-next-line flowtype/no-weak-types
async function collectPotentialExpirationRemainderList (): Promise<Array<Object>> {
  const timestamp = moment().unix()

  try {
    let response = await documentClient
      .scan({
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
        FilterExpression:
          '(attribute_not_exists(#ctr) or (attribute_exists(#ctr.#txState) and #ctr.#txState = :expired)) and attribute_not_exists(#cts) and (#stc.#txState = :confirmed) and (#reminder.#exp <= :ts)',
        TableName: transActionDataTableName
      })
      .promise()
    console.log(
      'CollectPotentialExpirationRemainderList: scaned table successfully with valid count %d and total ScannedCount %s',
      response.Count,
      response.ScannedCount
    )
    return response.Items
  } catch (err) {
    throw new Error(
      'CollectPotentialExpirationRemainderList: unable to scaned table . Error: ' + err.message
    )
  }
}

// eslint-disable-next-line flowtype/no-weak-types
async function collectPotentialReceiverRemainderList (): Promise<Array<Object>> {
  const timestamp = moment().unix()

  try {
    let response = await documentClient
      .scan({
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
        FilterExpression:
          '#stcTx.#txState = :confirmed and attribute_not_exists(#ctrTx) and attribute_not_exists(#ctsTx) and (#reminder.#exp > :ts) and (#reminder.#artc > :zero)',
        TableName: transActionDataTableName
      })
      .promise()
    console.log(
      'CollectReceiverRemainderList: scaned table successfully with valid count %d and total ScannedCount %s',
      response.Count,
      response.ScannedCount
    )
    return response.Items
  } catch (err) {
    throw new Error('CollectReceiverRemainderList: unable to scaned table . Error: ' + err.message)
  }
}

async function updateReminderToReceiver (transferId: string) {
  const ts = moment()
    .unix()
    .toString()
  const params = {
    TableName: transActionDataTableName,
    Key: {
      transferId: transferId
    },
    ConditionExpression:
      'attribute_not_exists(#ctr) and attribute_not_exists(#cts) and #stcTx.#stcTxSate = :stcTxSate and #re.#artc > :zero',
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

async function lookupTxHashes (params: {
  txHashes: Array<string>
}): Promise<Array<{
    txHash: string,
    transferId?: string,
    receivingId?: string,
    error?: string
  }>> {
  const { txHashes } = params

  const QUERY_BATCH_SIZE = 50

  let rv = []

  for (let i = 0; i < txHashes.length; i += QUERY_BATCH_SIZE) {
    const chunks = txHashes.slice(i, i + QUERY_BATCH_SIZE)

    let sendTxHashQueryPromiseList = []
    let receiveTxHashQueryPromiseList = []
    let cancelTxHashQueryPromiseList = []

    for (let j = 0; j < chunks.length; j++) {
      let txHash = chunks[j]

      let sendTxHashParams = {
        TableName: transActionDataTableName,
        IndexName: 'sendTxHash-index',
        KeyConditionExpression: 'sendTxHash = :hash',
        ExpressionAttributeValues: {
          ':hash': txHash
        }
      }

      let receiveTxHashParams = {
        TableName: transActionDataTableName,
        IndexName: 'receiveTxHash-index',
        KeyConditionExpression: 'receiveTxHash = :hash',
        ExpressionAttributeValues: {
          ':hash': txHash
        }
      }

      let cancelTxHashParams = {
        TableName: transActionDataTableName,
        IndexName: 'cancelTxHash-index',
        KeyConditionExpression: 'cancelTxHash = :hash',
        ExpressionAttributeValues: {
          ':hash': txHash
        }
      }

      sendTxHashQueryPromiseList.push(documentClient.query(sendTxHashParams).promise())
      receiveTxHashQueryPromiseList.push(documentClient.query(receiveTxHashParams).promise())
      cancelTxHashQueryPromiseList.push(documentClient.query(cancelTxHashParams).promise())
    }

    // run promises
    let sendTxHashQueryResults = await Promise.all(sendTxHashQueryPromiseList)
    let receiveTxHashQueryResults = await Promise.all(receiveTxHashQueryPromiseList)
    let cancelTxHashQueryResults = await Promise.all(cancelTxHashQueryPromiseList)

    // safety check
    if (
      sendTxHashQueryResults.length === receiveTxHashQueryResults.length &&
      receiveTxHashQueryResults.length === cancelTxHashQueryResults.length
    ) {
      // gather results
      for (let j = 0; j < sendTxHashQueryResults.length; j++) {
        // DEBUG
        console.log(
          chunks[j],
          sendTxHashQueryResults[j],
          receiveTxHashQueryResults[j],
          cancelTxHashQueryResults[j]
        )

        if (sendTxHashQueryResults[j].Items && sendTxHashQueryResults[j].Items.length === 1) {
          // is sendTxHash
          rv.push({
            txHash: chunks[j],
            transferId: sendTxHashQueryResults[j].Items[0].transferId
          })
        } else if (
          receiveTxHashQueryResults[j].Items &&
          receiveTxHashQueryResults[j].Items.length === 1
        ) {
          // is receiveTxHash
          rv.push({
            txHash: chunks[j],
            receivingId: receiveTxHashQueryResults[j].Items[0].receivingId
          })
        } else if (
          cancelTxHashQueryResults[j].Items &&
          cancelTxHashQueryResults[j].Items.length === 1
        ) {
          // is cancelTxHash
          rv.push({
            txHash: chunks[j],
            transferId: cancelTxHashQueryResults[j].Items[0].transferId
          })
        } else {
          rv.push({
            txHash: chunks[j],
            error: 'Cannot found corresponding txHash in transaction table'
          })
        }
      }
    } else {
      throw new Error(
        'sendTxHashQueryResults, receiveTxHashQueryResults and cancelTxHashQueryResults have different lengths'
      )
    }
  }
  return rv
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
  verifyGoogleIdToken: verifyGoogleIdToken,
  getMultiSigSigningData: getMultiSigSigningData,
  directTransfer,
  lookupTxHashes
}
