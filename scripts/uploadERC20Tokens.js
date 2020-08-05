// @flow
import AWS from 'aws-sdk'
import fs from 'fs'
import type { EthContractType } from '../lambda/src/ethContracts.flow'
import CoinGecko from 'coingecko-api'

const CoinGeckoClient = new CoinGecko()
const documentClient = new AWS.DynamoDB.DocumentClient({ region: 'us-east-1' })

const testnetContractAddresses = {
  '0': '0xD8ddF454AED9454087f8f678BfFCEcd34abc2A92',
  '2': '0x7f74d45e51a63E6cB71A51dc5c3C7564217e5737',
  '3': '0xc9a47A3A177795B03417D263B692dA546081F800',
  '4': '0x89e0Af4348491b71571D4B209FeEA585691f3D81',
  '6': '0x91449BF3EB78b3DE43eD16bc81cf00154E4df565',
  '7': '0x88d0E586507AC0bC31C9fcAF998d269a548d7539',
  '8': '0x7B36c055d4c05eF4A07b37e7C65ECaC1Af89D807',
  '9': '0x8893EAF132420c4d8B31f76c3d7303d14fb4affa',
  '10': '0x662197328a1A5202E0a528E13E8b80d7eBd52300',
  '12': '0x4998560DCe75d41087B9763A0bB5BAf474ca3322',
  '18': '0x4aacB7f0bA0A5CfF9A8a5e8C0F24626Ee9FDA4a6'
}

async function uploadERC20Contracts (env: string) {
  if (!env) throw new Error('taget env missing')
  const file = fs.readFileSync(__dirname + '/ERC20Tokens.json')
  let erc20Contracts = JSON.parse(file.toString())
  const coinList = (await CoinGeckoClient.coins.list()).data
  let symbolIdMap = {}
  coinList.forEach((coin: { symbol: string, id: string }) => {
    symbolIdMap[coin.symbol.toLocaleLowerCase()] = coin.id
  })
  let putRequests = erc20Contracts.map((contract: EthContractType): {
    PutRequest: { Item: EthContractType }
  } => {
    let item = {
      ...contract,
      erc20: true,
      cryptoType: symbolIdMap[contract.symbol.toLocaleLowerCase()]
    }
    if (env.toLocaleLowerCase() !== 'prod') {
      item.address = testnetContractAddresses[contract.decimals.toString()]
    }
    return {
      PutRequest: {
        Item: item
      }
    }
  })
  // Remove coins that does not have cryptoTypes
  putRequests = putRequests.filter(
    (item: { PutRequest: { Item: EthContractType } }): boolean =>
      item.PutRequest.Item.cryptoType !== undefined
  )
  let chunks = []

  const chunkSize = 25 // max of Dynamodb batchWrite request size
  // split write requests into chunks of 25 put requests
  for (let i = 0; i < putRequests.length; i += chunkSize) {
    chunks.push(putRequests.slice(i, i + chunkSize))
  }

  await Promise.all(
    chunks.map(
      async (
        chunk: Array<{
          PutRequest: { Item: EthContractType }
        }>
      ) => {
        const params = {
          RequestItems: {
            [`EthContracts${env}`]: chunk
          }
        }
        await documentClient.batchWrite(params).promise()
      }
    )
  )
  console.log(`Uploaded ${putRequests.length} items`)
}

uploadERC20Contracts('Vincent')
