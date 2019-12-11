// @flow
import * as bip32 from 'bip32'
var AWS = require('aws-sdk')
AWS.config.update({ region: 'us-east-1' })
var documentClient = new AWS.DynamoDB.DocumentClient({ region: 'us-east-1' })
var request = require('request-promise')
var axios = require('axios')
var bitcoin = require('bitcoinjs-lib')

const GAP = 20

async function getBtcTxDataFromLedger (txHash: string, ledgerApiUrl: string) {
  try {
    const options = {
      method: 'GET',
      uri: ledgerApiUrl + '/transactions/' + txHash
    }
    let response = await request(options).promise()
    return JSON.parse(response)[0]
  } catch (err) {
    throw new Error('Unable to get Btc Tx Data from Ledger. Error: ' + err.message)
  }
}

async function getLastUpdatedBlockHashData (network: string, chainsferBtcLastUpdatedBlockHashDataTableName: string) {
  const params = {
    TableName: chainsferBtcLastUpdatedBlockHashDataTableName,
    Key: {
      'network': network
    }
  }
  try {
    let data = await documentClient.get(params).promise()
    return data.Item
  } catch (err) {
    throw new Error('Unable to get lastUpdatedBlockHash Data From ChainsferBtcLastUpdatedBlockHashData. Error: ' + err.message)
  }
}

async function insertLastUpdatedBlockHashData (network: string, lastUpdatedBlockHash: string, lastUpdatedBlockHeight: number, maxBufferedHeight: number, chainsferBtcLastUpdatedBlockHashDataTableName: string) {
  const params = {
    TableName: chainsferBtcLastUpdatedBlockHashDataTableName,
    Item: {
      'network': network,
      'lastUpdatedBlockHash': lastUpdatedBlockHash,
      'lastUpdatedBlockHeight': lastUpdatedBlockHeight,
      'maxBufferedHeight': maxBufferedHeight
    },
    ReturnValues: 'NONE'
  }
  try {
    await documentClient.put(params).promise()
    console.log('LastUpdatedBlockHash Data is inserted successfully', params)
  } catch (err) {
    throw new Error('Unable to insert LastUpdatedBlockHash Data. Error: ' + err.message)
  }
}

async function updateLastUpdatedBlockHashDataByLastUpdatedBlock (network: string, lastUpdatedBlockHash: string, lastUpdatedBlockHeight: number, chainsferBtcLastUpdatedBlockHashDataTableName: string) {
  const params = {
    TableName: chainsferBtcLastUpdatedBlockHashDataTableName,
    Key: {
      'network': network
    },
    UpdateExpression: 'SET #lubh = :lubh, #lubht = :lubht',
    ExpressionAttributeNames: {
      '#lubh': 'lastUpdatedBlockHash',
      '#lubht': 'lastUpdatedBlockHeight'
    },
    ExpressionAttributeValues: {
      ':lubh': lastUpdatedBlockHash,
      ':lubht': lastUpdatedBlockHeight
    },
    ReturnValues: 'ALL_NEW'
  }

  try {
    await documentClient.update(params).promise()
  } catch (err) {
    throw new Error('Unable to update LastUpdatedBlockHashData By LastUpdatedBlock. Error: ' + err.message)
  }
}

async function updateLastUpdatedBlockHashDataByMaxBufferedHeight (network: string, maxBufferedHeight: number, chainsferBtcLastUpdatedBlockHashDataTableName: string) {
  const params = {
    TableName: chainsferBtcLastUpdatedBlockHashDataTableName,
    Key: {
      'network': network
    },
    UpdateExpression: 'SET #mbh = :mbh',
    ExpressionAttributeNames: {
      '#mbh': 'maxBufferedHeight'
    },
    ExpressionAttributeValues: {
      ':mbh': maxBufferedHeight
    },
    ReturnValues: 'ALL_NEW'
  }

  try {
    await documentClient.update(params).promise()
  } catch (err) {
    throw new Error('Unable to update LastUpdatedBlockHashData By MaxBufferedHeight. Error: ' + err.message)
  }
}

async function insertUtxoAndUpdateBalanceFromChainsferBtcXPubIndex (xpub: string, lastUpdatedBlockHash: string, txHash: string, outputIndex: number, value: number, address: string, path: string, chainsferBtcXPubIndexDataTableName: string) {
  const utxo = {
    'txHash': txHash,
    'outputIndex': outputIndex,
    'value': value,
    'address': address,
    'path': path
  }

  const params = {
    TableName: chainsferBtcXPubIndexDataTableName,
    Key: {
      'xpub': xpub
    },
    UpdateExpression: 'SET #utxos.#key = :utxo, #lubh = :lubh, #bal = #bal + :inc',
    ExpressionAttributeNames: {
      '#utxos': 'utxos',
      '#key': `${txHash}_${outputIndex}`,
      '#bal': 'balance',
      '#lubh': 'lastUpdatedBlockHash'
    },
    ExpressionAttributeValues: {
      ':utxo': utxo,
      ':inc': value,
      ':lubh': lastUpdatedBlockHash
    },
    ReturnValues: 'ALL_NEW'
  }

  try {
    await documentClient.update(params).promise()
  } catch (err) {
    throw new Error('Unable to insert Utxo and update balance From ChainsferBtcXPubIndex. Error: ' + err.message)
  }
}

async function removeUtxoAndUpdateBalanceFromChainsferBtcXPubIndex (xpub: string, lastUpdatedBlockHash: string, outputHash: string, outputIndex: number, value: number, chainsferBtcXPubIndexDataTableName:string) {
  const params = {
    TableName: chainsferBtcXPubIndexDataTableName,
    Key: {
      'xpub': xpub
    },
    UpdateExpression: 'SET #bal = #bal - :dec REMOVE #utxos.#key',
    ExpressionAttributeNames: {
      '#key': `${outputHash}_${outputIndex}`,
      '#utxos': 'utxos',
      '#bal': 'balance'
    },
    ExpressionAttributeValues: {
      ':dec': value
    },
    ReturnValues: 'ALL_NEW'
  }

  try {
    await documentClient.update(params).promise()
    console.log('Remove Utxo and update balance in ChainsferBtcXPubIndex successfully')
  } catch (err) {
    throw new Error('Unable to remove Utxo and update balance in ChainsferBtcXPubIndex. Error: ' + err.message)
  }
}

async function updateChainsferBtcXPubIndexByMaxIndex (xpub: string, maxIndex: { [string]: number }, chainsferBtcXPubIndexDataTableName:string) {
  const params = {
    TableName: chainsferBtcXPubIndexDataTableName,
    Key: {
      'xpub': xpub
    },
    UpdateExpression: 'SET #maxIndex = :maxIndex',
    ExpressionAttributeNames: {
      '#maxIndex': 'maxIndex'
    },
    ExpressionAttributeValues: {
      ':maxIndex': maxIndex
    },
    ReturnValues: 'ALL_NEW'
  }

  try {
    await documentClient.update(params).promise()
    console.log('Updated ChainsferBtcXPubIndex By MaxIndex successfully')
  } catch (err) {
    throw new Error('Unable to updated ChainsferBtcXPubIndex By MaxIndex. Error: ' + err.message)
  }
}

async function getItemFromChainsferBtcTrackedAddress (address: string, chainsferBtcTrackedAddressDataTableName: string) {
  const params = {
    TableName: chainsferBtcTrackedAddressDataTableName,
    Key: {
      'address': address
    }
  }
  try {
    let data = await documentClient.get(params).promise()
    return data.Item
  } catch (err) {
    throw new Error('Unable to get Item From ChainsferBtcTrackedAddress. Error: ' + err.message)
  }
}

async function getItemFromBtcBlockHashData (height: number, btcBlockHashDataTableName: string) {
  const params = {
    TableName: btcBlockHashDataTableName,
    Key: {
      'height': height
    }
  }
  try {
    let data = await documentClient.get(params).promise()
    return data.Item
  } catch (err) {
    throw new Error('Unable to get Item From BtcBlockHashData. Error: ' + err.message)
  }
}

async function putItemInChainsferBtcTrackedAddress (address: string, xpub: string, path: string, accountIndex: number, chainsferBtcTrackedAddressDataTableName: string) {
  const params = {
    TableName: chainsferBtcTrackedAddressDataTableName,
    Item: {
      'address': address,
      'xpub': xpub,
      'path': path,
      'accountIndex': accountIndex
    },
    ReturnValues: 'NONE'
  }
  try {
    await documentClient.put(params).promise()
    console.log('ChainsferBtcTrackedAddress Data is inserted successfully')
  } catch (err) {
    throw new Error('Unable to insert ChainsferBtcTrackedAddress Data. Error: ' + err.message)
  }
}

async function putItemInBtcBlockHashData (height: number, hash: string, txids: Array<string>, prevBlock: string, nextTxidsUrl: string, btcBlockHashDataTableName: string) {
  const params = {
    TableName: btcBlockHashDataTableName,
    Item: {
      'height': height,
      'hash': hash,
      'txids': txids,
      'prev_block': prevBlock,
      'next_txids': nextTxidsUrl
    },
    ReturnValues: 'NONE'
  }
  try {
    await documentClient.put(params).promise()
    console.log('BtcBlockHashData is inserted successfully for height: ', height)
  } catch (err) {
    throw new Error('Unable to insert BtcBlockHashData. Error: ' + err.message)
  }
}

async function initItemInChainsferBtcXPubIndex (xpub: string, accountIndex: number, chainsferBtcXPubIndexDataTableName: string, baseBtcPath: string, btcNetworkConfig: any, ledgerApiUrl: string, chainsferBtcTrackedAddressDataTableName: string) {
  let maxExternalAddressIndex = await discoverAddress(xpub, accountIndex, 0, 0, baseBtcPath, btcNetworkConfig, ledgerApiUrl, chainsferBtcTrackedAddressDataTableName)
  let maxChangeAddressIndex = await discoverAddress(xpub, accountIndex, 1, 0, baseBtcPath, btcNetworkConfig, ledgerApiUrl, chainsferBtcTrackedAddressDataTableName)
  let maxIndex = {
    'm/49/0/0/0': 0, // max address index for external chain, mainnet, Segwit
    'm/49/0/0/1': 0, // max address index for change chain, mainnet, Segwit
    'm/49/1/0/0': 0, // max address index for external chain, testnet, Segwit
    'm/49/1/0/1': 0, // max address index for change chain, testnet, Segwit

    'm/44/0/0/0': 0, // max address index for external chain, mainnet, Legacy
    'm/44/0/0/1': 0, // max address index for change chain, mainnet, Legacy
    'm/44/1/0/0': 0, // max address index for external chain, testnet, Legacy
    'm/44/1/0/1': 0 // max address index for change chain, testnet, Legacy
  }

  if (btcNetworkConfig === bitcoin.networks.bitcoin) {
    if (xpub.startsWith('L_')) {
      maxIndex['m/49/0/0/0'] = maxExternalAddressIndex
      maxIndex['m/49/0/0/1'] = maxChangeAddressIndex
    } else if (xpub.startsWith('S_')) {
      maxIndex['m/44/0/0/0'] = maxExternalAddressIndex
      maxIndex['m/44/0/0/1'] = maxChangeAddressIndex
    }
  } else if (btcNetworkConfig === bitcoin.networks.testnet) {
    if (xpub.startsWith('L_')) {
      maxIndex['m/49/1/0/0'] = maxExternalAddressIndex
      maxIndex['m/49/1/0/1'] = maxChangeAddressIndex
    } else if (xpub.startsWith('S_')) {
      maxIndex['m/44/1/0/0'] = maxExternalAddressIndex
      maxIndex['m/44/1/0/1'] = maxChangeAddressIndex
    }
  }

  const params = {
    TableName: chainsferBtcXPubIndexDataTableName,
    Item: {
      'xpub': xpub,
      'accountIndex': accountIndex,
      'lastUpdatedBlockHash': '-1',
      'balance': 0,
      'utxos': {},
      'maxIndex': maxIndex
    },
    ReturnValues: 'NONE'
  }
  try {
    await documentClient.put(params).promise()
    console.log('Chainsfer Btc XPub Index Data Item is initialized successfully for xpub', xpub)
    return params.Item
  } catch (err) {
    throw new Error('Unable to init chainsferBtcXPubIndexDataTableName Item. Error: ' + err.message)
  }
}

async function getItemFromChainsferBtcXPubIndex (xpub: string, accountIndex: number, chainsferBtcXPubIndexDataTableName: string, baseBtcPath: string, btcNetworkConfig: any, ledgerApiUrl: string, chainsferBtcTrackedAddressDataTableName: string) {
  const params = {
    TableName: chainsferBtcXPubIndexDataTableName,
    Key: {
      'xpub': xpub
    }
  }
  try {
    let data = await documentClient.get(params).promise()
    console.log('getItemFromChainsferBtcXPubIndex data', data)
    if (data.Item === undefined) {
      data = await initItemInChainsferBtcXPubIndex(xpub, accountIndex, chainsferBtcXPubIndexDataTableName, baseBtcPath, btcNetworkConfig, ledgerApiUrl, chainsferBtcTrackedAddressDataTableName)
      return data
    }
    return data.Item
  } catch (err) {
    throw new Error('Unable to get Item From ChainsferBtcXPubIndex. Error: ' + err.message)
  }
}

async function getUtxosFromChainsferBtcXPubIndex (xpub: string, accountIndex: number, chainsferBtcXPubIndexDataTableName: string, limit: number, baseBtcPath: string, btcNetworkConfig: any, ledgerApiUrl: string, chainsferBtcTrackedAddressDataTableName: string) {
  let result = {}
  let data = await getItemFromChainsferBtcXPubIndex(xpub, accountIndex, chainsferBtcXPubIndexDataTableName, baseBtcPath, btcNetworkConfig, ledgerApiUrl, chainsferBtcTrackedAddressDataTableName)
  if (data === undefined) {
    return result
  }
  const utxos = data['utxos']

  let counter = 0
  console.log('utxos', utxos)
  for (const key in utxos) {
    counter = counter + 1
    if (counter <= limit) {
      result[key] = utxos[key]
    }
  }

  return result
}

async function getDerivedAddress (xpub: string, change: number, addressIdx: number, btcNetworkConfig: any) {
  const root = bip32.fromBase58(xpub.substring(2), btcNetworkConfig)
  const child = root.derive(change).derive(addressIdx)
  const p2wpkh = bitcoin.payments.p2wpkh({
    pubkey: child.publicKey,
    network: btcNetworkConfig
  })

  const { address } = bitcoin.payments.p2sh({
    redeem: p2wpkh,
    network: btcNetworkConfig
  })

  console.log('Derived Address', address, xpub, change, addressIdx)
  return address
}

async function discoverAddress (
  xpub: string,
  accountIndex: number,
  change: number,
  offset: number,
  baseBtcPath: string,
  btcNetworkConfig: any,
  ledgerApiUrl: string,
  chainsferBtcTrackedAddressDataTableName: string) {
  let gap = 0
  let currentIndex = offset
  let maxAddressIndex = currentIndex
  while (gap < GAP) {
    console.log(currentIndex)
    maxAddressIndex = currentIndex
    const addressPath = `${baseBtcPath}/${accountIndex}'/${change}/${currentIndex}`
    const address = await getDerivedAddress(xpub, change, currentIndex, btcNetworkConfig)
    const response = (await axios.get(
      `${ledgerApiUrl}/addresses/${address}/transactions?noToken=true&truncated=true`
    )).data

    if (response.txs.length === 0) {
      gap++
    } else {
      gap = 0
    }
    currentIndex++
    await putItemInChainsferBtcTrackedAddress(address, xpub, addressPath, accountIndex, chainsferBtcTrackedAddressDataTableName)
  }
  return maxAddressIndex
}

module.exports = {
  getUtxosFromChainsferBtcXPubIndex: getUtxosFromChainsferBtcXPubIndex,
  getLastUpdatedBlockHashData: getLastUpdatedBlockHashData,
  getBtcTxDataFromLedger: getBtcTxDataFromLedger,
  insertLastUpdatedBlockHashData: insertLastUpdatedBlockHashData,
  getItemFromChainsferBtcTrackedAddress: getItemFromChainsferBtcTrackedAddress,
  insertUtxoAndUpdateBalanceFromChainsferBtcXPubIndex: insertUtxoAndUpdateBalanceFromChainsferBtcXPubIndex,
  removeUtxoAndUpdateBalanceFromChainsferBtcXPubIndex: removeUtxoAndUpdateBalanceFromChainsferBtcXPubIndex,
  getItemFromChainsferBtcXPubIndex: getItemFromChainsferBtcXPubIndex,
  getItemFromBtcBlockHashData: getItemFromBtcBlockHashData,
  putItemInBtcBlockHashData: putItemInBtcBlockHashData,
  updateLastUpdatedBlockHashDataByMaxBufferedHeight: updateLastUpdatedBlockHashDataByMaxBufferedHeight,
  updateLastUpdatedBlockHashDataByLastUpdatedBlock: updateLastUpdatedBlockHashDataByLastUpdatedBlock,
  updateChainsferBtcXPubIndexByMaxIndex: updateChainsferBtcXPubIndexByMaxIndex,
  discoverAddress: discoverAddress
}
