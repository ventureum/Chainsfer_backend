// @flow
import type { Context, Callback } from 'flow-aws-lambda'
import {
  register,
  getUser,
  getRecipients,
  removeRecipient,
  addRecipient,
  getCryptoAccounts,
  addCryptoAccounts,
  removeCryptoAccounts,
  modifyCryptoAccountNames,
  clearCloudWalletCryptoAccounts,
  updateUserCloudWalletFolderMeta,
  getUserCloudWalletFolderMeta,
  resetUser
} from './userOps.js'
import { verifyGoogleIdToken, resetTransfers } from './dynamoDBTxOps.js'
var Config = require('./config.js')
if (!process.env.USER_TABLE_NAME) throw new Error('USER_TABLE_NAME missing')
const userTableName = process.env.USER_TABLE_NAME
if (!process.env.ENV_VALUE) throw new Error('ENV_VALUE missing')
const deploymentStage = process.env.ENV_VALUE.toLowerCase()

const googleAPIConfig =
  Config.GoogleAPIConfig[deploymentStage] || Config.GoogleAPIConfig['default']


// eslint-disable-next-line flowtype/no-weak-types
exports.handler = async (event: any, context: Context, callback: Callback) => {
  let request = JSON.parse(event.body)

  // eslint-disable-next-line flowtype/no-weak-types
  function handleResults (rv: Object, err: Object) {
    let response = {
      headers: {
        'Access-Control-Allow-Origin': Config.getAllowOrigin(event.headers.origin), // Required for CORS support to work
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
      if (err.message === 'User not found') {
        response.statusCode = 404
      } else {
        response.statusCode = 500
      }
      response.body = err.message
      callback(null, response)
    }
  }

  try {
    let rv = null
    let googleId = ''
    const { action, idToken, email } = request
    if (idToken) {
      googleId = (await verifyGoogleIdToken(googleAPIConfig['clientId'], idToken)).googleId
    }

    if (action === 'REGISTER') {
      rv = await register(userTableName, googleId, request.email, request.profile)
    } else if (action === 'GET_USER' && (googleId || email)) {
      rv = await getUser(userTableName, googleId, email)
    } else if (action === 'GET_RECIPIENTS') {
      rv = await getRecipients(userTableName, googleId)
    } else if (action === 'REMOVE_RECIPIENT') {
      rv = await removeRecipient(userTableName, googleId, request.recipient)
    } else if (action === 'ADD_RECIPIENT') {
      rv = await addRecipient(userTableName, googleId, request.recipient)
    } else if (action === 'ADD_CRYPTO_ACCOUNTS') {
      rv = await addCryptoAccounts(userTableName, googleId, request.payloadAccounts)
    } else if (action === 'REMOVE_CRYPTO_ACCOUNTS') {
      rv = await removeCryptoAccounts(userTableName, googleId, request.payloadAccounts)
    } else if (action === 'MODIFY_CRYPTO_ACCOUNT_NAMES') {
      rv = await modifyCryptoAccountNames(userTableName, googleId, request.payloadAccounts)
    } else if (action === 'GET_CRYPTO_ACCOUNTS') {
      rv = await getCryptoAccounts(userTableName, googleId)
    } else if (action === 'CLEAR_CLOUD_WALLET_CRYPTO_ACCOUNTS') {
      rv = await clearCloudWalletCryptoAccounts(userTableName, googleId)
    } else if (action === 'UPDATE_UESR_CLOUD_WALLET_FOLDER_META') {
      rv = await updateUserCloudWalletFolderMeta(userTableName, googleId, request.newMetaInfo)
    } else if (action === 'GET_UESR_CLOUD_WALLET_FOLDER_META') {
      rv = await getUserCloudWalletFolderMeta(userTableName, googleId)
    } else if (
      action === 'RESET_USER' &&
      deploymentStage !== 'prod' &&
      deploymentStage !== 'staging'
    ) {
      // testing  only
      rv = await resetUser(userTableName, googleId, request.data)
    } else {
      throw new Error('Invalid command')
    }
    handleResults(rv)
  } catch (err) {
    handleResults(null, err)
  }
} 
