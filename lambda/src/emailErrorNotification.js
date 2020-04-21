// @flow
import type { Context, Callback } from 'flow-aws-lambda'
import email from './email'
import { getTransfer } from './dynamoDBTxOps'
import type { TransferDataType } from './transfer.flow'
// eslint-disable-next-line flowtype/no-weak-types
exports.handler = async (event: any, context: Context, callback: Callback) => {
  // eslint-disable-next-line flowtype/no-weak-types
  function handleResults (rv: Object, err: Object) {
    let response = {
      headers: {
        'Access-Control-Allow-Origin': '*', // Required for CORS support to work
        'Access-Control-Allow-Credentials': true // Required for cookies, authorization headers with HTTPS
      },
      isBase64Encoded: false,
      statusCode: 200,
      body: ''
    }

    if (!err) {
      response.statusCode = 200
      response.body = JSON.stringify(rv)
      callback(null, response)
    } else {
      console.log(err)
      response.statusCode = 500
      response.body = err.message
      callback(null, response)
    }
  }
  try {
    if (!event.Records || !event.Records[0] || !event.Records[0].Sns) {
      throw new Error(`Invalid Event: ${JSON.stringify(event)}`)
    }
    let rv = {}
    const message = JSON.parse(event.Records[0].Sns.Message)
    if (message.eventType === 'Bounce') {
      const { messageId } = message.mail
      const item = await email.getEmailActionRecord(messageId)
      const transferData = await getTransfer({
        transferId: item.transferId,
        receivingId: ''
      })
      if (!transferData.error) {
        console.log(`sending error email for transfer: ${item.transferId}`)
        //$FlowFixMe
        rv = await email.emailErrorAction(transferData)
      }
    }
    handleResults(rv)
  } catch (err) {
    handleResults(null, err)
  }
}
