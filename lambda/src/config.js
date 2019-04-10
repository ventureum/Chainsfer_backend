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

module.exports = {
  TxConfirmationConfig: TxConfirmationConfig
}
