// @flow
import type { Context, Callback } from 'flow-aws-lambda'
var dynamoDBTxOps = require('./dynamoDBTxOps.js')
var btcOps = require('./btcOps.js')
var Config = require('./config.js')
var bitcoin = require('bitcoinjs-lib')

if (!process.env.TRANSACTION_DATA_TABLE_NAME) throw new Error('TRANSACTION_DATA_TABLE_NAME missing')
const transactionDataTableName = process.env.TRANSACTION_DATA_TABLE_NAME

if (!process.env.WALLET_ADDRESSES_DATA_TABLE_NAME) throw new Error('WALLET_ADDRESSES_DATA_TABLE_NAME missing')
const walletAddressesDataTableName = process.env.WALLET_ADDRESSES_DATA_TABLE_NAME

if (!process.env.ENV_VALUE) throw new Error('ENV_VALUE missing')
const deploymentStage = process.env.ENV_VALUE.toLowerCase()

if (!process.env.CHAINSFER_BTC_XPUB_INDEX_DATA_TABLE_NAME) throw new Error('CHAINSFER_BTC_XPUB_INDEX_DATA_TABLE_NAME missing')
const chainsferBtcXPubIndexDataTableName = process.env.CHAINSFER_BTC_XPUB_INDEX_DATA_TABLE_NAME

if (!process.env.CHAINSFER_BTC_TRACKED_ADDRESS_DATA_TABLE_NAME) throw new Error('CHAINSFER_BTC_TRACKED_ADDRESS_DATA_TABLE_NAME missing')
const chainsferBtcTrackedAddressDataTableName = process.env.CHAINSFER_BTC_TRACKED_ADDRESS_DATA_TABLE_NAME

const expirationLength = Config.ExpirationLengthConfig[deploymentStage] || Config.ExpirationLengthConfig['default']
const reminderInterval = Config.ReminderIntervalConfig[deploymentStage] || Config.ReminderIntervalConfig['default']
const googleAPIConfig = Config.GoogleAPIConfig[deploymentStage] || Config.GoogleAPIConfig['default']

const BtcNetworkName = Config.BtcNetworkConfig[deploymentStage] || Config.BtcNetworkConfig['default']
const BtcNetworkConfig = BtcNetworkName === 'mainnet' ? bitcoin.networks.bitcoin : bitcoin.networks.testnet
const BaseBtcPath = BtcNetworkName === 'mainnet' ? "m/49'/0'" : "m/49'/1'"
const LedgerApiUrl = Config.LedgerApiUrlConfig[deploymentStage] || Config.LedgerApiUrlConfig['default']

exports.handler = async (event: any, context: Context, callback: Callback) => {
  // parse request data
  // for local testing, use request = event.body
  let request = JSON.parse(event.body)

  // TODO reject invalid clientId
  const clientId = request.clientId

  function handleResults (rv, err) {
    let response: Object = {
      'headers': {
        'Access-Control-Allow-Origin': '*', // Required for CORS support to work
        'Access-Control-Allow-Credentials': true // Required for cookies, authorization headers with HTTPS
      },
      'isBase64Encoded': false
    }

    if (!err) {
      response.statusCode = 200
      response.body = JSON.stringify(rv)
      callback(null, response)
    } else {
      console.log(err)
      response.statusCode = 500
      response.body = JSON.stringify(err)
      callback(null, response)
    }
  }

  try {
    let rv = null
    if (request.action === 'GET') {
      rv = await dynamoDBTxOps.getTransfer(transactionDataTableName, request.sendingId, request.receivingId)
    } else if (request.action === 'BATCH_GET') {
      rv = await dynamoDBTxOps.getBatchTransfers(transactionDataTableName, request.sendingId, request.receivingId)
    } else if (request.action === 'SEND') {
      rv = await dynamoDBTxOps.sendTransfer(transactionDataTableName, clientId, request.senderName, request.sender, request.destination, request.transferAmount, request.message, request.cryptoType, request.data, request.sendTxHash, expirationLength, reminderInterval)
    } else if (request.action === 'RECEIVE') {
      rv = await dynamoDBTxOps.receiveTransfer(transactionDataTableName, request.receivingId, request.receiveTxHash)
    } else if (request.action === 'CANCEL') {
      rv = await dynamoDBTxOps.cancelTransfer(transactionDataTableName, request.sendingId, request.cancelTxHash)
    } else if (request.action === 'SET_LAST_USED_ADDRESS') {
      let googleId = await dynamoDBTxOps.verifyGoogleIdToken(googleAPIConfig['clientId'], request.idToken)
      await dynamoDBTxOps.setLastUsedAddress(walletAddressesDataTableName, googleId, request.walletType, request.cryptoType, request.address)
    } else if (request.action === 'GET_LAST_USED_ADDRESS') {
      let googleId = await dynamoDBTxOps.verifyGoogleIdToken(googleAPIConfig['clientId'], request.idToken)
      rv = await dynamoDBTxOps.getLastUsedAddress(walletAddressesDataTableName, googleId)
    } else if (request.action === 'UTXOS') {
      const limit = request.limit || 1000
      rv = await btcOps.getUtxosFromChainsferBtcXPubIndex(request.xpub, request.accountIndex, chainsferBtcXPubIndexDataTableName, limit, BaseBtcPath, BtcNetworkConfig, LedgerApiUrl, chainsferBtcTrackedAddressDataTableName)
    } else {
      throw new Error('Invalid command')
    }

    handleResults(rv)
  } catch (err) {
    handleResults(null, err)
  }
}
