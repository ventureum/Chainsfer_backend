// @flow
const AWS = require('aws-sdk')
const Web3 = require('web3')
const EthereumTx = require('ethereumjs-tx')
const dynamodb = new AWS.DynamoDB({ region: 'us-east-1' })
const ERC20_ABI = require('./contracts/ERC20.json')

// filled in these Api key and faucet privateKey
const infuraApiKey = ''
const faucetPrivateKey = Buffer.from('', 'hex') // remove 0x
const faucetETHAmount = '0.01' // in ether
const faucetTestTokenAmount = '100' // in ether
const testTokenAddress = '0x4aacB7f0bA0A5CfF9A8a5e8C0F24626Ee9FDA4a6'
function accountItemBuilder (address, privateKey) {
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
      'address': {
        S: address
      }
    },
    ReturnValues: 'ALL_NEW',
    TableName: 'AlphaTestEthereumAddress',
    UpdateExpression: 'SET #PK = :pkv'
  }
}

function sendTxPromise (sendFunction, txObj) {
  return new Promise((resolve, reject) => {
    sendFunction(txObj)
      .on('transactionHash', (hash) => {
        resolve(hash)
      })
      .on('error', (err) => {
        reject(err)
      })
  })
}

async function main () {
  var web3 = new Web3(new Web3.providers.HttpProvider(`https://rinkeby.infura.io/v3/${infuraApiKey}`))

  let testAddresses = []
  // Upload 50 test address/privateKey pairs
  for (let i = 0; i < 300; i++) {
    const account = web3.eth.accounts.create()
    const accountItem = accountItemBuilder(account.address, account.privateKey)
    await dynamodb.updateItem(accountItem).promise()
    testAddresses.push(account.address)
  }

  console.log('Faucet accounts')
  const faucetAccount = web3.eth.accounts.privateKeyToAccount('0x' + faucetPrivateKey.toString('hex'))
  const txCount = await web3.eth.getTransactionCount(faucetAccount.address)
  const token = await web3.eth.Contract(ERC20_ABI.abi, testTokenAddress)

  for (let i = 0; i < testAddresses.length; i++) {
    // send eth
    let value = web3.utils.toWei(faucetETHAmount, 'ether')
    let price = await web3.eth.getGasPrice()
    let gas = (await web3.eth.estimateGas({
      from: faucetAccount.address,
      to: testAddresses[i],
      value: value
    })).toString()
    const txParams = {
      nonce: web3.utils.numberToHex(txCount + (i * 2)),
      gasPrice: web3.utils.numberToHex(price),
      gasLimit: web3.utils.numberToHex(gas),
      to: testAddresses[i],
      value: web3.utils.numberToHex(value),
      // EIP 155 chainId - mainnet: 1, rinkeby: 4
      chainId: 4
    }
    const tx = new EthereumTx(txParams)
    tx.sign(faucetPrivateKey)
    const serializedTx = '0x' + tx.serialize().toString('hex')
    const txHash = await sendTxPromise(web3.eth.sendSignedTransaction, serializedTx)
    console.log(`Sent ${web3.utils.fromWei(value, 'ether')} to ${testAddresses[i]}: ${txHash} ${i}`)

    // send ERC20 test token
    const data = token.methods.transfer(testAddresses[i], web3.utils.toWei(faucetTestTokenAmount, 'ether')).encodeABI()
    gas = await token.methods.transfer.estimateGas({ from: faucetAccount.address })
    const erc20TxParam = {
      nonce: web3.utils.numberToHex(txCount + (i * 2) + 1),
      gasPrice: web3.utils.numberToHex(price),
      gasLimit: web3.utils.numberToHex(gas),
      to: token.address,
      value: web3.utils.numberToHex(0),
      data: data,
      // EIP 155 chainId - mainnet: 1, rinkeby: 4
      chainId: 4
    }
    const erc20Tx = new EthereumTx(erc20TxParam)
    erc20Tx.sign(faucetPrivateKey)
    const serializedErc20Tx = '0x' + erc20Tx.serialize().toString('hex')
    const erc20TxHash = await sendTxPromise(web3.eth.sendSignedTransaction, serializedErc20Tx)
    console.log(`Sent ${faucetTestTokenAmount} test tokens to ${testAddresses[i]}: ${erc20TxHash} ${i}`)
  }
  console.log('Finished')
}

main()
