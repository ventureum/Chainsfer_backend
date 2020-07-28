"use strict";

require("core-js/modules/es6.symbol");

require("core-js/modules/web.dom.iterable");

require("core-js/modules/es6.regexp.to-string");

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; var ownKeys = Object.keys(source); if (typeof Object.getOwnPropertySymbols === 'function') { ownKeys = ownKeys.concat(Object.getOwnPropertySymbols(source).filter(function (sym) { return Object.getOwnPropertyDescriptor(source, sym).enumerable; })); } ownKeys.forEach(function (key) { _defineProperty(target, key, source[key]); }); } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

function asyncGeneratorStep(gen, resolve, reject, _next, _throw, key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { Promise.resolve(value).then(_next, _throw); } }

function _asyncToGenerator(fn) { return function () { var self = this, args = arguments; return new Promise(function (resolve, reject) { var gen = fn.apply(self, args); function _next(value) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "next", value); } function _throw(err) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "throw", err); } _next(undefined); }); }; }

const AWS = require('aws-sdk');

const Web3 = require('web3');

const EthereumTx = require('ethereumjs-tx');

const dynamodb = new AWS.DynamoDB({
  region: 'us-east-1'
});

const ERC20_ABI = require('../lambda/src/contracts/ERC20.json');

const infuraAPIKey = '5e1a4561588d43838ed87e12dbe2d1f0'; // fill in funding account's privateKey

const fundingPrivateKey = Buffer.from('', 'hex'); // remove 0x

const testTokenAddress = '0x4aacB7f0bA0A5CfF9A8a5e8C0F24626Ee9FDA4a6';
const web3 = new Web3(new Web3.providers.HttpProvider("https://rinkeby.infura.io/v3/".concat(infuraAPIKey)));

// eslint-disable-next-line flowtype/no-weak-types
function accountItemBuilder(address, privateKey) {
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
  };
} // eslint-disable-next-line flowtype/no-weak-types


function sendTxPromise(sendFunction, txObj) {
  // eslint-disable-next-line flowtype/no-weak-types
  return new Promise((resolve, reject) => {
    sendFunction(txObj).on('transactionHash', hash => {
      resolve(hash);
    }).on('error', err => {
      reject(err);
    });
  });
}

function getAllAccounts() {
  return _getAllAccounts.apply(this, arguments);
}

function _getAllAccounts() {
  _getAllAccounts = _asyncToGenerator(function* () {
    let scanParam = {
      TableName: 'AlphaTestEthereumAddress'
    };
    let result = [];

    while (true) {
      const rv = yield dynamodb.scan(scanParam).promise();
      result = [...result, ...rv.Items];

      if (!rv.LastEvaluatedKey) {
        break;
      }

      scanParam = _objectSpread({}, scanParam, {
        ExclusiveStartKey: rv.LastEvaluatedKey
      });
    } // eslint-disable-next-line flowtype/no-weak-types


    result = result.map(item => {
      return {
        address: item.address.S,
        privateKey: item.privateKey.S
      };
    });
    return result;
  });
  return _getAllAccounts.apply(this, arguments);
}

function fundAccounts(_x, _x2, _x3) {
  return _fundAccounts.apply(this, arguments);
}

function _fundAccounts() {
  _fundAccounts = _asyncToGenerator(function* (accounts, ethAmount, // in ether
  testTokenAmount // in ether
  ) {
    const fundingAccount = web3.eth.accounts.privateKeyToAccount('0x' + fundingPrivateKey.toString('hex'));
    let nonce = yield web3.eth.getTransactionCount(fundingAccount.address); // send eth

    for (let i = 0; i < accounts.length; i++) {
      const address = accounts[i].address;
      let value = web3.utils.toWei(ethAmount, 'ether');
      let price = yield web3.eth.getGasPrice();
      let gas = (yield web3.eth.estimateGas({
        from: fundingAccount.address,
        to: address,
        value: value
      })).toString();
      const txParams = {
        nonce: web3.utils.numberToHex(nonce),
        gasPrice: web3.utils.numberToHex(price),
        gasLimit: web3.utils.numberToHex(gas),
        to: address,
        value: web3.utils.numberToHex(value),
        // EIP 155 chainId - mainnet: 1, rinkeby: 4
        chainId: 4
      };
      const tx = new EthereumTx(txParams);
      tx.sign(fundingPrivateKey);
      const serializedTx = '0x' + tx.serialize().toString('hex');
      const txHash = yield sendTxPromise(web3.eth.sendSignedTransaction, serializedTx);
      console.log("Sent ".concat(web3.utils.fromWei(value, 'ether'), "ETH to ").concat(address, ": ").concat(txHash, " ").concat(i, "/").concat(accounts.length));
      nonce += 1;

      if (testTokenAmount) {
        const token = new web3.eth.Contract(ERC20_ABI.abi, testTokenAddress); // send ERC20 test token

        const data = token.methods.transfer(address, web3.utils.toWei(testTokenAmount, 'ether')).encodeABI();
        gas = yield token.methods.transfer(address, web3.utils.toWei(testTokenAmount, 'ether')).estimateGas({
          from: fundingAccount.address
        });
        const erc20TxParam = {
          nonce: web3.utils.numberToHex(nonce),
          gasPrice: web3.utils.numberToHex(price),
          gasLimit: web3.utils.numberToHex(gas),
          to: testTokenAddress,
          value: web3.utils.numberToHex(0),
          data: data,
          // EIP 155 chainId - mainnet: 1, rinkeby: 4
          chainId: 4
        };
        const erc20Tx = new EthereumTx(erc20TxParam);
        erc20Tx.sign(fundingPrivateKey);
        const serializedErc20Tx = '0x' + erc20Tx.serialize().toString('hex');
        const erc20TxHash = yield sendTxPromise(web3.eth.sendSignedTransaction, serializedErc20Tx);
        console.log("Sent ".concat(testTokenAmount, " test tokens to ").concat(address, ": ").concat(erc20TxHash, " ").concat(i, "/").concat(accounts.length));
        nonce += 1;
      }
    }
  });
  return _fundAccounts.apply(this, arguments);
}

function generateAccounts(n) {
  let newAccounts = [];

  for (let i = 0; i < n; i++) {
    const account = web3.eth.accounts.create();
    newAccounts.push(account);
  }

  return newAccounts;
}

function uploadAccount(_x4) {
  return _uploadAccount.apply(this, arguments);
}

function _uploadAccount() {
  _uploadAccount = _asyncToGenerator(function* (accounts) {
    // TODO: use BatchWrite
    yield Promise.all(accounts.map(
    /*#__PURE__*/
    function () {
      var _ref = _asyncToGenerator(function* (account, i) {
        const accountItem = accountItemBuilder(account.address, account.privateKey);
        yield dynamodb.updateItem(accountItem).promise();
      });

      return function (_x10, _x11) {
        return _ref.apply(this, arguments);
      };
    }()));
  });
  return _uploadAccount.apply(this, arguments);
}

function addPrefilledAccounts(_x5, _x6, _x7) {
  return _addPrefilledAccounts.apply(this, arguments);
}

function _addPrefilledAccounts() {
  _addPrefilledAccounts = _asyncToGenerator(function* (numberOfAccount, ethAmount, testTokenAmount) {
    let accounts = generateAccounts(numberOfAccount);
    yield fundAccounts(accounts, ethAmount, testTokenAmount);
    yield uploadAccount(accounts);
    console.log('finished');
  });
  return _addPrefilledAccounts.apply(this, arguments);
}

function fundExistingAccounts(_x8, _x9) {
  return _fundExistingAccounts.apply(this, arguments);
} // Examples:
// To add more prefilled accounts
// addPrefilledAccounts(100, '0.01', '100')
// Fund exsting prefilled accounts
// fundExistingAccounts('0.01')


function _fundExistingAccounts() {
  _fundExistingAccounts = _asyncToGenerator(function* (ethAmount, testTokenAmount) {
    const existingAccounts = yield getAllAccounts();
    yield fundAccounts(existingAccounts, ethAmount, testTokenAmount);
    console.log('finished');
  });
  return _fundExistingAccounts.apply(this, arguments);
}