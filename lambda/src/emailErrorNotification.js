// @flow
import type { Context, Callback } from 'flow-aws-lambda'
import email from './email'
import { getTransfer } from './dynamoDBTxOps'
import type { TransferDataType } from './transfer.flow'
import { updateEmailSentFailure } from './dynamoDBTxOps'
import Config from './config'

// eslint-disable-next-line flowtype/no-weak-types
exports.handler = async (event: any, context: Context, callback: Callback) => {
  console.log('event', event)
  // eslint-disable-next-line flowtype/no-weak-types
  function handleResults (rv: Object, err: Object) {
    let response = {
      headers: {
        'Access-Control-Allow-Origin': true, // Required for CORS support to work
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
    const { messageId } = message.mail
    const item = await email.getEmailActionRecord(messageId)
    console.log(`New message event: ${message.eventType}`)
    if (message.eventType === 'Bounce') {
      const transferData = await getTransfer({
        transferId: item.transferId,
        receivingId: ''
      })

      // getTransfer returns { error: string } when Tx is not found
      if (!transferData.error && !transferData.emailSentFailure) {
        // Send only one notification per transferData
        // i.e. transferData.emailSentFailure is null
        console.log(`sending error email for transfer: ${item.transferId}`)
        //$FlowFixMe
        rv = await email.emailErrorAction(transferData)
        await updateEmailSentFailure(item.transferId, event.Records[0].Sns.Message)
        await email.updateEmailActionRecord(messageId, message.eventType)
      }
    } else if (
      message.eventType === 'Click' ||
      message.eventType === 'Open' ||
      message.eventType === 'Complaint'
    ) {
      if (item && !item[message.eventType.toLowerCase()]) {
        console.log(`Updating message record ${messageId} with event type ${message.eventType}`)
        rv = await email.updateEmailActionRecord(messageId, message.eventType)
      }
    }
    handleResults(rv)
  } catch (err) {
    handleResults(null, err)
  }
}
