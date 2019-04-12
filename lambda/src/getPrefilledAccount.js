const AWS = require('aws-sdk')
const dynamodb = new AWS.DynamoDB({ region: 'us-east-1' })

function getItemBuilder () {
  return {
    ProjectionExpression: 'ALL_ATTRIBUTES',
    TableName: 'AlphaTestEthereumAddress',
    Limit: '1',
    ConsistentRead: true
  }
}

function deleteItemBuilder (address) {
  return {
    Key: {
      'address': {
        S: address
      }
    },
    TableName: 'AlphaTestEthereumAddress',
    ReturnValues: 'ALL_OLD'
  }
}

exports.handler = async (event, context, callback) => {
  let response = {
    'headers': {
      'Access-Control-Allow-Origin': '*', // Required for CORS support to work
      'Access-Control-Allow-Credentials': true // Required for cookies, authorization headers with HTTPS
    },
    'isBase64Encoded': false
  }

  try {
    let result = await dynamodb.scan(getItemBuilder()).promise()
    if (result.LastEvaluatedKey) {
      const address = result.LastEvaluatedKey.address.S
      result = await dynamodb.deleteItem(deleteItemBuilder(address)).promise()
      response.statusCode = 200
      response.body = {
        address: result.Attributes.address.S,
        privateKey: result.Attributes.privateKey.S
      }
      callback(null, response)
    } else {
      response.statusCode = 200
      response.body = 'ETH test account list exhausted.'
      callback(null, response)
    }
  } catch (e) {
    callback(JSON.stringify(e))
  }
}
