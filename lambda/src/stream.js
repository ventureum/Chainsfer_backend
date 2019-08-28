// @flow
import type { Context, Callback } from 'flow-aws-lambda'
import type { TransferDataType } from './transfer.flow'
var AWS = require('aws-sdk')
var sqs = new AWS.SQS({ region: 'us-east-1' })
var utils = require('./utils.js')
var Config = require('./config.js')

if (!process.env.SQS_NAME) throw new Error('SQS_NAME missing')
const sqsName = process.env.SQS_NAME

type RecordType = {
  eventName: string,
  dynamodb: {
    // eslint-disable-next-line flowtype/no-weak-types
    NewImage: Object
  }
}

exports.handler = function (
  event: { Records: Array<RecordType> },
  context: Context,
  callback: Callback
) {
  event.Records.forEach(function (record: RecordType) {
    const newImage = record.dynamodb.NewImage
    const transferData: TransferDataType = AWS.DynamoDB.Converter.unmarshall(newImage)
    const transferStage = transferData.transferStage
    const txState = transferData[utils.lowerCaseFirstLetter(transferStage)].txState
    if (txState === 'Pending') {
      console.log(
        'eventName: %s, transferId: %s, transferStage: %s',
        record.eventName,
        newImage.transferId.S,
        transferStage
      )
      const params = {
        MessageBody: JSON.stringify(transferData),
        QueueUrl: Config.QueueURLPrefix + sqsName,
        MessageAttributes: {
          RetryCount: {
            DataType: 'Number',
            StringValue: '0'
          },
          TxHashConfirmed: {
            DataType: 'Number',
            StringValue: '0' // O means False, 1 means true
          },
          GasTxHashConfirmed: {
            DataType: 'Number',
            StringValue: '0' // O means False, 1 means true
          }
        }
      }
      sqs.sendMessage(params, function (err: string, data: { MessageId: string }) {
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
