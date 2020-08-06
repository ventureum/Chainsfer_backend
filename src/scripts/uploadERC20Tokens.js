// @flow
import AWS from 'aws-sdk'
import fs from 'fs'
import type { EthContractType } from '../aws/ethContracts.flow'
import CoinGecko from 'coingecko-api'
import { ERC20TokensList, testnetContractAddresses } from '../aws/ERC20Tokens'

const CoinGeckoClient = new CoinGecko()
const documentClient = new AWS.DynamoDB.DocumentClient({ region: 'us-east-1' })

async function uploadERC20Contracts (env: string) {
  if (!env) throw new Error('taget env missing')
  let putRequests = ERC20TokensList.map(
    (contract: {
      ...$Exact<EthContractType>,
      testnetAddress: string
    }): {
      PutRequest: { Item: EthContractType }
    } => {
      if (env.toLocaleLowerCase() !== 'prod') {
        contract.address = testnetContractAddresses[contract.decimals.toString()]
      }
      delete contract.testnetAddress
      return {
        PutRequest: {
          Item: contract
        }
      }
    }
  )
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
