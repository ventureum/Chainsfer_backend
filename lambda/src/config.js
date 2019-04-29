// @flow

var blockexplorerMain = require('blockchain.info/blockexplorer')
var blockexplorerTest3 = require('blockchain.info/blockexplorer').usingNetwork(3)
var ethers = require('ethers')
var ethProviderTest = ethers.getDefaultProvider('rinkeby')
let ethProviderMain = ethers.getDefaultProvider('homestead')

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

const ExpirationLengthConfig: { [key: string]: number } = {
  'prod': 2592000, // 1 month in seconds
  'staging': 300, // 5 mins
  'test': 300, // 5 mins
  'default': 300 // 5 mins
}

const BtcTxAPIConfig: { [key:string]: any } = {
  'prod': blockexplorerMain,
  'staging': blockexplorerTest3,
  'test': blockexplorerTest3,
  'default': blockexplorerTest3
}

const EthTxAPIConfig: { [key: string]: any } = {
  'prod': ethProviderMain,
  'staging': ethProviderTest,
  'test': ethProviderTest,
  'default': ethProviderTest
}

const QueueURLPrefix = 'https://sqs.us-east-1.amazonaws.com/727151012682/'

module.exports = {
  TxConfirmationConfig: TxConfirmationConfig,
  QueueURLPrefix: QueueURLPrefix,
  ExpirationLengthConfig: ExpirationLengthConfig,
  BtcTxAPIConfig: BtcTxAPIConfig,
  EthTxAPIConfig: EthTxAPIConfig
}
