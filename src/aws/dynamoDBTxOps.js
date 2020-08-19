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
  DirectTransferReturnType,
  FetchEmailTransfersParamType,
  FetchEmailTransfersReturnType
} from './transfer.flow'
import ethMultiSig from './EthMultiSig'
import BtcMultiSig from './BtcMultiSig'
import Config from './config.js'

var moment = require('moment')
var UUID = require('uuid/v4')
var AWS = require('aws-sdk')
AWS.config.update({ region: 'us-east-1' })
var documentClient = new AWS.DynamoDB.DocumentClient()
var utils = require('./utils.js')
const { OAuth2Client } = require('google-auth-library')
const SimpleMultiSigContractArtifacts = require('../contracts/SimpleMultiSig.json')

if (!process.env.TRANSACTION_DATA_TABLE_NAME)
  throw new Error('TRANSACTION_DATA_TABLE_NAME missing')
const transactionDataTableName = process.env.TRANSACTION_DATA_TABLE_NAME

if (!process.env.WALLET_ADDRESSES_DATA_TABLE_NAME)
  throw new Error('WALLET_ADDRESSES_DATA_TABLE_NAME missing')
const walletAddressTableName = process.env.WALLET_ADDRESSES_DATA_TABLE_NAME

if (!process.env.USER_TABLE_NAME) throw new Error('USER_TABLE_NAME missing')
const userTableName = process.env.USER_TABLE_NAME

if (!process.env.ENV_VALUE) throw new Error('ENV_VALUE missing')
const deploymentStage = process.env.ENV_VALUE.toLowerCase()

const expirationLength =
  Config.ExpirationLengthConfig[deploymentStage] || Config.ExpirationLengthConfig['default']
const reminderInterval =
  Config.ReminderIntervalConfig[deploymentStage] || Config.ReminderIntervalConfig['default']
const googleAPIConfig =
  Config.GoogleAPIConfig[deploymentStage] || Config.GoogleAPIConfig['default']

// setup master account
if (!process.env.ETH_PRIVATE_KEY) throw new Error('ETH_PRIVATE_KEY missing')
const ETH_PRIVATE_KEY = process.env.ETH_PRIVATE_KEY

const provider = Config.EthTxAPIConfig[deploymentStage] || Config.EthTxAPIConfig['default']

// returns googleId given an idToken
async function verifyGoogleIdToken (
  clientId: string,
  idToken: string
): Promise<{ googleId: string, email: string }> {
  try {
    const client = new OAuth2Client(clientId)
    const ticket = await client.verifyIdToken({
      idToken: idToken,
      audience: clientId
    })
    const payload = ticket.getPayload()

    return {
      googleId: payload.sub,
      email: payload.email
    }
  } catch (err) {
    if (deploymentStage !== 'staging' && deploymentStage !== 'prod') {
      // return mock user info
      // ignore all possible errors:
      // 1. expiration error
      // 2. kid not matched error ("No pem found for envelope")
      const [mock, googleId, email] = idToken.split('-')
      if (mock === 'mock') {
        return { googleId: googleId, email: email }
      }
    }
    console.error('Failed to verify Id Token: ' + err.message)
    throw new Error('Failed to verify Id Token')
  }
}

async function getLastUsedAddress (params: { idToken: string }): Promise<WalletAddressDataType> {
  const { googleId } = await verifyGoogleIdToken(googleAPIConfig['clientId'], params.idToken)
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
  const { googleId } = await verifyGoogleIdToken(googleAPIConfig['clientId'], params.idToken)
  const timestamp = moment().unix()

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
    TableName: transactionDataTableName,
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
    TableName: transactionDataTableName,
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
  } else if (deploymentStage === 'prod' || deploymentStage === 'staging') {
    // Only mask out receivingId in prod or staging env
    item.transferId = item.transferId
    // mask out receivingId for sender
    item.receivingId = ''
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

  // generate timestamp on backup
  // use previously generated timestamp after broadcasting
  let timestamp = moment().unix()

  // generate transferId on backup
  // use previously generated transferId after broadcasting
  const transferId = params.transferId ? params.transferId : UUID()

  // generate receivingId on creation
  const receivingId = UUID()

  let senderToChainsfer: { txState: string, txTimestamp: number, txHash: ?string } = {
    // sendTxHash === null: backup transferData before broadcasting
    // sendTxHash !== null: update transferData after broadcasting
    // Set txState to null to void being pushed into SQS
    txState: params.sendTxHash ? 'Pending' : 'NotInitiated',
    txTimestamp: timestamp,
    // cannot be an empty string
    txHash: null
  }

  let chainsferToReceiver: { txState: string, txTimestamp: number, txHash: ?string } = {
    txState: 'NotInitiated',
    txTimestamp: 0,
    // cannot be an empty string
    txHash: null
  }

  let chainsferToSender: { txState: string, txTimestamp: number, txHash: ?string } = {
    txState: 'NotInitiated',
    txTimestamp: 0,
    // cannot be an empty string
    txHash: null
  }

  let reminder: {
    nextReminderTimestamp: number,
    reminderToSenderCount: number,
    reminderToReceiverCount: number
  } = {
    nextReminderTimestamp: 0,
    reminderToSenderCount: 0,
    reminderToReceiverCount: 0
  }

  if (params.sendTxHash) {
    senderToChainsfer.txHash = params.sendTxHash
  }

  if (params.promoteTransfer !== true) {
    params.promoteTransfer = false
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
    exchangeRate,
    data,
    // others
    sendMessage,
    sendTxHash,
    // multisig wallet
    walletId,
    promoteTransfer
  } = params

  if (!sendTxHash) {
    await documentClient
      .put({
        TableName: transactionDataTableName,
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
          exchangeRate,
          data,
          // others
          sendMessage,
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
          walletId: walletId,
          // funds in escrow, waiting for receiving
          // or cancellation
          // it is used for checking expiration and sending
          // reminders
          //
          // note we must use N instead of BOOL type due
          // to index type limitation
          // Member must satisfy enum value set: [B, N, S]
          inEscrow: 0,
          // transfer has expired if set to true
          expired: false,
          // transfer expiration time
          // will be set once funds have arrived at
          // escrow wallet
          expiresAt: 0,
          promoteTransfer: promoteTransfer
        }
      })
      .promise()
  } else {
    const updateParams = {
      TableName: transactionDataTableName,
      Key: {
        transferId: transferId
      },
      UpdateExpression: 'SET #stc = :stc, #sTxHash = :sTxHash',
      // make sure update() will not overwrite put() executed by backing-up data
      // the two steps can be separated by a very small interval (<500ms)
      ConditionExpression: 'attribute_exists(transferId)',
      ExpressionAttributeNames: {
        '#stc': 'senderToChainsfer',
        '#sTxHash': 'sendTxHash'
      },
      ExpressionAttributeValues: {
        ':stc': {
          txHash: sendTxHash,
          txState: 'Pending',
          txTimestamp: timestamp
        },
        ':sTxHash': sendTxHash
      },
      ReturnValues: 'ALL_NEW'
    }
    // update sendTxHash
    try {
      await documentClient.update(updateParams).promise()
    } catch (error) {
      console.error(`Retrying updating sendTransfer ${transferId} due to error`, error)

      // sleep for 500ms
      // put() takes 1s to be fully synced
      // this should be sufficient
      await new Promise((r: function): function => setTimeout(r, 500))

      // this will throw if retry fails
      await documentClient.update(updateParams).promise()
    }
  }

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

  const receiveTimestamp = moment().unix()

  let receiveTxHash = '0x'

  // eth based coins
  if (transfer.cryptoType === 'ethereum' || Config.ERC20Tokens[transfer.cryptoType]) {
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
      TableName: transactionDataTableName,
      Key: {
        transferId: transfer.transferId
      },
      ConditionExpression:
        '#ctr.#txState = :notInitiated and #cts.#txState = :notInitiated and #stcTx.#txState = :stcTxState',
      UpdateExpression:
        'SET #ctr = :ctr, #tstage = :tstage, #upt = :upt, #rMsg = :rMsgValue, #rAcc = :rAcc, #rTxHash = :rTxHash',
      ExpressionAttributeNames: {
        '#ctr': 'chainsferToReceiver',
        '#cts': 'chainsferToSender',
        '#stcTx': 'senderToChainsfer',
        '#txState': 'txState',
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
        ':stcTxState': 'Confirmed',
        ':tstage': 'ChainsferToReceiver',
        ':rTxHash': receiveTxHash,
        ':rMsgValue': params.receiveMessage,
        ':upt': receiveTimestamp,
        ':rAcc': params.receiverAccount,
        ':notInitiated': 'NotInitiated'
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

async function cancelTransfer (
  params: CancelTransferParamsType
): Promise<CancelTransferReturnType> {
  // due to limitation of dynamodb, convert message to undefined if it is an empty string
  params.cancelMessage =
    params.cancelMessage && params.cancelMessage.length > 0 ? params.cancelMessage : null

  let transfer = await getTransferByTransferId(params.transferId)

  const cancelTimestamp = moment().unix()

  let cancelTxHash = '0x'

  // eth based coins
  if (transfer.cryptoType === 'ethereum' || Config.ERC20Tokens[transfer.cryptoType]) {
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
      TableName: transactionDataTableName,
      Key: {
        transferId: params.transferId
      },
      ConditionExpression:
        '#ctr.#txState = :notInitiated and #cts.#txState = :notInitiated and #stcTx.#txState = :stcTxState',
      UpdateExpression:
        'SET #cts = :cts, #tstage = :tstage, #upt = :upt, #cMsg = :cMsgValue, #cTxHash = :cTxHash',
      ExpressionAttributeNames: {
        '#ctr': 'chainsferToReceiver',
        '#cts': 'chainsferToSender',
        '#stcTx': 'senderToChainsfer',
        '#txState': 'txState',
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
        ':stcTxState': 'Confirmed',
        ':tstage': 'ChainsferToSender',
        ':cTxHash': cancelTxHash,
        ':cMsgValue': params.cancelMessage,
        ':upt': cancelTimestamp,
        ':notInitiated': 'NotInitiated'
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
  if (transfer.cryptoType === 'ethereum' || Config.ERC20Tokens[transfer.cryptoType]) {
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
        TableName: transactionDataTableName,
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

async function directTransfer (
  params: DirectTransferParamsType
): Promise<DirectTransferReturnType> {
  const timestamp = moment().unix()
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
    exchangeRate,
    // others
    sendTxHash
  } = params

  await documentClient
    .put({
      TableName: transactionDataTableName,
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
        exchangeRate,
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
async function collectReminderList (): Promise<Array<Object>> {
  const timestamp = moment().unix()

  const queryParams = {
    TableName: transactionDataTableName,
    IndexName: 'inEscrow-index',
    KeyConditionExpression: 'inEscrow = :inEscrow',
    // next reminder time has passed
    // we must send out a reminder in this iteration
    FilterExpression:
      'attribute_exists(#re) and attribute_exists(#re.#nrt) and #re.#nrt <= :ts' +
      ' and attribute_exists(#ctr) and attribute_exists(#ctr.#txState) and #ctr.#txState <> :txStatePending' +
      ' and attribute_exists(#cts) and attribute_exists(#cts.#txState) and #cts.#txState <> :txStatePending' +
      // dont send reminder when emailSentFailure exists
      ' and attribute_not_exists(#esf)',
    ExpressionAttributeNames: {
      '#re': 'reminder',
      '#nrt': 'nextReminderTimestamp',
      '#ctr': 'chainsferToReceiver',
      '#cts': 'chainsferToSender',
      '#txState': 'txState',
      '#esf': 'emailSentFailure'
    },
    ExpressionAttributeValues: {
      ':inEscrow': 1,
      ':ts': timestamp,
      ':txStatePending': 'Pending'
    }
  }

  try {
    let data
    let transferIds = []
    do {
      let params = queryParams
      if (data && data.LastEvaluatedKey) {
        params = {
          ...queryParams,
          ExclusiveStartKey: data.LastEvaluatedKey
        }
      }
      data = await documentClient.query(params).promise()
      if (data) {
        transferIds = transferIds.concat(
          data.Items.map((item: { transferId: string }): string => item.transferId)
        )
        console.log(
          'collectReminderList: query table successfully with valid count %d and total ScannedCount %s',
          data.Count,
          data.ScannedCount
        )
      }
    } while (data.LastEvaluatedKey)
    // retrieve transferData by items
    const transferItems = await batchQueryTransfersByIds(transferIds, false)
    return transferItems
  } catch (err) {
    throw new Error('collectReminderList: unable to query table. Error: ' + err.message)
  }
}

async function updateReminderToReceiver (transferId: string) {
  const ts = moment().unix()
  const params = {
    TableName: transactionDataTableName,
    Key: {
      transferId: transferId
    },
    UpdateExpression: 'SET #upt = :upt, #re.#rtrc = #re.#rtrc + :inc, #re.#nrt = :nrt',
    ExpressionAttributeNames: {
      '#upt': 'updated',
      '#re': 'reminder',
      '#rtrc': 'reminderToReceiverCount',
      '#nrt': 'nextReminderTimestamp'
    },
    ExpressionAttributeValues: {
      ':upt': ts,
      ':inc': 1,
      ':nrt': ts + reminderInterval
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

async function updateReminderToSender (transferId: string) {
  const ts = moment().unix()
  const params = {
    TableName: transactionDataTableName,
    Key: {
      transferId: transferId
    },
    UpdateExpression: 'SET #upt = :upt, #re.#rtsc = #re.#rtsc + :inc, #re.#nrt = :nrt',
    ExpressionAttributeNames: {
      '#upt': 'updated',
      '#re': 'reminder',
      '#rtsc': 'reminderToSenderCount',
      '#nrt': 'nextReminderTimestamp'
    },
    ExpressionAttributeValues: {
      ':upt': ts,
      ':inc': 1,
      ':nrt': ts + reminderInterval
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

async function updateEmailSentFailure (transferId: string, message: string) {
  const params = {
    TableName: transactionDataTableName,
    Key: {
      transferId: transferId
    },
    UpdateExpression: 'SET #esf = :msg',
    ExpressionAttributeNames: {
      '#esf': 'emailSentFailure'
    },
    ExpressionAttributeValues: {
      ':msg': message
    },
    ReturnValues: 'ALL_NEW'
  }
  try {
    let data = await documentClient.update(params).promise()
    console.log('emailSentFailure is updated successfully to be: ', message)
  } catch (err) {
    throw new Error('Unable to update emailSentFailure. Error: ' + err.message)
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
        TableName: transactionDataTableName,
        IndexName: 'sendTxHash-index',
        KeyConditionExpression: 'sendTxHash = :hash',
        ExpressionAttributeValues: {
          ':hash': txHash
        }
      }

      let receiveTxHashParams = {
        TableName: transactionDataTableName,
        IndexName: 'receiveTxHash-index',
        KeyConditionExpression: 'receiveTxHash = :hash',
        ExpressionAttributeValues: {
          ':hash': txHash
        }
      }

      let cancelTxHashParams = {
        TableName: transactionDataTableName,
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

// testing only
async function resetTransfers (email: string, transfers: ?Array<TransferDataType>) {
  // first clear transfers
  const scanParams = {
    TableName: transactionDataTableName,
    ProjectionExpression: 'transferId',
    FilterExpression: '#sender = :email or #destination = :email',
    ExpressionAttributeNames: {
      '#sender': 'sender',
      '#destination': 'destination'
    },
    ExpressionAttributeValues: {
      ':email': email
    }
  }

  try {
    let data
    // delete all transfers with either sender == email or destination == email
    do {
      let params = scanParams
      if (data && data.LastEvaluatedKey) {
        params = {
          ...scanParams,
          ExclusiveStartKey: data.LastEvaluatedKey
        }
      }
      data = await documentClient.scan(params).promise()
      for (let { transferId } of data.Items) {
        const deleteParams = {
          TableName: transactionDataTableName,
          Key: {
            transferId: transferId
          }
        }
        await documentClient.delete(deleteParams).promise()
        console.log('Deleted ' + transferId)
      }
    } while (data.LastEvaluatedKey)

    // insert new transfers
    if (transfers) {
      for (let transfer of transfers) {
        const insertParams = {
          TableName: transactionDataTableName,
          Item: transfer
        }
        await documentClient.put(insertParams).promise()
        console.log('Added ' + JSON.stringify(transfer, null, 2))
      }
    }
  } catch (err) {
    console.log(JSON.stringify(err, null, 2))
  }
}

const getUserAvatarUrl = async (email: string): Promise<string> => {
  const params = {
    TableName: userTableName,
    IndexName: 'emailIndex',
    KeyConditionExpression: 'email = :em',
    ExpressionAttributeValues: {
      ':em': email
    }
  }
  const response = await documentClient.query(params).promise()
  if (response.Count < 1) {
    return ''
  }
  return response.Items[0].profile.imageUrl || ''
}

async function fetchEmailTransfers (
  request: FetchEmailTransfersParamType
): Promise<FetchEmailTransfersReturnType> {
  let { idToken, limit, senderExclusiveStartKey, destinationExclusiveStartKey } = request
  const { email } = await verifyGoogleIdToken(googleAPIConfig['clientId'], idToken)

  if (!limit) limit = 10

  // eslint-disable-next-line flowtype/no-weak-types
  let senderQueryParams: Object = {
    TableName: transactionDataTableName,
    IndexName: 'sender-index',
    KeyConditionExpression: 'sender = :email',
    ExpressionAttributeValues: {
      ':email': email
    },
    Limit: limit,
    ScanIndexForward: false // false for descending
  }
  if (senderExclusiveStartKey) {
    senderQueryParams.ExclusiveStartKey = senderExclusiveStartKey
  }

  // eslint-disable-next-line flowtype/no-weak-types
  let destinationQueryParams: Object = {
    TableName: transactionDataTableName,
    IndexName: 'destination-index',
    KeyConditionExpression: 'destination = :email',
    FilterExpression: 'attribute_exists(#stc) and #stc.#txState = :txStateConfirmed',
    ExpressionAttributeNames: {
      '#stc': 'senderToChainsfer',
      '#txState': 'txState'
    },
    ExpressionAttributeValues: {
      ':email': email,
      ':txStateConfirmed': 'Confirmed'
    },
    Limit: limit,
    ScanIndexForward: false // false for descending
  }
  if (destinationExclusiveStartKey) {
    const { receivingId } = destinationExclusiveStartKey
    const { transferId } = await getTransferByReceivingId(receivingId)
    destinationQueryParams.ExclusiveStartKey = {
      destination: destinationExclusiveStartKey.destination,
      created: destinationExclusiveStartKey.created,
      transferId: transferId
    }
  }

  const [senderQueryResult, destinationQueryResult] = await Promise.all([
    documentClient.query(senderQueryParams).promise(),
    documentClient.query(destinationQueryParams).promise()
  ])

  let combinedData: Array<TransferDataType> = [
    // Destination query results appear before sender query results
    // in case of 'created' timestamp are the same.
    ...destinationQueryResult.Items.map((item: TransferDataType): TransferDataType => {
      // $FlowFixMe
      return formatQueriedTransfer(item, true)
    }),
    ...senderQueryResult.Items.map((item: TransferDataType): TransferDataType => {
      // $FlowFixMe
      return formatQueriedTransfer(item, false)
    })
  ]

  combinedData = combinedData.sort((a: TransferDataType, b: TransferDataType): number => {
    return b.created - a.created
  })

  if (combinedData.length > limit) {
    // if combine data exceeds limit, trim the data
    combinedData = combinedData.slice(0, limit)
  }

  // construct LastEvaluatedKey for pagenation
  let senderLastEvaluatedKey = null
  let destinationLastEvaluatedKey = null
  combinedData.forEach((item: TransferDataType) => {
    if (item.transferId === '') {
      // if it is a "destination" record, update destinationLastEvaluatedKey
      destinationLastEvaluatedKey = {
        destination: item.destination,
        created: item.created,
        receivingId: item.receivingId
      }
    } else if (item.transferId !== '') {
      // if it is a "sender" record, update senderLastEvaluatedKey
      senderLastEvaluatedKey = {
        sender: item.sender,
        created: item.created,
        transferId: item.transferId
      }
    }
  })

  let receiverAvatars = {}
  for (let item of combinedData) {
    if (!item.receiverAvatar) {
      if (!receiverAvatars[item.destination]) {
        receiverAvatars[item.destination] = await getUserAvatarUrl(item.destination)
      }
      item.receiverAvatar = receiverAvatars[item.destination]
    }
  }

  const output = {
    senderLastEvaluatedKey: senderLastEvaluatedKey,
    destinationLastEvaluatedKey: destinationLastEvaluatedKey,
    data: combinedData
  }

  return output
}

// clear user-rejected transfers
// only applies to email transfer
// the transfer must contain no txHash for stc, cts, ctr
async function clearTransfer (request: { transferId: string }) {
  await documentClient
    .delete({
      TableName: transactionDataTableName,
      Key: {
        transferId: request.transferId
      },
      ConditionExpression:
        'attribute_exists(senderToChainsfer) and attribute_exists(chainsferToReceiver) and attribute_exists(chainsferToSender)' +
        ' and #stc.#txState = :notInitiated and #ctr.#txState = :notInitiated and #cts.#txState = :notInitiated',
      ExpressionAttributeNames: {
        '#stc': 'senderToChainsfer',
        '#ctr': 'chainsferToReceiver',
        '#cts': 'chainsferToSender',
        '#txState': 'txState'
      },
      ExpressionAttributeValues: {
        ':notInitiated': 'NotInitiated'
      }
    })
    .promise()
}

module.exports = {
  sendTransfer: sendTransfer,
  cancelTransfer: cancelTransfer,
  receiveTransfer: receiveTransfer,
  getTransfer: getTransfer,
  getBatchTransfers: getBatchTransfers,
  setLastUsedAddress: setLastUsedAddress,
  getLastUsedAddress: getLastUsedAddress,
  updateReminderToReceiver: updateReminderToReceiver,
  updateReminderToSender,
  verifyGoogleIdToken: verifyGoogleIdToken,
  getMultiSigSigningData: getMultiSigSigningData,
  directTransfer,
  lookupTxHashes,
  collectReminderList,
  resetTransfers,
  updateEmailSentFailure,
  fetchEmailTransfers,
  clearTransfer,
  getTransferByReceivingId
}
