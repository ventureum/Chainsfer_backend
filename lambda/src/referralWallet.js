// @flow
/* eslint flowtype/no-weak-types: 0 */
import type { Context, Callback } from 'flow-aws-lambda'
import BN from 'bn.js'
import { Wallet, utils } from 'ethers'
import { verifyGoogleIdToken } from './dynamoDBTxOps.js'

const Config = require('./config.js')
const AWS = require('aws-sdk')
AWS.config.update({ region: 'us-east-1' })
let documentClient = new AWS.DynamoDB.DocumentClient()

if (!process.env.REFERRAL_WALLET_TABLE_NAME) throw new Error('USER_REFERRAL_TABLE_NAME missing')
const referralWalletTableName = process.env.REFERRAL_WALLET_TABLE_NAME
if (!process.env.ENV_VALUE) throw new Error('ENV_VALUE missing')
const deploymentStage = process.env.ENV_VALUE.toLowerCase()
if (!process.env.ETH_PRIVATE_KEY) throw new Error('ETH_PRIVATE_KEY missing')
const ethPrivateKey = process.env.ETH_PRIVATE_KEY

const googleAPIConfig = Config.GoogleAPIConfig[deploymentStage] || Config.GoogleAPIConfig['default']
const ethProvider = Config.EthTxAPIConfig[deploymentStage] || Config.EthTxAPIConfig['default']
const ethChainId = Config.EthChainId[deploymentStage] || Config.EthChainId['default']

const DEFAULT_INITIAL_BALANCE = '10000000000000000' // 0.01 ether in wei
const DEFAULT_GAS_LIMI = 21000
const DEFAULT_GAS_PRICE = 10000000000 // 10 gwei

type UserType = {
  googleId: string,
  balance: string, // in wei
  // Array of complete transaction receipts,
  // See https://docs.ethers.io/ethers.js/html/api-providers.html#transaction-receipts
  completedTx: Array<string>,
  lastTxHash: string,
  locked: boolean
}

async function lockAccount (googleId: string) {
  const lockParam = {
    TableName: referralWalletTableName,
    Key: {
      googleId
    },
    UpdateExpression: 'set locked = :l',
    ExpressionAttributeValues: {
      ':l': true
    }
  }
  await documentClient.update(lockParam).promise()
}

async function unlockAccount (googleId: string) {
  const unlockParam = {
    TableName: referralWalletTableName,
    Key: {
      googleId
    },
    UpdateExpression: 'set locked = :l',
    ExpressionAttributeValues: {
      ':l': false
    }
  }
  await documentClient.update(unlockParam).promise()
}

async function sendTrasaction (
  googleId: string,
  destination: string,
  transferAmount: string
): Promise<{ txHash: string }> {
  const params = {
    TableName: referralWalletTableName,
    Key: {
      googleId
    }
  }

  let response = await documentClient.get(params).promise()
  let result = []
  // if user exists
  if (response.Item) {
    let { googleId, balance, completedTx, lastTxHash, locked } = response.Item
    let _completedTx = completedTx
    if (lastTxHash) {
      const receipt = await ethProvider.getTransactionReceipt(lastTxHash)
      if (receipt && receipt.status === 1) {
        // previous tx confirmed
        _completedTx = [..._completedTx, receipt]
      } else {
        // previous tx not confirmed yet
        throw new Error(
          `Waiting for previous tx: ${lastTxHash} to be confirmed, please try again later`
        )
      }
    }
    const _balance = new BN(balance)
    const _transferAmount = new BN(transferAmount)
    if (_balance.gte(_transferAmount)) {
      // check account lock
      if (locked === false) {
        // lock account before proceeding
        await lockAccount(googleId)

        const _newBlance = _balance.sub(_transferAmount)

        let wallet = new Wallet(ethPrivateKey, ethProvider)
        const nonce = await ethProvider.getTransactionCount(wallet.address)
        const gasPrice = (await ethProvider.getGasPrice()).toString()
        const transaction = {
          nonce: nonce,
          gasLimit: DEFAULT_GAS_LIMI,
          gasPrice: gasPrice,
          to: destination,
          value: `0x${_transferAmount.toString(16)}`,
          data: '0x',
          chainId: ethChainId
        }
        const signedTx = await wallet.sign(transaction)
        let broadcastedTx = {}
        try {
          broadcastedTx = await ethProvider.sendTransaction(signedTx)
        } catch (err) {
          await unlockAccount(googleId)
          throw new Error('Broadcast tx failed: ' + err.message)
        }
        const updateParam = {
          TableName: referralWalletTableName,
          Item: {
            googleId: googleId,
            balance: _newBlance.toString(),
            completedTx: _completedTx,
            lastTxHash: broadcastedTx.hash,
            locked: false // unlock
          }
        }
        await documentClient.put(updateParam).promise()

        console.log(
          `User with googleId:${googleId} sent ${transferAmount} wei to ${destination}, txHash:${broadcastedTx.hash}`
        )
        return { txHash: broadcastedTx.hash }
      } else {
        throw new Error(
          'Transaction rejected due to another active transaction is in progress, please try again later.'
        )
      }
    } else {
      throw new Error('Insufficient funds')
    }
  } else {
    throw new Error(`User: ${googleId} does not exist`)
  }
}

async function getBalance (googleId: string): Promise<{ balance: string }> {
  const params = {
    TableName: referralWalletTableName,
    Key: {
      googleId
    }
  }

  let response = await documentClient.get(params).promise()
  let balance = '0'
  if (response.Item) {
    balance = response.Item.balance || '0'
  }
  return { balance: balance }
}

async function createAccount (googleId: string): Promise<{ balance: string }> {
  const params = {
    TableName: referralWalletTableName,
    Key: {
      googleId
    }
  }
  let response = await documentClient.get(params).promise()

  if (response.Item) {
    // if user exists return balance
    return { balance: response.Item.balance || '0' }
  } else {
    // if user does not exist, push new item and return balance
    const createParam = {
      TableName: referralWalletTableName,
      Item: {
        googleId: googleId,
        balance: DEFAULT_INITIAL_BALANCE,
        completedTx: [],
        lastTxHash: null,
        locked: false
      }
    }
    await documentClient.put(createParam).promise()
    return { balance: DEFAULT_INITIAL_BALANCE }
  }
}

exports.handler = async (event: any, context: Context, callback: Callback) => {
  let request = JSON.parse(event.body)

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
      response.body = err
      callback(null, response)
    }
  }

  try {
    let rv = null
    const { idToken, destination, transferAmount } = request
    let googleId = await verifyGoogleIdToken(googleAPIConfig['clientId'], idToken)

    if (request.action === 'SEND') {
      rv = await sendTrasaction(googleId, destination, transferAmount)
    } else if (request.action === 'BALANCE') {
      rv = await getBalance(googleId)
    } else if (request.action === 'CREATE') {
      rv = await createAccount(googleId)
    } else {
      throw new Error('Invalid command')
    }
    handleResults(rv)
  } catch (err) {
    handleResults(null, err)
  }
}
