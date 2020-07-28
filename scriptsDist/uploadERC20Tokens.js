"use strict";

require("core-js/modules/es6.symbol");

require("core-js/modules/web.dom.iterable");

require("core-js/modules/es6.regexp.to-string");

var _awsSdk = _interopRequireDefault(require("aws-sdk"));

var _fs = _interopRequireDefault(require("fs"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; var ownKeys = Object.keys(source); if (typeof Object.getOwnPropertySymbols === 'function') { ownKeys = ownKeys.concat(Object.getOwnPropertySymbols(source).filter(function (sym) { return Object.getOwnPropertyDescriptor(source, sym).enumerable; })); } ownKeys.forEach(function (key) { _defineProperty(target, key, source[key]); }); } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

function asyncGeneratorStep(gen, resolve, reject, _next, _throw, key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { Promise.resolve(value).then(_next, _throw); } }

function _asyncToGenerator(fn) { return function () { var self = this, args = arguments; return new Promise(function (resolve, reject) { var gen = fn.apply(self, args); function _next(value) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "next", value); } function _throw(err) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "throw", err); } _next(undefined); }); }; }

const documentClient = new _awsSdk.default.DynamoDB.DocumentClient({
  region: 'us-east-1'
});

function uploadERC20Contracts(_x) {
  return _uploadERC20Contracts.apply(this, arguments);
}

function _uploadERC20Contracts() {
  _uploadERC20Contracts = _asyncToGenerator(function* (env) {
    if (!env) throw new Error('taget env missing');

    const file = _fs.default.readFileSync(__dirname + '/ERC20Tokens.json');

    const erc20Contracts = JSON.parse(file.toString());
    let putRequests = erc20Contracts.map(contract => {
      return {
        PutRequest: {
          Item: _objectSpread({}, contract, {
            erc20: true
          })
        }
      };
    });
    let chunks = [];
    const chunkSize = 25; // max of Dynamodb batchWrite request size
    // split write requests into chunks of 25 put requests

    for (let i = 0; i < putRequests.length; i += chunkSize) {
      chunks.push(putRequests.slice(i, i + chunkSize));
    }

    yield Promise.all(chunks.map(
    /*#__PURE__*/
    function () {
      var _ref = _asyncToGenerator(function* (chunk) {
        const params = {
          RequestItems: {
            ["EthContracts".concat(env)]: chunk
          }
        };
        yield documentClient.batchWrite(params).promise();
      });

      return function (_x2) {
        return _ref.apply(this, arguments);
      };
    }()));
    console.log("Uploaded ".concat(putRequests.length, " items"));
  });
  return _uploadERC20Contracts.apply(this, arguments);
}

uploadERC20Contracts('Vincent');