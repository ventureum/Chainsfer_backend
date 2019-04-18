var Config = require('./config.js')
var AWS = require('aws-sdk')
AWS.config.update({ region: 'us-east-1' })
var dynamoDBTxOps = require('./dynamoDBTxOps.js')
const tableName = process.env.TABLE_NAME
const env = process.env.ENV_VALUE
var ses = new AWS.SES({ apiVersion: '2010-12-01' })
var email = require('./email.js')

exports.handler = async (event, context, callback) => {
  const expirationLength = Config.ExpirationLengthConfig[env.toLowerCase()] || Config.ExpirationLengthConfig['default']
  let items = await dynamoDBTxOps.validateExpiration(tableName, expirationLength)
  for (let index = 0; index < items.length; index++) {
    const item = items[index]
    console.log('Expired tarnsfer: ', item.transferId)
    await email.expireAction(
      ses,
      item.transferId,
      item.receivingId,
      item.sender,
      item.receiver,
      item.transferAmount,
      item.cryptoType
    )
  }
  callback(null, 'message')
}
