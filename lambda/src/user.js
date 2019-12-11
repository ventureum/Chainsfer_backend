// @flow
import type { Context, Callback } from 'flow-aws-lambda'
import { verifyGoogleIdToken } from './dynamoDBTxOps.js'

var referralWallet = require('./referralWallet.js')
var Config = require('./config.js')
const AWS = require('aws-sdk')
AWS.config.update({ region: 'us-east-1' })
var documentClient = new AWS.DynamoDB.DocumentClient()

if (!process.env.USER_TABLE_NAME) throw new Error('USER_TABLE_NAME missing')
const userTableName = process.env.USER_TABLE_NAME
if (!process.env.ENV_VALUE) throw new Error('ENV_VALUE missing')
const deploymentStage = process.env.ENV_VALUE.toLowerCase()

const googleAPIConfig = Config.GoogleAPIConfig[deploymentStage] || Config.GoogleAPIConfig['default']

type RecipientType = {
  name: string,
  email: string,
  addedAt: number, // timestamp
  updatedAt: number // timestamp
}

type RecipientListType = {
  googleId: string,
  recipients: Array<RecipientType>
}

type CryptoAccountType = {
  cryptoType: string,
  walletType: string,
  address: ?string,
  xpub: ?string,
  name: string,
  verified: boolean,
  receivable: boolean,
  sendable: boolean,
  addedAt: number, // timestamp
  updatedAt: number // timestamp
}

type CryptoAccounResponsetType = { cryptoAccounts: Array<CryptoAccountType> }

async function register (
  userTableName: string,
  googleId: string
): Promise<{
  newUser: boolean,
  googleId: string,
  recipients: Array<RecipientType>
}> {
  const getParams = {
    TableName: userTableName,
    Key: {
      googleId
    }
  }

  let response = await documentClient.get(getParams).promise()
  // init User item
  if (response.Item && response.Item.googleId) {
    return {
      newUser: false,
      googleId: response.Item.googleId,
      recipients: response.Item.recipients
    }
  } else {
    response = await documentClient
      .put({
        TableName: userTableName,
        Item: {
          googleId: googleId,
          recipients: []
        }
      })
      .promise()
    await referralWallet.createAccount(googleId)
    return {
      newUser: true,
      googleId: googleId,
      recipients: []
    }
  }
  // create a referral account
}

async function getUser (
  userTableName: string,
  googleId: string
): Promise<{ googleId: string, recipients: ?Array<RecipientType> }> {
  const params = {
    TableName: userTableName,
    Key: {
      googleId
    }
  }

  let response = await documentClient.get(params).promise()
  let recipients = []
  if (response.Item && response.Item.recipients) {
    recipients = [...response.Item.recipients]
  }

  return {
    googleId: response.Item.googleId || null,
    recipients: recipients
  }
}

async function getRecipients (userTableName: string, googleId: string): Promise<RecipientListType> {
  const params = {
    TableName: userTableName,
    Key: {
      googleId
    }
  }

  let response = await documentClient.get(params).promise()
  let result = []
  if (response.Item && response.Item.recipients) {
    result = [...response.Item.recipients]
  }
  return {
    googleId: googleId,
    recipients: result
  }
}

async function removeRecipient (
  userTableName: string,
  googleId: string,
  recipient: RecipientType
): Promise<RecipientListType> {
  let { recipients } = await getRecipients(userTableName, googleId)

  recipients = recipients.filter((item: RecipientType): boolean => {
    return item.email !== recipient.email
  })

  const params = {
    TableName: userTableName,
    Key: {
      googleId
    },
    UpdateExpression: 'set recipients = :r',
    ExpressionAttributeValues: {
      ':r': recipients
    },
    ReturnValues: 'UPDATED_NEW'
  }

  let response = await documentClient.update(params).promise()
  return {
    googleId: googleId,
    recipients: response.Attributes.recipients
  }
}

async function addRecipient (
  userTableName: string,
  googleId: string,
  recipient: RecipientType
): Promise<{
  action: string,
  ...$Exact<RecipientListType>
}> {
  let { recipients } = await getRecipients(userTableName, googleId)
  const index = recipients.findIndex(
    (item: RecipientType): boolean => item.email === recipient.email
  )
  const now = Math.floor(Date.now() / 1000)
  // replace if exist
  if (index !== -1) {
    const { addedAt } = recipients[index]
    recipients.splice(index, 1, {
      updatedAt: now,
      addedAt,
      ...recipient
    })
  } else {
    recipients.push({ updatedAt: now, addedAt: now, ...recipient })
  }

  const params = {
    TableName: userTableName,
    Key: {
      googleId: googleId
    },
    UpdateExpression: 'set recipients = :r',
    ExpressionAttributeValues: {
      ':r': recipients
    },
    ReturnValues: 'UPDATED_NEW'
  }
  let response = await documentClient.update(params).promise()

  return {
    action: index === -1 ? 'ADDED' : 'MODIFIED',
    googleId: googleId,
    recipients: response.Attributes.recipients
  }
}

function _accountsEqual (account1: CryptoAccountType, account2: CryptoAccountType): boolean {
  if (account1.cryptoType === 'bitcoin') {
    return (
      account1.cryptoType === account2.cryptoType &&
      account1.xpub === account2.xpub &&
      account1.walletType === account2.walletType
    )
  } else
    return (
      account1.cryptoType === account2.cryptoType &&
      account1.address === account2.address &&
      account1.walletType === account2.walletType
    )
}

async function _updateCryptoAccounts (
  userTableName: string,
  googleId: string,
  cryptoAccounts: Array<CryptoAccountType>
): Promise<CryptoAccounResponsetType> {
  const params = {
    TableName: userTableName,
    Key: {
      googleId: googleId
    },
    UpdateExpression: 'set cryptoAccounts = :c',
    ExpressionAttributeValues: {
      ':c': cryptoAccounts
    },
    ReturnValues: 'UPDATED_NEW'
  }
  let response = await documentClient.update(params).promise()
  return {
    cryptoAccounts: response.Attributes.cryptoAccounts
  }
}

async function getCryptoAccounts (
  userTableName: string,
  googleId: string
): Promise<CryptoAccounResponsetType> {
  const params = {
    TableName: userTableName,
    Key: {
      googleId
    }
  }
  let response = await documentClient.get(params).promise()
  let result = []
  if (!response.Item || !response.Item.googleId) {
    throw new Error('User not found.')
  }
  if (response.Item && response.Item.cryptoAccounts) {
    result = [...response.Item.cryptoAccounts]
  }
  return {
    cryptoAccounts: result
  }
}

async function addCryptoAccount (
  userTableName: string,
  googleId: string,
  account: CryptoAccountType
): Promise<CryptoAccounResponsetType> {
  let { cryptoAccounts } = await getCryptoAccounts(userTableName, googleId)
  // if crypto account not exists, add
  if (
    cryptoAccounts.findIndex((item: CryptoAccountType): boolean => {
      return _accountsEqual(item, account)
    }) < 0
  ) {
    const now = Math.floor(Date.now() / 1000)
    account.addedAt = now
    account.updatedAt = now
    cryptoAccounts.push(account)
    return _updateCryptoAccounts(userTableName, googleId, cryptoAccounts)
  } else {
    throw new Error('Account already exists')
  }
}

async function removeCryptoAccount (
  userTableName: string,
  googleId: string,
  account: CryptoAccountType
): Promise<CryptoAccounResponsetType> {
  let { cryptoAccounts } = await getCryptoAccounts(userTableName, googleId)
  if (cryptoAccounts.length > 0) {
    cryptoAccounts = cryptoAccounts.filter((_account: CryptoAccountType): boolean => {
      return !_accountsEqual(_account, account)
    })
    return _updateCryptoAccounts(userTableName, googleId, cryptoAccounts)
  }
  return { cryptoAccounts }
}

async function modifyCryptoAccountName (
  userTableName: string,
  googleId: string,
  account: CryptoAccountType
): Promise<CryptoAccounResponsetType> {
  let { cryptoAccounts } = await getCryptoAccounts(userTableName, googleId)
  let exist = false
  cryptoAccounts = cryptoAccounts.map((item: CryptoAccountType): CryptoAccountType => {
    if (_accountsEqual(item, account)) {
      item.name = account.name
      const now = Math.floor(Date.now() / 1000)
      account.updatedAt = now
      exist = true
    }
    return item
  })
  if (exist !== true) {
    throw new Error('Account not found')
  }
  if (cryptoAccounts.length > 0) {
    return _updateCryptoAccounts(userTableName, googleId, cryptoAccounts)
  } else {
    return { cryptoAccounts }
  }
}

async function clearCloudWalletCryptoAccounts (
  userTableName: string,
  googleId: string
): Promise<CryptoAccounResponsetType> {
  let { cryptoAccounts } = await getCryptoAccounts(userTableName, googleId)
  if (cryptoAccounts.length > 0) {
    cryptoAccounts = cryptoAccounts.filter((_account: CryptoAccountType): boolean => {
      return _account.walletType !== 'drive'
    })
    return _updateCryptoAccounts(userTableName, googleId, cryptoAccounts)
  }
  return { cryptoAccounts }
}

// eslint-disable-next-line flowtype/no-weak-types
exports.handler = async (event: any, context: Context, callback: Callback) => {
  let request = JSON.parse(event.body)

  // eslint-disable-next-line flowtype/no-weak-types
  function handleResults (rv: Object, err: Object) {
    let response = {
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
      response.body = err.message
      callback(null, response)
    }
  }

  try {
    let rv = null
    let googleId = await verifyGoogleIdToken(googleAPIConfig['clientId'], request.idToken)

    if (request.action === 'REGISTER') {
      rv = await register(userTableName, googleId)
    } else if (request.action === 'GET_USER') {
      rv = await getUser(userTableName, googleId)
    } else if (request.action === 'GET_RECIPIENTS') {
      rv = await getRecipients(userTableName, googleId)
    } else if (request.action === 'REMOVE_RECIPIENT') {
      rv = await removeRecipient(userTableName, googleId, request.recipient)
    } else if (request.action === 'ADD_RECIPIENT') {
      rv = await addRecipient(userTableName, googleId, request.recipient)
    } else if (request.action === 'ADD_CRYPTO_ACCOUNT') {
      rv = await addCryptoAccount(userTableName, googleId, request.account)
    } else if (request.action === 'REMOVE_CRYPTO_ACCOUNT') {
      rv = await removeCryptoAccount(userTableName, googleId, request.account)
    } else if (request.action === 'MODIFY_CRYPTO_ACCOUNT_NAME') {
      rv = await modifyCryptoAccountName(userTableName, googleId, request.account)
    } else if (request.action === 'GET_CRYPTO_ACCOUNTS') {
      rv = await getCryptoAccounts(userTableName, googleId)
    } else if (request.action === 'CLEAR_CLOUD_WALLET_CRYPTO_ACCOUNTS') {
      rv = await clearCloudWalletCryptoAccounts(userTableName, googleId)
    } else {
      throw new Error('Invalid command')
    }
    handleResults(rv)
  } catch (err) {
    handleResults(null, err)
  }
}
