// @flow
import type { Context, Callback } from 'flow-aws-lambda'
import type {
  RecipientType,
  UserProfileType,
  CloudWalletFolderMetaType,
  UserTagType,
  UserType,
  RecipientListType,
  CryptoAccountType,
  CryptoAccounResponsetType
} from './user.flow'
import { verifyGoogleIdToken, resetTransfers } from './dynamoDBTxOps.js'
import type { TransferDataType } from './transfer.flow'
import moment from 'moment'

var referralWallet = require('./referralWallet.js')
var Config = require('./config.js')
const AWS = require('aws-sdk')
AWS.config.update({ region: 'us-east-1' })
var documentClient = new AWS.DynamoDB.DocumentClient()
var generator = require('generate-password')

if (!process.env.USER_TABLE_NAME) throw new Error('USER_TABLE_NAME missing')
const userTableName = process.env.USER_TABLE_NAME
if (!process.env.ENV_VALUE) throw new Error('ENV_VALUE missing')
const deploymentStage = process.env.ENV_VALUE.toLowerCase()

const googleAPIConfig =
  Config.GoogleAPIConfig[deploymentStage] || Config.GoogleAPIConfig['default']

function generateMasterKey (): string {
  return generator.generate({
    length: 16,
    numbers: true,
    symbols: true,
    lowercase: true,
    uppercase: true,
    strict: true
  })
}

async function register (
  userTableName: string,
  googleId: string,
  email: string,
  profile: UserProfileType
): Promise<{
  newUser: boolean,
  googleId: string,
  recipients: Array<RecipientType>
}> {
  try {
    const user = await getUser(userTableName, googleId)
    return {
      newUser: false,
      ...user,
      masterKey: user.masterKey ? user.masterKey : generateMasterKey()
    }
  } catch (e) {
    if (e.message === 'User not found') {
      const now = Math.floor(Date.now() / 1000)

      const newEntry = {
        googleId: googleId,
        recipients: [],
        profile: profile,
        tags: {
          dappUser: false,
          dappOwner: false,
          invoiceUser: false
        },
        email: email,
        registerTime: now,
        masterKey: generateMasterKey()
      }
      await documentClient
        .put({
          TableName: userTableName,
          Item: newEntry
        })
        .promise()

      return {
        newUser: true,
        ...newEntry
      }
    }
    throw e
  }
}

async function getUser (
  userTableName: string,
  googleId: ?string,
  email: ?string
): Promise<UserType> {
  let params
  if (googleId) {
    // query by primary key
    params = {
      TableName: userTableName,
      KeyConditionExpression: '#gid = :gid',
      ExpressionAttributeNames: {
        '#gid': 'googleId'
      },
      ExpressionAttributeValues: {
        ':gid': googleId
      }
    }
  } else if (email) {
    // query by secondary index
    params = {
      TableName: userTableName,
      IndexName: 'emailIndex',
      KeyConditionExpression: 'email = :em',
      ExpressionAttributeValues: {
        ':em': email
      }
    }
  } else {
    throw new Error('Invalid params')
  }

  let response = await documentClient.query(params).promise()
  if (response.Count < 1) throw new Error('User not found')

  return response.Items[0]
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

  // updating recipient imageUrl
  let recipientModified = false
  const currentTimestamp = moment().unix()
  for (let i = 0; i < result.length; i++) {
    let recipient = result[i]
    if (
      !recipient.registeredUserUpdatedAt ||
      recipient.registeredUserUpdatedAt + 2592000 < currentTimestamp // one month
    ) {
      try {
        let recipientUser = await getUser(userTableName, null, recipient.email)
        result[i].registeredUser = true
        result[i].registeredUserUpdatedAt = moment().unix()
        recipientModified = true
      } catch (e) {
        if (e.message === 'User not found') {
          if (result[i].registeredUser === true) {
            // if the recipient was a user, but not any more, update it
            result[i].registeredUser = false
            result[i].registeredUserUpdatedAt = moment().unix()
            recipientModified = true
          }
        } else {
          throw e
        }
      }
    }
    if (!recipient.imageUrlUpdatedAt || recipient.imageUrlUpdatedAt + 604800 < currentTimestamp) {
      // if last update was more than 1 week ago or has not been updated yet
      try {
        let recipientUser = await getUser(userTableName, null, recipient.email)
        result[i].imageUrl = recipientUser.profile.imageUrl
        result[i].imageUrlUpdatedAt = currentTimestamp
        recipientModified = true
      } catch (e) {
        // ignore user not found error
        if (e.message !== 'User not found') {
          throw e
        }
      }
    }
  }

  if (recipientModified) {
    // update recipients
    const params = {
      TableName: userTableName,
      Key: {
        googleId: googleId
      },
      UpdateExpression: 'set recipients = :r',
      ExpressionAttributeValues: {
        ':r': result
      },
      ReturnValues: 'UPDATED_NEW'
    }
    await documentClient.update(params).promise()
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
    try {
      // add imageUrl if available
      let recipientUser = await getUser(userTableName, null, recipient.email)
      recipient.registeredUser = true
      recipient.registeredUserUpdatedAt = moment().unix()
      recipient.imageUrl = recipientUser.profile.imageUrl
      recipient.imageUrlUpdatedAt = moment().unix()
    } catch (e) {
      if (e.message === 'User not found') {
        // set registeredUser to false if recipient not found in user data
        recipient.registeredUser = false
        recipient.registeredUserUpdatedAt = moment().unix()
      } else {
        throw e
      }
    }
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

function _getAccountId (account: CryptoAccountType): string {
  if (account.cryptoType === 'bitcoin' && account.xpub) {
    return JSON.stringify({
      cryptoType: account.cryptoType.toLowerCase(),
      walletType: account.walletType.toLowerCase(),
      // $FlowFixMe
      xpub: account.xpub.toLowerCase()
    })
  }
  return JSON.stringify({
    cryptoType: account.cryptoType.toLowerCase(),
    walletType: account.walletType.toLowerCase(),
    // $FlowFixMe
    address: account.address.toLowerCase()
  })
}

function _accountsEqual (account1: CryptoAccountType, account2: CryptoAccountType): boolean {
  if (!account1.id) account1.id = _getAccountId(account1)
  if (!account2.id) account2.id = _getAccountId(account2)
  return account1.id === account2.id
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

async function addCryptoAccounts (
  userTableName: string,
  googleId: string,
  payloadAccounts: Array<CryptoAccountType>
): Promise<CryptoAccounResponsetType> {
  let { cryptoAccounts } = await getCryptoAccounts(userTableName, googleId)
  let accountDict = {}

  cryptoAccounts.forEach((account: CryptoAccountType) => {
    accountDict[_getAccountId(account)] = account
  })

  payloadAccounts.forEach((newAccount: CryptoAccountType) => {
    if (!accountDict[_getAccountId(newAccount)]) {
      // if crypto account does not exist then add
      const now = Math.floor(Date.now() / 1000)
      newAccount.addedAt = now
      newAccount.updatedAt = now
      cryptoAccounts.push(newAccount)
    } else {
      throw new Error('Account already exists')
    }
  })

  return _updateCryptoAccounts(userTableName, googleId, cryptoAccounts)
}

async function removeCryptoAccounts (
  userTableName: string,
  googleId: string,
  payloadAccounts: Array<CryptoAccountType>
): Promise<CryptoAccounResponsetType> {
  let { cryptoAccounts } = await getCryptoAccounts(userTableName, googleId)
  if (cryptoAccounts.length > 0) {
    let toBeRemovedDict = {}

    payloadAccounts.forEach((account: CryptoAccountType) => {
      toBeRemovedDict[_getAccountId(account)] = account
    })

    cryptoAccounts = cryptoAccounts.filter((_account: CryptoAccountType): boolean => {
      return toBeRemovedDict[_getAccountId(_account)] === undefined
    })
    return _updateCryptoAccounts(userTableName, googleId, cryptoAccounts)
  }
  return { cryptoAccounts }
}

async function modifyCryptoAccountNames (
  userTableName: string,
  googleId: string,
  payloadAccounts: Array<CryptoAccountType>
): Promise<CryptoAccounResponsetType> {
  let { cryptoAccounts } = await getCryptoAccounts(userTableName, googleId)
  let exist = false
  let toBeModifiedDict = {}

  payloadAccounts.forEach((account: CryptoAccountType) => {
    toBeModifiedDict[_getAccountId(account)] = account
  })

  cryptoAccounts = cryptoAccounts.map((item: CryptoAccountType): CryptoAccountType => {
    const match = toBeModifiedDict[_getAccountId(item)]
    if (match) {
      item.name = match.name
      const now = Math.floor(Date.now() / 1000)
      item.updatedAt = now
      exist = true
    }
    return item
  })

  if (exist !== true) {
    throw new Error('Account not found')
  }

  return _updateCryptoAccounts(userTableName, googleId, cryptoAccounts)
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

async function updateUserCloudWalletFolderMeta (
  userTableName: string,
  googleId: string,
  newMetaInfo: CloudWalletFolderMetaType
): Promise<CloudWalletFolderMetaType> {
  let user = await getUser(userTableName, googleId)
  const oldMeta = user.cloudWalletFolderMeta
  user.cloudWalletFolderMeta = { ...oldMeta, ...newMetaInfo }

  const params = {
    TableName: userTableName,
    Key: {
      googleId
    },
    UpdateExpression: 'set cloudWalletFolderMeta = :c',
    ExpressionAttributeValues: {
      ':c': user.cloudWalletFolderMeta
    },
    ReturnValues: 'UPDATED_NEW'
  }

  let response = await documentClient.update(params).promise()

  return response.Attributes.cloudWalletFolderMeta
}

async function getUserCloudWalletFolderMeta (
  userTableName: string,
  googleId: string
): Promise<CloudWalletFolderMetaType> {
  let user = await getUser(userTableName, googleId)
  return user.cloudWalletFolderMeta || {}
}

async function resetUser (
  userTableName: string,
  googleId: string,
  data: {
    email: ?string,
    profile: ?UserProfileType,
    registerTime: ?number,
    masterKey: ?string,
    cloudWalletFolderMeta: ?CloudWalletFolderMetaType,
    recipients: ?Array<RecipientType>,
    accounts: ?Array<CryptoAccountType>,
    transfers: ?Array<TransferDataType>
  }
) {
  // remove user if it exists
  try {
    const user = await getUser(userTableName, googleId)
    // user exist, remove it
    const deleteParams = {
      TableName: userTableName,
      Key: {
        googleId: googleId
      }
    }
    await documentClient.delete(deleteParams).promise()
  } catch (e) {
    if (e.message !== 'User not found') {
      throw e
    }
  }

  // register user
  await register(userTableName, googleId, data.email || '', data.profile || {})

  // overwrite/udpate attributes
  for (let [k, v] of Object.entries(data)) {
    if (!v) continue
    if (k === 'transfers') {
      const userData = await getUser(userTableName, googleId)
      await resetTransfers(userData.email, data.transfers)
    } else {
      const params = {
        TableName: userTableName,
        Key: {
          googleId
        },
        UpdateExpression: `set ${k} = :val`,
        ExpressionAttributeValues: {
          ':val': v
        },
        ReturnValues: 'UPDATED_NEW'
      }
      await documentClient.update(params).promise()
    }
  }
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
      googleId = await verifyGoogleIdToken(googleAPIConfig['clientId'], idToken)
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
