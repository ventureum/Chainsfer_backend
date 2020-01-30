// @flow

var ethers = require('ethers')
var ethProviderTest = ethers.getDefaultProvider('rinkeby')
let ethProviderMain = ethers.getDefaultProvider('homestead')
var request = require('request-promise')

const BlockcypherMainURL = 'https://api.blockcypher.com/v1/btc/main'
const BlockcypherTest3URL = 'https://api.blockcypher.com/v1/btc/test3'
const InfuraAPIKey = '9775236247814824bc231e65b1d4972a'
const BlockcypherMainTxURL = 'https://api.blockcypher.com/v1/btc/main/txs/'
const BlockcypherTest3TxURL = 'https://api.blockcypher.com/v1/btc/test3/txs/'

// eslint-disable-next-line flowtype/no-weak-types
async function getBtcTx (txHash: string, apiUrl: string): Promise<Object> {
  try {
    const options = {
      method: 'GET',
      uri: apiUrl + '/txs/' + txHash
    }
    let response = await request(options).promise()
    return JSON.parse(response)
  } catch (err) {
    throw new Error('Unable to get Btc Tx. Error: ' + err.message)
  }
}

const TxConfirmationConfig = {
  ethereum: {
    delaySeconds: 60,
    maxRetry: 20
  },
  dai: {
    delaySeconds: 60,
    maxRetry: 20
  },
  bitcoin: {
    delaySeconds: 600,
    maxRetry: 6
  },
  libra: {
    delaySeconds: 60,
    maxRetry: 6
  }
}

const RootUrlConfig: { [key: string]: string } = {
  prod: 'app.chainsfr.com',
  staging: 'testnet.chainsfr.com',
  test: 'testnet.chainsfr.com',
  default: 'testnet.chainsfr.com'
}

const ExpirationLengthConfig: { [key: string]: number } = {
  prod: 2419200, // 28 days
  staging: 864000, // 10 days
  test: 864000, // 10 days
  default: 864000 // 10 days
}

const ReminderIntervalConfig: { [key: string]: number } = {
  prod: 604800, // 7 days
  staging: 432000, // 5 days
  test: 432000, // 5 days
  default: 432000 // 5 days
}

const BtcAPIConfig: { [key: string]: string } = {
  prod: BlockcypherMainURL,
  staging: BlockcypherTest3URL,
  test: BlockcypherTest3URL,
  default: BlockcypherTest3URL
}

const BtcNetworkConfig: { [key: string]: string } = {
  prod: 'mainnet',
  staging: 'testnet',
  test: 'testnet',
  default: 'testnet'
}
// eslint-disable-next-line flowtype/no-weak-types
const BtcTxAPIConfig: { [key: string]: any } = {
  prod: BlockcypherMainTxURL,
  staging: BlockcypherTest3TxURL,
  test: BlockcypherTest3TxURL,
  default: BlockcypherTest3TxURL
}

// eslint-disable-next-line flowtype/no-weak-types
const EthTxAPIConfig: { [key: string]: any } = {
  prod: ethProviderMain,
  staging: ethProviderTest,
  test: ethProviderTest,
  default: ethProviderTest
}

const EthChainId: { [key: string]: number } = {
  // EIP 155 chainId - mainnet: 1, rinkeby: 4
  prod: 1,
  staging: 4,
  test: 4,
  default: 4
}

const ChainIdMap: { [key: string]: string } = {
  '1': 'mainnet',
  '4': 'rinkeby'
}

const GoogleAPIConfig: {
  [key: string]: {
    clientId: string,
    apiScope: string,
    apiDiscoveryDocs: string
  }
} = {
  prod: {
    clientId: '754636752811-94f1mrkatm9vdbe22c56oiirr5gkkgme.apps.googleusercontent.com',
    apiScope:
      'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.appdata',
    apiDiscoveryDocs: 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'
  },
  staging: {
    clientId: '754636752811-94f1mrkatm9vdbe22c56oiirr5gkkgme.apps.googleusercontent.com',
    apiScope:
      'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.appdata',
    apiDiscoveryDocs: 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'
  },
  test: {
    clientId: '754636752811-j7123ts13jt3mnjt9bgee7101jq4ndfu.apps.googleusercontent.com',
    apiScope:
      'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.appdata',
    apiDiscoveryDocs: 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'
  },
  default: {
    clientId: '754636752811-j7123ts13jt3mnjt9bgee7101jq4ndfu.apps.googleusercontent.com',
    apiScope:
      'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.appdata',
    apiDiscoveryDocs: 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'
  }
}

const LedgerApiUrlConfig: { [key: string]: string } = {
  prod: 'https://api.ledgerwallet.com/blockchain/v2/btc',
  staging: 'https://api.ledgerwallet.com/blockchain/v2/btc_testnet',
  test: 'https://api.ledgerwallet.com/blockchain/v2/btc_testnet',
  default: 'https://api.ledgerwallet.com/blockchain/v2/btc_testnet'
}

const QueueURLPrefix = 'https://sqs.us-east-1.amazonaws.com/727151012682/'

// list of token data
const ERC20Tokens = {
  dai: {
    symbol: 'DAI',
    address: '0x4aacB7f0bA0A5CfF9A8a5e8C0F24626Ee9FDA4a6',
    decimals: 18
  }
}

module.exports = {
  RootUrlConfig,
  TxConfirmationConfig: TxConfirmationConfig,
  QueueURLPrefix: QueueURLPrefix,
  ExpirationLengthConfig: ExpirationLengthConfig,
  ReminderIntervalConfig: ReminderIntervalConfig,
  BtcAPIConfig: BtcAPIConfig,
  EthTxAPIConfig: EthTxAPIConfig,
  BtcNetworkConfig: BtcNetworkConfig,
  getBtcTx: getBtcTx,
  GoogleAPIConfig: GoogleAPIConfig,
  LedgerApiUrlConfig: LedgerApiUrlConfig,
  EthChainId: EthChainId,
  ERC20Tokens: ERC20Tokens,
  InfuraAPIKey: InfuraAPIKey,
  ChainIdMap: ChainIdMap
}
