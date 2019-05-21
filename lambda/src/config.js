// @flow

var ethers = require('ethers')
var ethProviderTest = ethers.getDefaultProvider('rinkeby')
let ethProviderMain = ethers.getDefaultProvider('homestead')
var request = require('request-promise')

const BlockcypherMainTxURL = 'https://api.blockcypher.com/v1/btc/main/txs/'
const BlockcypherTest3TxURL = 'https://api.blockcypher.com/v1/btc/test3/txs/'

async function getBtcTx (txHash: string, apiUrl: string) {
  try {
    const options = {
      method: 'GET',
      uri: apiUrl + txHash
    }
    let response = await request(options).promise()
    return JSON.parse(response)
  } catch (err) {
    throw new Error('Unable to get Btc Tx. Error: ' + err.message)
  }
}

const TxConfirmationConfig = {
  'ethereum': {
    'delaySeconds': 60,
    'maxRetry': 20
  },
  'dai': {
    'delaySeconds': 60,
    'maxRetry': 20
  },
  'bitcoin': {
    'delaySeconds': 600,
    'maxRetry': 6
  }
}

const RootUrlConfig: { [key: string]: string } = {
  'prod': 'chainsfer.io',
  'staging': 'testnet.chainsfer.io',
  'test': 'testnet.chainsfer.io',
  'default': 'testnet.chainsfer.io'
}

const ExpirationLengthConfig: { [key: string]: number } = {
  'prod': 2419200, // 28 days
  'staging': 600, // 10 mins
  'test': 600, // 10 mins
  'default': 600 // 10 mins
}

const ReminderIntervalConfig: { [key: string]: number } = {
  'prod': 604800, // 7 days
  'staging': 300, // 5 mins
  'test': 300, // 5 mins
  'default': 300 // 5 mins
}

const BtcTxAPIConfig: { [key:string]: any } = {
  'prod': BlockcypherMainTxURL,
  'staging': BlockcypherTest3TxURL,
  'test': BlockcypherTest3TxURL,
  'default': BlockcypherTest3TxURL
}

const EthTxAPIConfig: { [key: string]: any } = {
  'prod': ethProviderMain,
  'staging': ethProviderTest,
  'test': ethProviderTest,
  'default': ethProviderTest
}

const GoogleAPIConfig: { [key: string]: any} = {
  'prod': {
    'clientId': '754636752811-94f1mrkatm9vdbe22c56oiirr5gkkgme.apps.googleusercontent.com',
    'apiScope': 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.appdata',
    'apiDiscoveryDocs': 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'
  },
  'staging': {
    'clientId': '754636752811-94f1mrkatm9vdbe22c56oiirr5gkkgme.apps.googleusercontent.com',
    'apiScope': 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.appdata',
    'apiDiscoveryDocs': 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'
  },
  'test': {
    'clientId': '754636752811-j7123ts13jt3mnjt9bgee7101jq4ndfu.apps.googleusercontent.com',
    'apiScope': 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.appdata',
    'apiDiscoveryDocs': 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'
  },
  'default': {
    'clientId': '754636752811-j7123ts13jt3mnjt9bgee7101jq4ndfu.apps.googleusercontent.com',
    'apiScope': 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.appdata',
    'apiDiscoveryDocs': 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'
  }
}

const QueueURLPrefix = 'https://sqs.us-east-1.amazonaws.com/727151012682/'

module.exports = {
  RootUrlConfig,
  TxConfirmationConfig: TxConfirmationConfig,
  QueueURLPrefix: QueueURLPrefix,
  ExpirationLengthConfig: ExpirationLengthConfig,
  ReminderIntervalConfig: ReminderIntervalConfig,
  BtcTxAPIConfig: BtcTxAPIConfig,
  EthTxAPIConfig: EthTxAPIConfig,
  getBtcTx: getBtcTx,
  GoogleAPIConfig: GoogleAPIConfig
}
