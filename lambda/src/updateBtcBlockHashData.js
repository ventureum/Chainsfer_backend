// @flow
import type { Context, Callback } from 'flow-aws-lambda'
var AWS = require('aws-sdk')
AWS.config.update({ region: 'us-east-1' })
var Config = require('./config.js')
var Utils = require('./utils.js')
var bitcoin = require('bitcoinjs-lib')
var btcOps = require('./btcOps.js')

if (!process.env.BTC_BLOCK_HASH_DATA_TABLE_NAME) throw new Error('BTC_BLOCK_HASH_DATA_TABLE_NAME missing')
const BTC_BLOCK_HASH_DATA_TABLE_NAME = process.env.BTC_BLOCK_HASH_DATA_TABLE_NAME

if (!process.env.CHAINSFER_BTC_LAST_UPDATED_BLOCK_HASH_DATA_TABLE_NAME) throw new Error('CHAINSFER_BTC_LAST_UPDATED_BLOCK_HASH_DATA_TABLE_NAME missing')
const CHAINSFER_BTC_LAST_UPDATED_BLOCK_HASH_DATA_TABLE_NAME = process.env.CHAINSFER_BTC_LAST_UPDATED_BLOCK_HASH_DATA_TABLE_NAME

if (!process.env.INTERVAL_FOR_UPDATING_BTC_BLOCK_HASH_DATA) throw new Error('INTERVAL_FOR_UPDATING_BTC_BLOCK_HASH_DATA missing')
const INTERVAL_FOR_UPDATING_BTC_BLOCK_HASH_DATA = process.env.INTERVAL_FOR_UPDATING_BTC_BLOCK_HASH_DATA

if (!process.env.INIT_BLOCK_HEIGHT) throw new Error('INIT_BLOCK_HEIGHT missing')
const INIT_BLOCK_HEIGHT = Number(process.env.INIT_BLOCK_HEIGHT)

if (!process.env.ENV_VALUE) throw new Error('ENV_VALUE missing')
const deploymentStage = process.env.ENV_VALUE.toLowerCase()

const BtcApiURL = Config.BtcAPIConfig[deploymentStage] || Config.BtcAPIConfig['default']
const BtcNetworkName = Config.BtcNetworkConfig[deploymentStage] || Config.BtcNetworkConfig['default']
const BtcNetworkConfig = BtcNetworkName === 'mainnet' ? bitcoin.networks.bitcoin : bitcoin.networks.testnet
const BaseBtcPath = BtcNetworkName === 'mainnet' ? "m/49'/0'" : "m/49'/1'"
const LedgerApiUrl = Config.LedgerApiUrlConfig[deploymentStage] || Config.LedgerApiUrlConfig['default']

exports.handler = async (event: any, context: Context, callback: Callback) => {
  let latestBlockHashData = await Config.getBtcLatestBlockHashData(BtcApiURL)
  let lastUpdatedBlockHashData = await btcOps.getLastUpdatedBlockHashData(BtcNetworkName, CHAINSFER_BTC_LAST_UPDATED_BLOCK_HASH_DATA_TABLE_NAME)

  if (lastUpdatedBlockHashData === undefined) {
    console.log("INIT_BLOCK_HEIGHT", INIT_BLOCK_HEIGHT)
    await btcOps.insertLastUpdatedBlockHashData(BtcNetworkName, "-1", -1 , INIT_BLOCK_HEIGHT, CHAINSFER_BTC_LAST_UPDATED_BLOCK_HASH_DATA_TABLE_NAME)
    lastUpdatedBlockHashData = {
      "maxBufferedHeight": INIT_BLOCK_HEIGHT
    }
  }
  
  console.log("lastUpdatedBlockHashData", lastUpdatedBlockHashData)
  console.log("latestBlockHashData", latestBlockHashData)
  const startHeight  = lastUpdatedBlockHashData["maxBufferedHeight"] + 1
  let height = startHeight
  while (height <  latestBlockHashData['height'] &&  (height - startHeight + 1) <= INTERVAL_FOR_UPDATING_BTC_BLOCK_HASH_DATA) {
    let blockHashData = await Config.getBtcBlockHashData(height, 0, 500, BtcApiURL)
    const prevBlock = blockHashData['prev_hash'] || blockHashData['previous_hash'] || blockHashData['previous_block'] || blockHashData['prev_block']
    await btcOps.putItemInBtcBlockHashData(height, blockHashData['hash'], blockHashData['txids'], prevBlock, blockHashData['next_txids'], BTC_BLOCK_HASH_DATA_TABLE_NAME)
    await btcOps.updateLastUpdatedBlockHashDataByMaxBufferedHeight(BtcNetworkName, height, CHAINSFER_BTC_LAST_UPDATED_BLOCK_HASH_DATA_TABLE_NAME)
    height++
    // avoid to exceed api call limit 
    Utils.sleep(1000)
  }

  callback(null, 'message')
}
