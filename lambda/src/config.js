// @flow

var ethers = require('ethers')

const InfuraAPIKey = '100db43af19d4ad7b24fe4957bdf5adb'
var ethProviderTest = new ethers.providers.InfuraProvider('rinkeby', InfuraAPIKey)
var ethProviderMain = new ethers.providers.InfuraProvider('homestead', InfuraAPIKey)
var request = require('request-promise')

const BlockcypherMainURL = 'https://api.blockcypher.com/v1/btc/main'
const BlockcypherTest3URL = 'https://api.blockcypher.com/v1/btc/test3'

const BlockcypherMainTxURL = 'https://api.blockcypher.com/v1/btc/main/txs/'
const BlockcypherTest3TxURL = 'https://api.blockcypher.com/v1/btc/test3/txs/'

if (!process.env.ENV_VALUE) throw new Error('ENV_VALUE missing')
const deploymentStage = process.env.ENV_VALUE.toLowerCase()

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
  tether: {
    delaySeconds: 60,
    maxRetry: 20
  },
  'usd-coin': {
    delaySeconds: 60,
    maxRetry: 20
  },
  'true-usd': {
    delaySeconds: 60,
    maxRetry: 20
  },
  bitcoin: {
    delaySeconds: 600,
    maxRetry: 72 // 12 hours
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
  default: 300 // 5 minutes, local testing only
}

const ReminderIntervalConfig: { [key: string]: number } = {
  prod: 604800, // 7 days
  staging: 432000, // 5 days
  test: 432000, // 5 days
  default: 120 // 2 minutes, local testing only
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
    clientId: '915294581811-nshntthsp2umd3e4h2jtjtd06sgcoss6.apps.googleusercontent.com',
    apiScope:
      'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.appdata',
    apiDiscoveryDocs: 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'
  },
  default: {
    clientId: '915294581811-nshntthsp2umd3e4h2jtjtd06sgcoss6.apps.googleusercontent.com',
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

const addressMap = {
  dai: {
    rinkeby: '0x4aacB7f0bA0A5CfF9A8a5e8C0F24626Ee9FDA4a6',
    mainnet: '0x6B175474E89094C44Da98b954EedeAC495271d0F'
  },
  tether: {
    rinkeby: '0xF76eB2f15a960A5d96d046a00007EFd737e5ea14',
    mainnet: '0xdAC17F958D2ee523a2206206994597C13D831ec7'
  },
  'usd-coin': {
    rinkeby: '0xF76eB2f15a960A5d96d046a00007EFd737e5ea14',
    mainnet: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'
  },
  'true-usd': {
    rinkeby: '0x4aacB7f0bA0A5CfF9A8a5e8C0F24626Ee9FDA4a6',
    mainnet: '0x0000000000085d4780B73119b644AE5ecd22b376'
  }
}

// list of token data
const ERC20Tokens = {
  dai: {
    symbol: 'DAI',
    address:
      deploymentStage === 'prod' ? addressMap['dai']['mainnet'] : addressMap['dai']['rinkeby'],
    decimals: 18
  },
  tether: {
    symbol: 'USDT',
    address:
      deploymentStage === 'prod'
        ? addressMap['tether']['mainnet']
        : addressMap['tether']['rinkeby'],
    decimals: 6
  },
  'usd-coin': {
    symbol: 'USDC',
    address:
      deploymentStage === 'prod'
        ? addressMap['usd-coin']['mainnet']
        : addressMap['usd-coin']['rinkeby'],
    decimals: 6
  },
  'true-usd': {
    symbol: 'TUSD',
    address:
      deploymentStage === 'prod'
        ? addressMap['true-usd']['mainnet']
        : addressMap['true-usd']['rinkeby'],
    decimals: 18
  }
}

function getAllowOrigin (origin: string): string {
  let allowedOrigin = 'https://app.chainsfr.com' // default
  // e2e test resetUser request does not have origin
  if (!origin && !['prod', 'staging'].includes(deploymentStage)) {
    allowedOrigin = origin
  }
  else if (
    origin.endsWith('.serveo.ventureum.io') ||
    origin.endsWith('chainsfr.com') ||
    !['prod', 'staging'].includes(deploymentStage)
  ) {
    allowedOrigin = origin
  }
  return allowedOrigin
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
  ChainIdMap: ChainIdMap,
  getAllowOrigin: getAllowOrigin
}
