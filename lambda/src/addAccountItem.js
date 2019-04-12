const AWS = require('aws-sdk')
const Web3 = require('web3')
const EthereumTx = require('ethereumjs-tx')
const dynamodb = new AWS.DynamoDB({ region: 'us-east-1' })

// filled in these Api key and faucet privateKey
const infuraApiKey = ''
const faucetPrivateKey = Buffer.from('', 'hex') // remove 0x
const faucetAmount = '0.1' // in ether

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
  for (let i = 0; i < 50; i++) {
    const account = web3.eth.accounts.create()
    const accountItem = accountItemBuilder(account.address, account.privateKey)
    await dynamodb.updateItem(accountItem).promise()
    testAddresses.push(account.address)
  }

  console.log('Faucet accounts')
  const faucetAccount = web3.eth.accounts.privateKeyToAccount('0x' + faucetPrivateKey.toString('hex'))
  const txCount = await web3.eth.getTransactionCount(faucetAccount.address)
  for (let i = 0; i < testAddresses.length; i++) {
    let value = web3.utils.toWei(faucetAmount, 'ether')
    let price = await web3.eth.getGasPrice()
    let gas = (await web3.eth.estimateGas({
      from: faucetAccount.address,
      to: testAddresses[i],
      value: value
    })).toString()
    const txParams = {
      nonce: web3.utils.numberToHex(txCount + i),
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
    console.log(`Sent ${web3.utils.fromWei(value, 'ether')} to ${testAddresses[i]}: ${txHash}`)
  }
}

main()
