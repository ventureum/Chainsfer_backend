// @flow
import type { Context, Callback } from 'flow-aws-lambda'
import { verifyGoogleIdToken } from './dynamoDBTxOps.js'

var Config = require('./config.js')
const AWS = require('aws-sdk')
AWS.config.update({ region: 'us-east-1' })
var documentClient = new AWS.DynamoDB.DocumentClient()

if (!process.env.USER_TABLE_NAME) throw new Error('USER_TABLE_NAME missing')
const userTableName = process.env.USER_TABLE_NAME
if (!process.env.ENV_VALUE) throw new Error('ENV_VALUE missing')
const deploymentStage = process.env.ENV_VALUE.toLowerCase()

const googleAPIConfig = Config.GoogleAPIConfig[deploymentStage] || Config.GoogleAPIConfig['default']

type Recipient = {
  name: string,
  email: string,
  addedAt: number, // timestamp
  updatedAt: number // timestamp
}

async function getRecipients (userTableName: string, googleId: string) {
  const params = {
    TableName: userTableName,
    Key: {
      googleId
    }
  }

  let response = await documentClient.get(params).promise()
  let result = []
  if (response.Item && response.Item.recipients) {
    result = [...response.Item.recipients]
  }
  return {
    googleId: googleId,
    recipients: result
  }
}

async function removeRecipient (userTableName: string, googleId: string, recipient: Recipient) {
  let { recipients } = await getRecipients(userTableName, googleId)

  recipients = recipients.filter((item: Recipient) => {
    return item.name !== recipient.name
  })

  const params = {
    TableName: userTableName,
    Key: {
      googleId
    },
    UpdateExpression: 'set recipients = :r',
    ExpressionAttributeValues: {
      ':r': recipients
    },
    ReturnValues: 'UPDATED_NEW'
  }

  let response = await documentClient.update(params).promise()
  return {
    googleId: googleId,
    recipients: response.Attributes.recipients
  }
}

async function addRecipient (userTableName: string, googleId: string, recipient: Recipient) {
  let { recipients } = await getRecipients(userTableName, googleId)
  const index = recipients.findIndex((item: Recipient) => item.name === recipient.name)
  const now = Math.floor(Date.now() / 1000)
  // replace if exist
  if (index !== -1) {
    const { addedAt } = recipients[index]
    recipients.splice(index, 1, {
      updatedAt: now,
      addedAt,
      ...recipient
    })
  } else {
    recipients.push({ updatedAt: now, addedAt: now, ...recipient })
  }

  const params = {
    TableName: userTableName,
    Key: {
      googleId: googleId
    },
    UpdateExpression: 'set recipients = :r',
    ExpressionAttributeValues: {
      ':r': recipients
    },
    ReturnValues: 'UPDATED_NEW'
  }
  let response = await documentClient.update(params).promise()

  return {
    action: index === -1 ? 'ADDED' : 'MODIFIED',
    googleId: googleId,
    recipients: response.Attributes.recipients
  }
}

exports.handler = async (event: any, context: Context, callback: Callback) => {
  let request = JSON.parse(event.body)

  function handleResults (rv, err) {
    let response: Object = {
      headers: {
        'Access-Control-Allow-Origin': '*', // Required for CORS support to work
        'Access-Control-Allow-Credentials': true // Required for cookies, authorization headers with HTTPS
      },
      isBase64Encoded: false
    }

    if (!err) {
      response.statusCode = 200
      response.body = JSON.stringify(rv)
      callback(null, response)
    } else {
      console.log(err)
      response.statusCode = 500
      response.body = JSON.stringify(err)
      callback(null, response)
    }
  }

  try {
    let rv = null
    let googleId = await verifyGoogleIdToken(googleAPIConfig['clientId'], request.idToken)

    if (request.action === 'GET_RECIPIENTS') {
      rv = await getRecipients(userTableName, googleId)
    } else if (request.action === 'REMOVE_RECIPIENT') {
      rv = await removeRecipient(userTableName, googleId, request.recipient)
    } else if (request.action === 'ADD_RECIPIENT') {
      rv = await addRecipient(userTableName, googleId, request.recipient)
    } else {
      throw new Error('Invalid command')
    }
    handleResults(rv)
  } catch (err) {
    handleResults(null, err)
  }
}
