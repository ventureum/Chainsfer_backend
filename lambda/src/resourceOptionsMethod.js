// @flow
/* eslint flowtype/no-weak-types: 0 */
import type { Context, Callback } from 'flow-aws-lambda'

const DEFAULT_ALLOWED_ORIGIN = 'https://app.chainsfr.com'

exports.handler = async (event: any, context: Context, callback: Callback) => {
  let request = JSON.parse(event.body)

  function handleResults (origin: string, err: Object) {
    let allowedOrigin = DEFAULT_ALLOWED_ORIGIN
    if (origin.endsWith('.serveo.ventureum.io') || origin.endsWith('chainsfr.com')) {
      allowedOrigin = origin
    }
    let response = {
      headers: {
        'Access-Control-Allow-Headers':
          'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Origin': allowedOrigin, // Required for CORS support to work
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
    handleResults(event.headers.origin)
  } catch (err) {
    handleResults('', err)
  }
}
