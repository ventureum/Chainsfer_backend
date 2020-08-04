// @flow
import AWS from 'aws-sdk'
import fs from 'fs'
import type { EthContractType } from '../lambda/src/ethContracts.flow'
import CoinGecko from 'coingecko-api'

const CoinGeckoClient = new CoinGecko()
const documentClient = new AWS.DynamoDB.DocumentClient({ region: 'us-east-1' })

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
    return {
      PutRequest: {
        Item: {
          ...contract,
          erc20: true,
          cryptoType: symbolIdMap[contract.symbol.toLocaleLowerCase()]
        }
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
