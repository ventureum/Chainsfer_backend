// @flow
const AWS = require('aws-sdk')
const Web3 = require('web3')
const EthereumTx = require('ethereumjs-tx')
const dynamodb = new AWS.DynamoDB({ region: 'us-east-1' })
const ERC20_ABI = require('../lambda/src/contracts/ERC20.json')
const infuraAPIKey = '5e1a4561588d43838ed87e12dbe2d1f0'
// fill in funding account's privateKey
const fundingPrivateKey = Buffer.from('', 'hex') // remove 0x
const testTokenAddress = '0x4aacB7f0bA0A5CfF9A8a5e8C0F24626Ee9FDA4a6'
const web3 = new Web3(
  new Web3.providers.HttpProvider(`https://rinkeby.infura.io/v3/${infuraAPIKey}`)
)

type AccountType = {
  address: string,
  privateKey: string
}

// eslint-disable-next-line flowtype/no-weak-types
function accountItemBuilder (address: string, privateKey: string): Object {
  return {
    ExpressionAttributeNames: {
      '#PK': 'privateKey'
    },
    ExpressionAttributeValues: {
      ':pkv': {
        S: privateKey
      }
    },
    Key: {
      address: {
        S: address
      }
    },
    ReturnValues: 'ALL_NEW',
    TableName: 'AlphaTestEthereumAddress',
    UpdateExpression: 'SET #PK = :pkv'
  }
}

// eslint-disable-next-line flowtype/no-weak-types
function sendTxPromise (sendFunction: Function, txObj: Object): Promise<string> {
  // eslint-disable-next-line flowtype/no-weak-types
  return new Promise((resolve: Function, reject: Function) => {
    sendFunction(txObj)
      .on('transactionHash', (hash: string) => {
        resolve(hash)
      })
      .on('error', (err: string) => {
        reject(err)
      })
  })
}

async function getAllAccounts (): Promise<Array<AccountType>> {
  let scanParam = {
    TableName: 'AlphaTestEthereumAddress'
  }
  let result = []
  while (true) {
    const rv = await dynamodb.scan(scanParam).promise()
    result = [...result, ...rv.Items]
    if (!rv.LastEvaluatedKey) {
      break
    }
    scanParam = { ...scanParam, ExclusiveStartKey: rv.LastEvaluatedKey }
  }

  // eslint-disable-next-line flowtype/no-weak-types
  result = result.map((item: any): AccountType => {
    return {
      address: item.address.S,
      privateKey: item.privateKey.S
    }
  })
  return result
}

async function fundAccounts (
  accounts: Array<AccountType>,
  ethAmount: string, // in ether
  testTokenAmount?: string // in ether
) {
  const fundingAccount = web3.eth.accounts.privateKeyToAccount(
    '0x' + fundingPrivateKey.toString('hex')
  )
  let nonce = await web3.eth.getTransactionCount(fundingAccount.address)
  // send eth
  for (let i = 0; i < accounts.length; i++) {
    const address = accounts[i].address
    let value = web3.utils.toWei(ethAmount, 'ether')
    let price = await web3.eth.getGasPrice()
    let gas = (
      await web3.eth.estimateGas({
        from: fundingAccount.address,
        to: address,
        value: value
      })
    ).toString()
    const txParams = {
      nonce: web3.utils.numberToHex(nonce),
      gasPrice: web3.utils.numberToHex(price),
      gasLimit: web3.utils.numberToHex(gas),
      to: address,
      value: web3.utils.numberToHex(value),
      // EIP 155 chainId - mainnet: 1, rinkeby: 4
      chainId: 4
    }
    const tx = new EthereumTx(txParams)
    tx.sign(fundingPrivateKey)
    const serializedTx = '0x' + tx.serialize().toString('hex')
    const txHash = await sendTxPromise(web3.eth.sendSignedTransaction, serializedTx)
    console.log(
      `Sent ${web3.utils.fromWei(value, 'ether')}ETH to ${address}: ${txHash} ${i}/${
        accounts.length
      }`
    )
    nonce += 1

    if (testTokenAmount) {
      const token = new web3.eth.Contract(ERC20_ABI.abi, testTokenAddress)
      // send ERC20 test token
      const data = token.methods
        .transfer(address, web3.utils.toWei(testTokenAmount, 'ether'))
        .encodeABI()
      gas = await token.methods
        .transfer(address, web3.utils.toWei(testTokenAmount, 'ether'))
        .estimateGas({ from: fundingAccount.address })

      const erc20TxParam = {
        nonce: web3.utils.numberToHex(nonce),
        gasPrice: web3.utils.numberToHex(price),
        gasLimit: web3.utils.numberToHex(gas),
        to: testTokenAddress,
        value: web3.utils.numberToHex(0),
        data: data,
        // EIP 155 chainId - mainnet: 1, rinkeby: 4
        chainId: 4
      }
      const erc20Tx = new EthereumTx(erc20TxParam)
      erc20Tx.sign(fundingPrivateKey)
      const serializedErc20Tx = '0x' + erc20Tx.serialize().toString('hex')
      const erc20TxHash = await sendTxPromise(web3.eth.sendSignedTransaction, serializedErc20Tx)
      console.log(
        `Sent ${testTokenAmount} test tokens to ${address}: ${erc20TxHash} ${i}/${accounts.length}`
      )
      nonce += 1
    }
  }
}

function generateAccounts (n: number): Array<AccountType> {
  let newAccounts = []
  for (let i = 0; i < n; i++) {
    const account = web3.eth.accounts.create()
    newAccounts.push(account)
  }
  return newAccounts
}

async function uploadAccount (accounts: Array<AccountType>) {
  // TODO: use BatchWrite
  await Promise.all(
    accounts.map(async (account: AccountType, i: number) => {
      const accountItem = accountItemBuilder(account.address, account.privateKey)
      await dynamodb.updateItem(accountItem).promise()
    })
  )
}

async function addPrefilledAccounts (
  numberOfAccount: number,
  ethAmount: string,
  testTokenAmount?: string
) {
  let accounts = generateAccounts(numberOfAccount)
  await fundAccounts(accounts, ethAmount, testTokenAmount)
  await uploadAccount(accounts)
  console.log('finished')
}

async function fundExistingAccounts (ethAmount: string, testTokenAmount?: string) {
  const existingAccounts = await getAllAccounts()
  await fundAccounts(existingAccounts, ethAmount, testTokenAmount)
  console.log('finished')
}

// Examples:

// To add more prefilled accounts
// addPrefilledAccounts(100, '0.01', '100')

// Fund exsting prefilled accounts
// fundExistingAccounts('0.01')
