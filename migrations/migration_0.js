// @flow
// Target commit 23b225f48ed1b8991216fa64c2f942dae61eb22e (tag: v1.0-rc8)
// Migration script for issue "Migration script to extend erc20 accounts"
// https://app.zenhub.com/workspaces/chainsfr-5a615f92049fe239befac4ea/issues/ventureum/chainsfr_backend/329
// Undo comment in main() and define userTableName to start
import type {
  CryptoAccountType,
  UserType,
  CryptoAccounResponsetType
} from '../lambda/src/user.flow'
import moment from 'moment'
import AWS from 'aws-sdk'
AWS.config.update({ region: 'us-east-1' })
let documentClient = new AWS.DynamoDB.DocumentClient()

const walletERC20Supports = {
  drive: ['dai', 'tether', 'usd-coin', 'true-usd'],
  metamask: ['dai', 'tether', 'usd-coin', 'true-usd'],
  ledger: ['dai', 'tether', 'usd-coin', 'true-usd'],
  coinbaseWalletLink: ['dai', 'tether', 'usd-coin', 'true-usd'],
  metamaskWalletConnect: ['dai', 'tether', 'usd-coin', 'true-usd'],
  trustWalletConnect: ['dai', 'tether', 'usd-coin', 'true-usd'],
  coinomiWalletConnect: ['dai', 'tether', 'usd-coin', 'true-usd']
}

async function _updateCryptoAccounts (
  userTableName: string,
  googleId: string,
  cryptoAccounts: Array<CryptoAccountType>
): Promise<CryptoAccounResponsetType> {
  const params = {
    TableName: userTableName,
    Key: {
      googleId: googleId
    },
    UpdateExpression: 'set cryptoAccounts = :c',
    ExpressionAttributeValues: {
      ':c': cryptoAccounts
    },
    ReturnValues: 'UPDATED_NEW'
  }
  let response = await documentClient.update(params).promise()
  return {
    cryptoAccounts: response.Attributes.cryptoAccounts
  }
}

function newERC20Account (
  walletType: string,
  cryptoType: string,
  address: string,
  name: string
): CryptoAccountType {
  const platformType = 'ethereum'
  const id = JSON.stringify({
    cryptoType: cryptoType.toLowerCase(),
    walletType: walletType.toLowerCase(),
    address: address.toLowerCase()
  })

  const verified = true
  const receivable = true
  const sendable = true
  const currentTimestamp = moment().unix()

  const addedAt = currentTimestamp
  const updatedAt = currentTimestamp

  return {
    id,
    name,
    platformType,
    walletType,
    cryptoType,
    address,
    verified,
    receivable,
    sendable,
    addedAt,
    updatedAt
  }
}

function isERC20CryptoSupportedAccount (cryptoAccount: CryptoAccountType): boolean {
  if (cryptoAccount.platformType === 'ethereum') {
    return true
  }
  // Some older accounts do not have the platformType attribute
  else if (cryptoAccount.address && cryptoAccount.cryptoType !== 'bitcoin') {
    return true
  }
  return false
}

async function migrateUserAccounts (userTableName: string) {
  // Get all users
  let params = {
    TableName: userTableName
  }
  let users = []
  while (true) {
    const rv = await documentClient.scan(params).promise()
    users = users.concat(rv.Items)
    if (!rv.LastEvaluatedKey) {
      break
    } else {
      params = {
        ...params,
        ExclusiveStartKey: rv.LastEvaluatedKey
      }
    }
  }

  if (users.length === 0) {
    console.log('No user to be migrated')
    return
  }
  // Go through every user in the database
  await Promise.all(
    users.map(async (user: UserType): Promise<?CryptoAccounResponsetType> => {
      const { cryptoAccounts } = user
      if (!cryptoAccounts) return Promise.resolve()

      let newCryptoAccounts = [...cryptoAccounts]
      // this store what wallet and crypto the user has added under each address
      let addressWalletCryptoDict = {}

      cryptoAccounts.forEach((cryptoAccount: CryptoAccountType) => {
        // Use cryptoAccount.address to suppress Flow error
        if (cryptoAccount.address && isERC20CryptoSupportedAccount(cryptoAccount)) {
          if (!addressWalletCryptoDict[cryptoAccount.address]) {
            addressWalletCryptoDict[cryptoAccount.address] = {}
          }
          if (!addressWalletCryptoDict[cryptoAccount.address][cryptoAccount.walletType]) {
            addressWalletCryptoDict[cryptoAccount.address][cryptoAccount.walletType] = {}
          }
          addressWalletCryptoDict[cryptoAccount.address][cryptoAccount.walletType][
            cryptoAccount.cryptoType
          ] = cryptoAccount.name
        }
      })
      const walletTypes = Object.keys(walletERC20Supports)
      const addresses = Object.keys(addressWalletCryptoDict)
      // For each ethereum address that a user has,
      // check if [walletType][cryptoType] exist
      // if not, add newERC20Account
      addresses.forEach((address: string) => {
        walletTypes.forEach((walletType: string) => {
          // Only add if user has alreay added walletType
          if (addressWalletCryptoDict[address][walletType]) {
            // All accounts with the same address and walletType have the same name
            // $FlowFixMe
            const name: string = Object.values(addressWalletCryptoDict[address][walletType])[0]
            const ERC20Tokens = walletERC20Supports[walletType]
            ERC20Tokens.forEach((cryptoType: string) => {
              if (!addressWalletCryptoDict[address][walletType][cryptoType]) {
                console.log(
                  `Adding ${walletType} ${cryptoType} account
                  for user ${user.profile.name} (ID: ${user.googleId})`
                )
                newCryptoAccounts.push(newERC20Account(walletType, cryptoType, address, name))
              }
            })
          }
        })
      })
      return _updateCryptoAccounts(userTableName, user.googleId, newCryptoAccounts)
    })
  )
}

async function main () {
  // Define userTableName first
  // const userTableName = ''
  // await migrateUserAccounts(tableName)
  // console.log('Migration succeeded')
}
