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

module.exports = {
  TxConfirmationConfig: TxConfirmationConfig
}
