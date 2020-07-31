// @flow
/* eslint flowtype/no-weak-types: 0 */
import type { Context, Callback } from 'flow-aws-lambda'
import Config from './config'

exports.handler = async (event: any, context: Context, callback: Callback) => {
  function handleResults (origin: string, err: Object) {
    let response = {
      headers: {
        'Access-Control-Allow-Headers':
          'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Origin': Config.getAllowOrigin(event.headers), // Required for CORS support to work
        'Access-Control-Allow-Credentials': true, // Required for cookies, authorization headers with HTTPS
        'Access-Control-Allow-Methods': "'GET,POST,PUT,DELETE,OPTIONS'"
      },
      isBase64Encoded: false,
      statusCode: 200,
      body: ''
    }

    if (!err) {
      response.statusCode = 200
      callback(null, response)
    } else {
      console.log(err)
      response.statusCode = 500
      response.body = err
      callback(null, response)
    }
  }

  try {
    handleResults('')
  } catch (err) {
    handleResults('', err)
  }
}
