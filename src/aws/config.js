// @flow
import { ERC20TokensList } from '../aws/ERC20Tokens'
import type { EthContractType } from './ethContracts.flow'
import { ethers } from 'ethers'

import request from 'request-promise'

const InfuraAPIKey = '100db43af19d4ad7b24fe4957bdf5adb'
var ethProviderTest = new ethers.providers.InfuraProvider('rinkeby', InfuraAPIKey)
var ethProviderMain = new ethers.providers.InfuraProvider('homestead', InfuraAPIKey)

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

const getTxConfirmationConfig = (
  cryptoType: string
): { delaySeconds: number, maxRetry: number } => {
  switch (cryptoType) {
    case 'bitcon':
      return {
        delaySeconds: 600,
        maxRetry: 72 // 12 hours
      }
    case 'ethereum':
      return {
        delaySeconds: 600,
        maxRetry: 72 // 12 hours
      }
    default:
      return {
        delaySeconds: 60,
        maxRetry: 20
      }
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

// list of token data
let ERC20Tokens = {}
ERC20TokensList.forEach((token: { ...$Exact<EthContractType>, testnetAddress: string }) => {
  ERC20Tokens[token.cryptoType] = token
  if (deploymentStage !== 'prod') {
    ERC20Tokens[token.cryptoType].address = token.testnetAddress
  }
})

function getAllowOrigin (headers?: { origin?: string }): string {
  let origin = ''
  if (headers && headers.origin) {
    origin = headers.origin
  }
  let allowedOrigin = 'https://app.chainsfr.com' // default
  // e2e test resetUser request does not have origin
  if (!origin && !['prod', 'staging'].includes(deploymentStage)) {
    allowedOrigin = '*'
  } else if (
    origin.endsWith('.serveo.ventureum.io') ||
    origin.endsWith('chainsfr.com') ||
    !['prod', 'staging'].includes(deploymentStage)
  ) {
    allowedOrigin = origin
  }
  return allowedOrigin
}

export default {
  RootUrlConfig,
  getTxConfirmationConfig: getTxConfirmationConfig,
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
