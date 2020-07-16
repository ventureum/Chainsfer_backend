// @flow
import type { Context, Callback } from 'flow-aws-lambda'
import axios from 'axios'
import BtcMultiSig from './BtcMultiSig'
import promoteOps from './promoteOps.js'
var dynamoDBTxOps = require('./dynamoDBTxOps.js')
var Config = require('./config.js')
var bitcoin = require('bitcoinjs-lib')

if (!process.env.TRANSACTION_DATA_TABLE_NAME)
  throw new Error('TRANSACTION_DATA_TABLE_NAME missing')
const transactionDataTableName = process.env.TRANSACTION_DATA_TABLE_NAME

if (!process.env.WALLET_ADDRESSES_DATA_TABLE_NAME)
  throw new Error('WALLET_ADDRESSES_DATA_TABLE_NAME missing')
const walletAddressesDataTableName = process.env.WALLET_ADDRESSES_DATA_TABLE_NAME

if (!process.env.ENV_VALUE) throw new Error('ENV_VALUE missing')
const deploymentStage = process.env.ENV_VALUE.toLowerCase()

const expirationLength =
  Config.ExpirationLengthConfig[deploymentStage] || Config.ExpirationLengthConfig['default']
const reminderInterval =
  Config.ReminderIntervalConfig[deploymentStage] || Config.ReminderIntervalConfig['default']
const googleAPIConfig =
  Config.GoogleAPIConfig[deploymentStage] || Config.GoogleAPIConfig['default']

const BtcNetworkName =
  Config.BtcNetworkConfig[deploymentStage] || Config.BtcNetworkConfig['default']
const BtcNetworkConfig =
  BtcNetworkName === 'mainnet' ? bitcoin.networks.bitcoin : bitcoin.networks.testnet
const BaseBtcPath = BtcNetworkName === 'mainnet' ? "m/49'/0'" : "m/49'/1'"
const LedgerApiUrl =
  Config.LedgerApiUrlConfig[deploymentStage] || Config.LedgerApiUrlConfig['default']

// eslint-disable-next-line flowtype/no-weak-types
exports.handler = async (event: any, context: Context, callback: Callback) => {
  // parse request data
  // for local testing, use request = event.body
  let request = JSON.parse(event.body)

  // TODO: reject invalid clientId
  const clientId = request.clientId

  // eslint-disable-next-line flowtype/no-weak-types
  function handleResults (rv: any, err: any) {
    let response: {
      headers: {
        'Access-Control-Allow-Origin': string,
        'Access-Control-Allow-Credentials': boolean
      },
      isBase64Encoded: boolean,
      statusCode: number,
      body: string
    } = {
      headers: {
        'Access-Control-Allow-Origin': '*', // Required for CORS support to work
        'Access-Control-Allow-Credentials': true // Required for cookies, authorization headers with HTTPS
      },
      isBase64Encoded: false,
      statusCode: 200,
      body: ''
    }

    if (!err) {
      response.statusCode = 200
      response.body = JSON.stringify(rv)
      callback(null, response)
    } else {
      console.log(err)
      response.statusCode = 500
      response.body = err.toString()
      callback(null, response)
    }
  }

  // keep the following part light weight
  // heavy-lifting is done in dynamoDBTxOps
  // types are defined in transfer.flow.js
  try {
    let rv = {}
    if (request.action === 'GET') {
      rv = await dynamoDBTxOps.getTransfer(request)
    } else if (request.action === 'BATCH_GET') {
      rv = await dynamoDBTxOps.getBatchTransfers(request)
    } else if (request.action === 'SEND') {
      rv = await dynamoDBTxOps.sendTransfer(request)
    } else if (request.action === 'RECEIVE') {
      rv = await dynamoDBTxOps.receiveTransfer(request)
    } else if (request.action === 'CANCEL') {
      rv = await dynamoDBTxOps.cancelTransfer(request)
    } else if (request.action === 'GET_MULTISIG_SIGNING_DATA') {
      rv = await dynamoDBTxOps.getMultiSigSigningData(request)
    } else if (request.action === 'MINT_LIBRA') {
      // current faucet does not support http,  thus, frontend cannot mint
      // move the minting part here temporarily
      await axios.post(
        `http://faucet.testnet.libra.org?amount=${request.amount}&address=${request.address}`
      )
    } else if (request.action === 'GET_BTC_MULTI_SIG_PUBLIC_KEY') {
      rv = await BtcMultiSig.getBtcMultiSigPublicKey()
    } else if (request.action === 'DIRECT_TRANSFER') {
      rv = await dynamoDBTxOps.directTransfer(request)
    } else if (request.action === 'LOOKUP_TX_HASHES') {
      rv = await dynamoDBTxOps.lookupTxHashes(request)
    } else if (request.action === 'FETCH_EMAIL_TRANSFERS') {
      rv = await dynamoDBTxOps.fetchEmailTransfers(request)
    } else if (request.action === 'CLEAR_TRANSFER') {
      rv = await dynamoDBTxOps.clearTransfer(request)
    } else if (request.action === 'PROMOTE_TRANSFER') {
      rv = await promoteOps.promoteTransfer(request)
    } else {
      throw new Error('Invalid command')
    }

    handleResults(rv)
  } catch (err) {
    handleResults(null, err)
  }
}
