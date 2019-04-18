const TxConfirmationConfig = {
  'ethereum': {
    'delaySeconds': 60,
    'maxRetry': 20
  },
  'dai': {
    'delaySeconds': 60,
    'maxRetry': 20
  },
  'bitcoin': {
    'delaySeconds': 600,
    'maxRetry': 6
  }
}

const ExpirationLengthConfig = {
  'prod': 2592000, // 1 month in seconds
  'staging': 300, // 5 mins
  'test': 300, // 5 mins
  'default': 300 // 5 mins
}

const QueueURLPrefix = 'https://sqs.us-east-1.amazonaws.com/727151012682/'

module.exports = {
  TxConfirmationConfig: TxConfirmationConfig,
  QueueURLPrefix: QueueURLPrefix,
  ExpirationLengthConfig: ExpirationLengthConfig
}
