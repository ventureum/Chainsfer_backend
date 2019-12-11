// @flow
import type { Context, Callback } from 'flow-aws-lambda'
var AWS = require('aws-sdk')
AWS.config.update({ region: 'us-east-1' })
var Config = require('./config.js')
var bitcoin = require('bitcoinjs-lib')
var btcOps = require('./btcOps.js')

if (!process.env.CHAINSFER_BTC_TRACKED_ADDRESS_DATA_TABLE_NAME) throw new Error('CHAINSFER_BTC_TRACKED_ADDRESS_DATA_TABLE_NAME missing')
const CHAINSFER_BTC_TRACKED_ADDRESS_DATA_TABLE_NAME = process.env.CHAINSFER_BTC_TRACKED_ADDRESS_DATA_TABLE_NAME

if (!process.env.CHAINSFER_BTC_XPUB_INDEX_DATA_TABLE_NAME) throw new Error('CHAINSFER_BTC_XPUB_INDEX_DATA_TABLE_NAME missing')
const CHAINSFER_BTC_XPUB_INDEX_DATA_TABLE_NAME = process.env.CHAINSFER_BTC_XPUB_INDEX_DATA_TABLE_NAME

if (!process.env.CHAINSFER_BTC_LAST_UPDATED_BLOCK_HASH_DATA_TABLE_NAME) throw new Error('CHAINSFER_BTC_LAST_UPDATED_BLOCK_HASH_DATA_TABLE_NAME missing')
const CHAINSFER_BTC_LAST_UPDATED_BLOCK_HASH_DATA_TABLE_NAME = process.env.CHAINSFER_BTC_LAST_UPDATED_BLOCK_HASH_DATA_TABLE_NAME

if (!process.env.BTC_BLOCK_HASH_DATA_TABLE_NAME) throw new Error('BTC_BLOCK_HASH_DATA_TABLE_NAME missing')
const BTC_BLOCK_HASH_DATA_TABLE_NAME = process.env.BTC_BLOCK_HASH_DATA_TABLE_NAME

if (!process.env.INIT_BLOCK_HEIGHT) throw new Error('INIT_BLOCK_HEIGHT missing')
const INIT_BLOCK_HEIGHT = Number(process.env.INIT_BLOCK_HEIGHT)

if (!process.env.INTERVAL_FOR_UPDATING_BTC_XPUB_INDEX) throw new Error('INTERVAL_FOR_UPDATING_BTC_XPUB_INDEX missing')
const INTERVAL_FOR_UPDATING_BTC_XPUB_INDEX = Number(process.env.INTERVAL_FOR_UPDATING_BTC_XPUB_INDEX)

if (!process.env.ENV_VALUE) throw new Error('ENV_VALUE missing')
const deploymentStage = process.env.ENV_VALUE.toLowerCase()

const BtcNetworkName = Config.BtcNetworkConfig[deploymentStage] || Config.BtcNetworkConfig['default']
const BtcNetworkConfig = BtcNetworkName === 'mainnet' ? bitcoin.networks.bitcoin : bitcoin.networks.testnet
const BaseBtcPath = BtcNetworkName === 'mainnet' ? "m/49'/0'" : "m/49'/1'"
const LedgerApiUrl = Config.LedgerApiUrlConfig[deploymentStage] || Config.LedgerApiUrlConfig['default']

async function updatedMaxAddressIndex (xpub: string, accountIndex: number, isChangeAddress: number, maxAddressIndex: number) {
  let chainsferBtcXPubIndexItem = await btcOps.getItemFromChainsferBtcXPubIndex(xpub, accountIndex, CHAINSFER_BTC_XPUB_INDEX_DATA_TABLE_NAME, BaseBtcPath, BtcNetworkConfig, LedgerApiUrl, CHAINSFER_BTC_TRACKED_ADDRESS_DATA_TABLE_NAME)
  let maxIndex = chainsferBtcXPubIndexItem['maxIndex']
  if (BtcNetworkConfig === bitcoin.networks.bitcoin) {
    if (xpub.startsWith('L_')) {
      if (isChangeAddress === 0) {
        maxIndex['m/49/0/0/0'] = Math.max(maxIndex['m/49/0/0/0'], maxAddressIndex)
      } else {
        maxIndex['m/49/0/0/1'] = Math.max(maxIndex['m/49/0/0/1'], maxAddressIndex)
      }
    } else if (xpub.startsWith('S_')) {
      if (isChangeAddress === 0) {
        maxIndex['m/44/0/0/0'] = Math.max(maxIndex['m/44/0/0/0'], maxAddressIndex)
      } else {
        maxIndex['m/44/0/0/1'] = Math.max(maxIndex['m/44/0/0/1'], maxAddressIndex)
      }
    }
  } else if (BtcNetworkConfig === bitcoin.networks.testnet) {
    if (xpub.startsWith('L_')) {
      if (isChangeAddress === 0) {
        maxIndex['m/49/1/0/0'] = Math.max(maxIndex['m/49/1/0/0'], maxAddressIndex)
      } else {
        maxIndex['m/49/1/0/1'] = Math.max(maxIndex['m/49/1/0/1'], maxAddressIndex)
      }
    } else if (xpub.startsWith('S_')) {
      if (isChangeAddress === 0) {
        maxIndex['m/44/1/0/0'] = Math.max(maxIndex['m/44/1/0/0'], maxAddressIndex)
      } else {
        maxIndex['m/44/1/0/1'] = Math.max(maxIndex['m/44/1/0/1'], maxAddressIndex)
      }
    }
  }

  await btcOps.updateChainsferBtcXPubIndexByMaxIndex(xpub, maxIndex, CHAINSFER_BTC_XPUB_INDEX_DATA_TABLE_NAME)
}

async function processOutputsOfTxData (txHash: string, outputs: Array<{[key: string]: any}>, blockHash: string, chainsferBtcTrackedAddressDataTableName: string, chainsferBtcXPubIndexDataTableName: string) {
  for (let i = 0; i < outputs.length; i++) {
    const item = outputs[i]
    const address = item['address']
    if (address !== undefined && address !== null) {
      let chainsferBtcTrackedAddressItem = await btcOps.getItemFromChainsferBtcTrackedAddress(address, chainsferBtcTrackedAddressDataTableName)
      if (chainsferBtcTrackedAddressItem !== undefined && chainsferBtcTrackedAddressItem !== null) {
        console.log('address exists in ChainsferBtcTrackedAddress for output', address)
        const xpub = chainsferBtcTrackedAddressItem['xpub']
        const path = chainsferBtcTrackedAddressItem['path']
        const accountIndex = chainsferBtcTrackedAddressItem['accountIndex']
        const addressIdx = Number(path.split('/')[5])
        const isChangeAddress = Number(path.split('/')[4])
        await btcOps.insertUtxoAndUpdateBalanceFromChainsferBtcXPubIndex(xpub, blockHash, txHash, item['output_index'], item['value'], item['address'], path, chainsferBtcXPubIndexDataTableName)
        let maxAddressIndex = await btcOps.discoverAddress(xpub, accountIndex, isChangeAddress, addressIdx, BaseBtcPath, BtcNetworkConfig, LedgerApiUrl, CHAINSFER_BTC_TRACKED_ADDRESS_DATA_TABLE_NAME)
        await updatedMaxAddressIndex(xpub, accountIndex, isChangeAddress, maxAddressIndex)
      }
    }
  }
}

async function processInputsOfTxData (inputs: Array<{[key: string]: any}>, blockHash: string, chainsferBtcTrackedAddressDataTableName: string, chainsferBtcXPubIndexDataTableName: string) {
  for (let i = 0; i < inputs.length; i++) {
    const item = inputs[i]
    const address = item['address']
    const scriptSignature = item['script_signature']
    if (address !== undefined && scriptSignature !== undefined && scriptSignature !== '') {
      let chainsferBtcTrackedAddressItem = await btcOps.getItemFromChainsferBtcTrackedAddress(address, chainsferBtcTrackedAddressDataTableName)
      if (chainsferBtcTrackedAddressItem !== undefined && chainsferBtcTrackedAddressItem !== null) {
        console.log('address exists in ChainsferBtcTrackedAddress for input', address)
        const xpub = chainsferBtcTrackedAddressItem['xpub']
        await btcOps.removeUtxoAndUpdateBalanceFromChainsferBtcXPubIndex(xpub, blockHash, item['output_hash'], item['output_index'], item['value'], chainsferBtcXPubIndexDataTableName)
      }
    }
  }
}

exports.handler = async (event: any, context: Context, callback: Callback) => {
  let lastUpdatedBlockHashData = await btcOps.getLastUpdatedBlockHashData(BtcNetworkName, CHAINSFER_BTC_LAST_UPDATED_BLOCK_HASH_DATA_TABLE_NAME)

  console.log('INIT_BLOCK_HEIGHT', INIT_BLOCK_HEIGHT)
  if (lastUpdatedBlockHashData['lastUpdatedBlockHeight'] === -1) {
    lastUpdatedBlockHashData = {
      'lastUpdatedBlockHeight': INIT_BLOCK_HEIGHT
    }
  }

  const startHeight = lastUpdatedBlockHashData['lastUpdatedBlockHeight'] + 1
  let height = startHeight
  while ((height - startHeight) <= INTERVAL_FOR_UPDATING_BTC_XPUB_INDEX) {
    console.log('processing height: ', height)
    let blockHashData = await btcOps.getItemFromBtcBlockHashData(height, BTC_BLOCK_HASH_DATA_TABLE_NAME)
    console.log('blockHashData: ', blockHashData)
    if (blockHashData === undefined || height > blockHashData['height']) {
      break
    }
    let txids = blockHashData['txids']
    while (txids.length > 0) {
      for (let index = 0; index < txids.length; index++) {
        const txHash = txids[index]
        let txData = await btcOps.getBtcTxDataFromLedger(txHash, LedgerApiUrl)
        await processOutputsOfTxData(txHash, txData['outputs'], blockHashData['hash'], CHAINSFER_BTC_TRACKED_ADDRESS_DATA_TABLE_NAME, CHAINSFER_BTC_XPUB_INDEX_DATA_TABLE_NAME)
        await processInputsOfTxData(txData['inputs'], blockHashData['hash'], CHAINSFER_BTC_TRACKED_ADDRESS_DATA_TABLE_NAME, CHAINSFER_BTC_XPUB_INDEX_DATA_TABLE_NAME)
      }
      if (blockHashData['next_txids'] !== undefined) {
        blockHashData = await Config.getBtcBlockHashDataByNextTxIds(blockHashData['next_txids'])
        txids = blockHashData['txids']
      } else {
        txids = []
      }
    }
    await btcOps.updateLastUpdatedBlockHashDataByLastUpdatedBlock(BtcNetworkName, blockHashData['hash'], blockHashData['height'], CHAINSFER_BTC_LAST_UPDATED_BLOCK_HASH_DATA_TABLE_NAME)
    height++
  }
  callback(null, 'message')
}
