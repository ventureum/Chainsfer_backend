// @flow
import CoinGecko from 'coingecko-api'
import bcrypt from 'bcryptjs'
import uuidv1 from 'uuid/v1'
import Web3 from 'web3'
import axios from 'axios'
import { getUser } from './userOps'
import { sendTransfer } from './dynamoDBTxOps'
import EthMultiSig from './EthMultiSig'
import { Base64 } from 'js-base64'
const utils = require('./utils')
const AWS = require('aws-sdk')
AWS.config.update({ region: 'us-east-1' })
const Config = require('./config.js')

if (!process.env.ENV_VALUE) throw new Error('ENV_VALUE missing')
const deploymentStage = process.env.ENV_VALUE.toLowerCase()

if (!process.env.USER_TABLE_NAME) throw new Error('USER_TABLE_NAME missing')
const userTableName = process.env.USER_TABLE_NAME

async function promoteTransfer (request: { receiverName: string, destination: string }) {
  // utils functions
  async function getCryptoPrice (
    cryptoTypes: Array<string>,
    currency: string
    // $FlowFixMe
  ): Promise<{
    [string]: number
  }> {
    const CoinGeckoClient = new CoinGecko()
    // api only accepts lowercase currency symbol
    currency = currency.toLowerCase()
    try {
      var resp = await CoinGeckoClient.simple.price({
        ids: cryptoTypes,
        vs_currencies: [currency]
      })
      if (resp && resp.code === 200) {
        let rv = {}
        for (let cryptoType of cryptoTypes) {
          rv[cryptoType] = resp.data[cryptoType][currency]
        }
        return rv
      }
    } catch (e) {
      console.warn(e)
    }
  }

  /*
   * cryptr is a simple aes-256-ctr encrypt and decrypt module for node.js
   *
   * Usage:
   *
   * const cryptr = new Cryptr('myTotalySecretKey');
   *
   * const encryptedString = cryptr.encrypt('bacon');
   * const decryptedString = cryptr.decrypt(encryptedString);
   *
   * console.log(encryptedString); // 5590fd6409be2494de0226f5d7
   * console.log(decryptedString); // bacon
   */
  function Cryptr (secret: string) {
    if (!secret || typeof secret !== 'string') {
      throw new Error('Cryptr: secret must be a non-0-length string')
    }

    const crypto = require('crypto')
    const algorithm = 'aes-256-ctr'
    const key = crypto.createHash('sha256').update(String(secret)).digest()

    this.encrypt = function encrypt (value: string): string {
      if (value == null) {
        throw new Error('value must not be null or undefined')
      }

      const iv = crypto.randomBytes(16)
      const cipher = crypto.createCipheriv(algorithm, key, iv)
      const encrypted = cipher.update(String(value), 'utf8', 'hex') + cipher.final('hex')

      return iv.toString('hex') + encrypted
    }

    this.decrypt = function decrypt (value: string): string {
      if (value == null) {
        throw new Error('value must not be null or undefined')
      }

      const stringValue = String(value)
      const iv = Buffer.from(stringValue.slice(0, 32), 'hex')
      const encrypted = stringValue.slice(32)

      const decipher = crypto.createDecipheriv(algorithm, key, iv)
      return decipher.update(encrypted, 'hex', 'utf8') + decipher.final('utf8')
    }
  }

  async function encryptMessage (message: string, password: string): Promise<string> {
    const cryptr = new Cryptr(password)
    return JSON.stringify({
      hash: await bcrypt.hash(message, 10),
      encryptedMessage: cryptr.encrypt(message)
    })
  }

  function createWalletId (): string {
    // generate a wallet id
    // 32-byte buffer
    const buffer = Buffer.alloc(32)
    // first 16 bytes
    uuidv1(null, buffer, 0)
    // last 16 bytes
    uuidv1(null, buffer, 16)
    // convert to hex
    return '0x' + buffer.toString('hex')
  }

  function getItemBuilder (): {
    TableName: string,
    Limit: string,
    ConsistentRead: boolean
  } {
    return {
      TableName: 'AlphaTestEthereumAddress',
      Limit: '1',
      ConsistentRead: true
    }
  }

  async function _web3SendTransactionPromise (
    // eslint-disable-next-line
    web3Function: Function,
    // eslint-disable-next-line
    txObj: Object
  ): Promise<string> {
    // eslint-disable-next-line
    return new Promise((resolve: Function, reject: Function) => {
      web3Function(txObj)
        // eslint-disable-next-line
        .on('transactionHash', (hash: string): any => resolve(hash))
        // eslint-disable-next-line
        .on('error', error => reject(error))
    })
  }

  function deleteItemBuilder (
    address: string
  ): {
    Key: {
      address: {
        S: string
      }
    },
    TableName: string,
    ReturnValues: string
  } {
    return {
      Key: {
        address: {
          S: address
        }
      },
      TableName: 'AlphaTestEthereumAddress',
      ReturnValues: 'ALL_OLD'
    }
  }

  const { receiverName, destination } = request

  // only unregistered user can call this function
  try {
    await getUser(userTableName, null, destination)
    // expecting getUser to throw, otherwise throw error
    // to indiciate registered users
    throw new Error('Must be an unregistered user')
  } catch (e) {
    if (e.message !== 'User not found') {
      throw e
    }
  }

  // fetch private key
  const dynamodb = new AWS.DynamoDB({ region: 'us-east-1' })
  let result = await dynamodb.scan(getItemBuilder()).promise()
  let masterPrivateKey
  let masterAddress
  if (result.Count !== 0) {
    masterAddress = result.Items[0].address.S
    masterPrivateKey = result.Items[0].privateKey.S
  } else {
    throw new Error('ETH test account list exhausted.')
  }

  const CRYPTO_TYPE = 'ethereum'

  // get real-time price
  const cryptoPrices = await getCryptoPrice([CRYPTO_TYPE], 'usd')

  const TRANSFER_AMOUNT = '0.1'
  const TRANSFER_CURRENCY_AMOUNT = parseFloat(TRANSFER_AMOUNT) * cryptoPrices[CRYPTO_TYPE]

  const web3 = new Web3(
    new Web3(
      new Web3.providers.HttpProvider(
        `https://${deploymentStage === 'prod' ? 'mainnet' : 'rinkeby'}.infura.io/v3/${
          Config.InfuraAPIKey
        }`
      )
    )
  )

  const escrowWallet = web3.eth.accounts.create()
  const escrowAddress = escrowWallet.address
  const encryptedPrivateKey = await encryptMessage(escrowWallet.privateKey, 'welcome2020')

  // create a master wallet to executing transfers
  const masterWallet = web3.eth.accounts.privateKeyToAccount(masterPrivateKey)
  web3.eth.accounts.wallet.add(masterWallet)
  const MASTER_ADDRESS = masterWallet.address

  const value = web3.utils.toWei(TRANSFER_AMOUNT, 'ether')
  const walletId = createWalletId()
  const txObj: {
    to: string,
    data: string,
    value: string
  } = await EthMultiSig.getSendToEscrowTxObj(
    walletId,
    MASTER_ADDRESS,
    escrowAddress,
    web3.utils.numberToHex(value),
    CRYPTO_TYPE
  )

  // send transfer out
  const gasStationEstimation = await axios.get(
    'https://ethgasstation.info/api/ethgasAPI.json?api-key=279d99b400658d984d0b9b511fad2a03bcef7e246ea6d1890787abb5a1e8'
  )

  // gasPrice returned is in gwei x 10, => * 10^8 wei
  const gasPriceFast = web3.utils.toWei((gasStationEstimation.data.fast / 10).toString(), 'Gwei')

  // add gas info to tx
  let completeTxObj = {
    ...txObj,
    gasPrice: web3.utils.numberToHex(gasPriceFast)
  }

  const signedTx = await masterWallet.signTransaction(completeTxObj)

  // debugging purpose, do not remove
  console.log('SignedTx: ', signedTx)

  const sendTxHash = await _web3SendTransactionPromise(
    web3.eth.sendSignedTransaction,
    signedTx.rawTransaction
  )

  // delete account
  await dynamodb.deleteItem(deleteItemBuilder(masterAddress)).promise()

  // create a transfer object
  const transferRequestDryRun = {
    // sender
    senderName: 'Chainsfr',
    senderAvatar:
      'https://lh3.googleusercontent.com/a-/AOh14Gjt0jv6qW-NKbUwIFXtug6YfYNwkNmYdtObdYgi=s96-c',
    sender: 'support@chainsfr.com',
    senderAccount: JSON.stringify({
      cryptoType: 'ethereum',
      walletType: 'drive',
      address: MASTER_ADDRESS,
      name: 'Ethereum Cloud Wallet'
    }),
    // receiver
    receiverName,
    destination,
    // crypto
    cryptoType: CRYPTO_TYPE,
    cryptoSymbol: 'ETH',
    transferAmount: TRANSFER_AMOUNT,
    transferFiatAmountSpot: utils.formatNumber(TRANSFER_CURRENCY_AMOUNT.toString()),
    fiatType: 'USD',
    exchangeRate: {
      cryptoExchangeRate: cryptoPrices[CRYPTO_TYPE],
      txFeeCryptoExchangeRate: cryptoPrices[CRYPTO_TYPE]
    },
    data: Base64.encode(JSON.stringify(encryptedPrivateKey)),
    // others
    sendMessage: 'Welcome to Chainsfr!',
    // multisig wallet
    walletId
  }

  // $FlowFixMe
  const dryRunResp = await sendTransfer(transferRequestDryRun)

  const transferRequest = {
    ...transferRequestDryRun,
    sendTxHash,
    transferId: dryRunResp.transferId
  }

  // $FlowFixMe
  await sendTransfer(transferRequest)
}

export default { promoteTransfer }
