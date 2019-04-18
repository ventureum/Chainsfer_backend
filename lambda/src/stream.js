var AWS = require('aws-sdk')
var sqs = new AWS.SQS({ region: 'us-east-1' })
var utils = require('./utils.js')
var Config = require('./config.js')
const sqsName = process.env.SQS_NAME

exports.handler = function (event, context, callback) {
  event.Records.forEach(function (record) {
    const newImage = record.dynamodb.NewImage
    const transferStage = newImage.transferStage.S
    const txState = newImage[utils.lowerCaseFirstLetter(transferStage)].M.txState.S
    if (txState === 'Pending') {
      console.log('eventName: %s, transferId: %s, transferStage: %s',
        record.eventName, newImage.transferId.S, transferStage)
      const params = {
        MessageBody: JSON.stringify(newImage),
        QueueUrl: Config.QueueURLPrefix + sqsName,
        MessageAttributes: {
          'RetryCount': {
            DataType: 'Number',
            StringValue: '0'
          },
          'TxHashConfirmed': {
            DataType: 'Number',
            StringValue: '0' // O means False, 1 means true
          },
          'GasTxHashConfirmed': {
            DataType: 'Number',
            StringValue: '0' // O means False, 1 means true
          }
        }
      }
      sqs.sendMessage(params, function (err, data) {
        if (err) {
          console.log('Fail to send message: ', err)
          context.done('error', 'ERROR Put SQS')
        } else {
          console.log('MessageId:', data.MessageId)
          context.done(null, '')
        }
      })
    }
  })
  callback(null, 'message')
}
