import moment from 'moment'

const EMAIL_SOURCE = 'notify@chainsfer.io'

const CRYPTO_SYMBOL = {
  'ethereum': 'ETH',
  'bitcoin': 'BTC',
  'dai': 'DAI'
}

module.exports = {
  sendActionSenderEmailParams: function (id, sender, destination, transferAmount, cryptoType, password, sendTimestamp) {
    const cryptoSymbol = CRYPTO_SYMBOL[cryptoType]
    sendTimestamp = moment.unix(sendTimestamp).format('MMM Do YYYY, HH:mm:ss a')
    return {
      Source: EMAIL_SOURCE,
      ConfigurationSetName: "email",
      Destination: {
        ToAddresses: [sender]
      },
      Template: 'sendActionSenderEmail',
      TemplateData: `{\"id\": \"${id}\", \"sender\": \"${sender}\", \"destination\": \"${destination}\", \"transferAmount\": \"${transferAmount}\", \"password\": \"${password}\",  \"cryptoSymbol\": \"${cryptoSymbol}\", \"sendTimestamp\": \"${sendTimestamp}\"}`
    }
  },
  sendActionReceiverEmailParams: function (id, sender, destination, transferAmount, cryptoType, sendTimestamp) {
    const cryptoSymbol = CRYPTO_SYMBOL[cryptoType]
    sendTimestamp = moment.unix(sendTimestamp).format('MMM Do YYYY, HH:mm:ss a')
    return {
      Source: EMAIL_SOURCE,
      ConfigurationSetName: "email",
      Destination: {
        ToAddresses: [destination]
      },
      Template: 'sendActionReceiverEmail',
      TemplateData: `{\"id\": \"${id}\", \"sender\": \"${sender}\", \"destination\": \"${destination}\", \"transferAmount\": \"${transferAmount}\", \"cryptoSymbol\": \"${cryptoSymbol}\", \"sendTimestamp\": \"${sendTimestamp}\"}`
      }
  },
  receiveActionSenderEmailParams: function (id, sender, destination, transferAmount, cryptoType, receiveTimestamp) {
    const cryptoSymbol = CRYPTO_SYMBOL[cryptoType]
    console.log(receiveTimestamp)
    receiveTimestamp = moment.unix(receiveTimestamp).format('MMM Do YYYY, HH:mm:ss a')
    return {
      Source: EMAIL_SOURCE,
      ConfigurationSetName: "email",
      Destination: {
        ToAddresses: [sender]
      },
      Template: 'receiveActionSenderEmail',
      TemplateData: `{\"id\": \"${id}\", \"sender\": \"${sender}\", \"destination\": \"${destination}\", \"transferAmount\": \"${transferAmount}\", \"cryptoSymbol\": \"${cryptoSymbol}\", \"receiveTimestamp\": \"${receiveTimestamp}\"}`
    }
  },
  receiveActionReceiverEmailParams: function (id, sender, destination, transferAmount, cryptoType, sendTimestamp) {
    const cryptoSymbol = CRYPTO_SYMBOL[cryptoType]
    sendTimestamp = moment.unix(sendTimestamp).format('MMM Do YYYY, HH:mm:ss a')
    return {
      Source: EMAIL_SOURCE,
      ConfigurationSetName: "email",
      Destination: {
        ToAddresses: [destination]
      },
      Template: 'receiveActionReceiverEmail',
      TemplateData: `{\"id\": \"${id}\", \"sender\": \"${sender}\", \"destination\": \"${destination}\", \"transferAmount\": \"${transferAmount}\", \"cryptoSymbol\": \"${cryptoSymbol}\", \"sendTimestamp\": \"${sendTimestamp}\"}`
    }
  },
  cancelActionSenderEmailParams: function (id, sender, destination, transferAmount, cryptoType, cancelTimestamp) {
    const cryptoSymbol = CRYPTO_SYMBOL[cryptoType]
    cancelTimestamp = moment.unix(cancelTimestamp).format('MMM Do YYYY, HH:mm:ss a')
    return {
      Source: EMAIL_SOURCE,
      ConfigurationSetName: "email",
      Destination: {
        ToAddresses: [sender]
      },
      Template: 'cancelActionSenderEmail',
      TemplateData: `{\"id\": \"${id}\", \"sender\": \"${sender}\", \"destination\": \"${destination}\", \"transferAmount\": \"${transferAmount}\", \"cryptoSymbol\": \"${cryptoSymbol}\", \"cancelTimestamp\": \"${cancelTimestamp}\"}`
    }
  },
  cancelActionReceiverEmailParams: function (id, sender, destination, transferAmount, cryptoType, cancelTimestamp) {
    const cryptoSymbol = CRYPTO_SYMBOL[cryptoType]
    cancelTimestamp = moment.unix(cancelTimestamp).format('MMM Do YYYY, HH:mm:ss a')
    return {
      Source: EMAIL_SOURCE,
      ConfigurationSetName: "email",
      Destination: {
        ToAddresses: [destination]
      },
      Template: 'cancelActionReceiverEmail',
      TemplateData: `{\"id\": \"${id}\", \"sender\": \"${sender}\", \"destination\": \"${destination}\", \"transferAmount\": \"${transferAmount}\", \"cryptoSymbol\": \"${cryptoSymbol}\", \"cancelTimestamp\": \"${cancelTimestamp}\"}`
    }
  },
  expireActionSenderEmailParams: function (id, sender, destination, transferAmount, cryptoType) {
    const cryptoSymbol = CRYPTO_SYMBOL[cryptoType]
    return {
      Source: EMAIL_SOURCE,
      ConfigurationSetName: "email",
      Destination: {
        ToAddresses: [sender]
      },
      Template: 'expireActionSenderEmail',
      TemplateData: `{\"id\": \"${id}\", \"sender\": \"${sender}\", \"destination\": \"${destination}\", \"transferAmount\": \"${transferAmount}\", \"cryptoSymbol\": \"${cryptoSymbol}\"}`
    }
  },
  expireActionReceiverEmailParams: function (id, sender, destination, transferAmount, cryptoType) {
    const cryptoSymbol = CRYPTO_SYMBOL[cryptoType]
    return {
      Source: EMAIL_SOURCE,
      ConfigurationSetName: "email",
      Destination: {
        ToAddresses: [destination]
      },
      Template: 'expireActionReceiverEmail',
      TemplateData: `{\"id\": \"${id}\", \"sender\": \"${sender}\", \"destination\": \"${destination}\", \"transferAmount\": \"${transferAmount}\", \"cryptoSymbol\": \"${cryptoSymbol}\"}`
    }
  },
  // ses utils
  sendAction: function (
    ses,
    sendingId,
    receivingId,
    sender,
    destination,
    transferAmount,
    cryptoType,
    sendTxHash,
    sendTimestamp,
    password) {
    return Promise.all([
      ses.sendTemplatedEmail(this.sendActionSenderEmailParams(sendingId, sender, destination, transferAmount, cryptoType, password, sendTimestamp)).promise(),
      ses.sendTemplatedEmail(this.sendActionReceiverEmailParams(receivingId, sender, destination, transferAmount, cryptoType, sendTimestamp)).promise()
    ])
  },
  receiveAction: function (
    ses,
    sendingId,
    receivingId,
    sender,
    destination,
    transferAmount,
    cryptoType,
    sendTxHash,
    sendTimestamp,
    receiveTxHash,
    receiveTimestamp) {
    return Promise.all([
      ses.sendTemplatedEmail(this.receiveActionSenderEmailParams(sendingId, sender, destination, transferAmount, cryptoType, receiveTimestamp)).promise(),
      ses.sendTemplatedEmail(this.receiveActionReceiverEmailParams(receivingId, sender, destination, transferAmount, cryptoType, sendTimestamp)).promise()
    ])
  },
  cancelAction: function (
    ses,
    sendingId,
    receivingId,
    sender,
    destination,
    transferAmount,
    cryptoType,
    sendTxHash,
    sendTimestamp,
    cancelTxHash,
    cancelTimestamp) {
    return Promise.all([
      ses.sendTemplatedEmail(this.cancelActionSenderEmailParams(sendingId, sender, destination, transferAmount, cryptoType, cancelTimestamp)).promise(),
      ses.sendTemplatedEmail(this.cancelActionReceiverEmailParams(receivingId, sender, destination, transferAmount, cryptoType, cancelTimestamp)).promise()
    ])
  },
  expireAction: function (
    ses,
    sendingId,
    receivingId,
    sender,
    destination,
    transferAmount,
    cryptoType) {
    return Promise.all([
      ses.sendTemplatedEmail(this.expireActionSenderEmailParams(sendingId, sender, destination, transferAmount, cryptoType)).promise(),
      ses.sendTemplatedEmail(this.expireActionReceiverEmailParams(receivingId, sender, destination, transferAmount, cryptoType)).promise()
    ])
  }
}
