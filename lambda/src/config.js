const TxConfirmationConfig = {
  'ethereum': {
    'delaySeconds': 120,
    'maxRetry': 15
  },
  'dai': {
    'delaySeconds': 120,
    'maxRetry': 15
  },
  'bitcoin': {
    'delaySeconds': 600,
    'maxRetry': 6
  }
}

const QueueURLPrefix = 'https://sqs.us-east-1.amazonaws.com/727151012682/'

module.exports = {
  TxConfirmationConfig: TxConfirmationConfig,
  QueueURLPrefix: QueueURLPrefix
}
