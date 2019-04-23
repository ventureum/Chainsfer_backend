// @flow

import moment from 'moment'

const EMAIL_SOURCE = 'notify@chainsfer.io'

const CRYPTO_SYMBOL = {
  'ethereum': 'ETH',
  'bitcoin': 'BTC',
  'dai': 'DAI'
}

module.exports = {
  sendActionSenderEmailParams: function (id: string, sender: string, destination: string, transferAmount: string, cryptoType: string, password: string, sendTimestamp: number) {
    const cryptoSymbol = CRYPTO_SYMBOL[cryptoType]
    const sendTimestampStr = moment.unix(sendTimestamp).format('MMM Do YYYY, HH:mm:ss a')
    return {
      Source: EMAIL_SOURCE,
      ConfigurationSetName: 'email',
      Destination: {
        ToAddresses: [sender]
      },
      Template: 'sendActionSenderEmail',
      TemplateData: `{\"id\": \"${id}\", \"sender\": \"${sender}\", \"destination\": \"${destination}\", \"transferAmount\": \"${transferAmount}\", \"password\": \"${password}\",  \"cryptoSymbol\": \"${cryptoSymbol}\", \"sendTimestamp\": \"${sendTimestampStr}\"}`
    }
  },
  sendActionReceiverEmailParams: function (id: string, sender: string, destination: string, transferAmount: string, cryptoType: string, sendTimestamp: number) {
    const cryptoSymbol = CRYPTO_SYMBOL[cryptoType]
    const sendTimestampStr = moment.unix(sendTimestamp).format('MMM Do YYYY, HH:mm:ss a')
    return {
      Source: EMAIL_SOURCE,
      ConfigurationSetName: 'email',
      Destination: {
        ToAddresses: [destination]
      },
      Template: 'sendActionReceiverEmail',
      TemplateData: `{\"id\": \"${id}\", \"sender\": \"${sender}\", \"destination\": \"${destination}\", \"transferAmount\": \"${transferAmount}\", \"cryptoSymbol\": \"${cryptoSymbol}\", \"sendTimestamp\": \"${sendTimestampStr}\"}`
    }
  },
  receiveActionSenderEmailParams: function (id: string, sender: string, destination: string, transferAmount: string, cryptoType: string, receiveTimestamp: number) {
    const cryptoSymbol = CRYPTO_SYMBOL[cryptoType]
    const receiveTimestampStr = moment.unix(receiveTimestamp).format('MMM Do YYYY, HH:mm:ss a')
    return {
      Source: EMAIL_SOURCE,
      ConfigurationSetName: 'email',
      Destination: {
        ToAddresses: [sender]
      },
      Template: 'receiveActionSenderEmail',
      TemplateData: `{\"id\": \"${id}\", \"sender\": \"${sender}\", \"destination\": \"${destination}\", \"transferAmount\": \"${transferAmount}\", \"cryptoSymbol\": \"${cryptoSymbol}\", \"receiveTimestamp\": \"${receiveTimestampStr}\"}`
    }
  },
  receiveActionReceiverEmailParams: function (id: string, sender: string, destination: string, transferAmount: string, cryptoType: string, sendTimestamp: number) {
    const cryptoSymbol = CRYPTO_SYMBOL[cryptoType]
    const sendTimestampStr = moment.unix(sendTimestamp).format('MMM Do YYYY, HH:mm:ss a')
    return {
      Source: EMAIL_SOURCE,
      ConfigurationSetName: 'email',
      Destination: {
        ToAddresses: [destination]
      },
      Template: 'receiveActionReceiverEmail',
      TemplateData: `{\"id\": \"${id}\", \"sender\": \"${sender}\", \"destination\": \"${destination}\", \"transferAmount\": \"${transferAmount}\", \"cryptoSymbol\": \"${cryptoSymbol}\", \"sendTimestamp\": \"${sendTimestampStr}\"}`
    }
  },
  cancelActionSenderEmailParams: function (id: string, sender: string, destination: string, transferAmount: string, cryptoType: string, cancelTimestamp: number) {
    const cryptoSymbol = CRYPTO_SYMBOL[cryptoType]
    const cancelTimestampStr = moment.unix(cancelTimestamp).format('MMM Do YYYY, HH:mm:ss a')
    return {
      Source: EMAIL_SOURCE,
      ConfigurationSetName: 'email',
      Destination: {
        ToAddresses: [sender]
      },
      Template: 'cancelActionSenderEmail',
      TemplateData: `{\"id\": \"${id}\", \"sender\": \"${sender}\", \"destination\": \"${destination}\", \"transferAmount\": \"${transferAmount}\", \"cryptoSymbol\": \"${cryptoSymbol}\", \"cancelTimestamp\": \"${cancelTimestampStr}\"}`
    }
  },
  cancelActionReceiverEmailParams: function (id: string, sender: string, destination: string, transferAmount: string, cryptoType: string, cancelTimestamp: number) {
    const cryptoSymbol = CRYPTO_SYMBOL[cryptoType]
    const cancelTimestampStr = moment.unix(cancelTimestamp).format('MMM Do YYYY, HH:mm:ss a')
    return {
      Source: EMAIL_SOURCE,
      ConfigurationSetName: 'email',
      Destination: {
        ToAddresses: [destination]
      },
      Template: 'cancelActionReceiverEmail',
      TemplateData: `{\"id\": \"${id}\", \"sender\": \"${sender}\", \"destination\": \"${destination}\", \"transferAmount\": \"${transferAmount}\", \"cryptoSymbol\": \"${cryptoSymbol}\", \"cancelTimestamp\": \"${cancelTimestampStr}\"}`
    }
  },
  expireActionSenderEmailParams: function (id: string, sender: string, destination: string, transferAmount: string, cryptoType: string) {
    const cryptoSymbol = CRYPTO_SYMBOL[cryptoType]
    return {
      Source: EMAIL_SOURCE,
      ConfigurationSetName: 'email',
      Destination: {
        ToAddresses: [sender]
      },
      Template: 'expireActionSenderEmail',
      TemplateData: `{\"id\": \"${id}\", \"sender\": \"${sender}\", \"destination\": \"${destination}\", \"transferAmount\": \"${transferAmount}\", \"cryptoSymbol\": \"${cryptoSymbol}\"}`
    }
  },
  expireActionReceiverEmailParams: function (id: string, sender: string, destination: string, transferAmount: string, cryptoType: string) {
    const cryptoSymbol = CRYPTO_SYMBOL[cryptoType]
    return {
      Source: EMAIL_SOURCE,
      ConfigurationSetName: 'email',
      Destination: {
        ToAddresses: [destination]
      },
      Template: 'expireActionReceiverEmail',
      TemplateData: `{\"id\": \"${id}\", \"sender\": \"${sender}\", \"destination\": \"${destination}\", \"transferAmount\": \"${transferAmount}\", \"cryptoSymbol\": \"${cryptoSymbol}\"}`
    }
  },
  // ses utils
  sendAction: function (
    ses: Object,
    sendingId: string,
    receivingId: string,
    sender: string,
    destination: string,
    transferAmount: string,
    cryptoType: string,
    sendTxHash: string,
    sendTimestamp: string,
    password: string) {
    return Promise.all([
      ses.sendTemplatedEmail(this.sendActionSenderEmailParams(sendingId, sender, destination, transferAmount, cryptoType, password, sendTimestamp)).promise(),
      ses.sendTemplatedEmail(this.sendActionReceiverEmailParams(receivingId, sender, destination, transferAmount, cryptoType, sendTimestamp)).promise()
    ])
  },
  receiveAction: function (
    ses: Object,
    sendingId: string,
    receivingId: string,
    sender: string,
    destination: string,
    transferAmount: string,
    cryptoType: string,
    sendTxHash: string,
    sendTimestamp: string,
    receiveTxHash: string,
    receiveTimestamp: string) {
    return Promise.all([
      ses.sendTemplatedEmail(this.receiveActionSenderEmailParams(sendingId, sender, destination, transferAmount, cryptoType, receiveTimestamp)).promise(),
      ses.sendTemplatedEmail(this.receiveActionReceiverEmailParams(receivingId, sender, destination, transferAmount, cryptoType, sendTimestamp)).promise()
    ])
  },
  cancelAction: function (
    ses: Object,
    sendingId: string,
    receivingId: string,
    sender: string,
    destination: string,
    transferAmount: string,
    cryptoType: string,
    sendTxHash: string,
    sendTimestamp: string,
    cancelTxHash: string,
    cancelTimestamp: string) {
    return Promise.all([
      ses.sendTemplatedEmail(this.cancelActionSenderEmailParams(sendingId, sender, destination, transferAmount, cryptoType, cancelTimestamp)).promise(),
      ses.sendTemplatedEmail(this.cancelActionReceiverEmailParams(receivingId, sender, destination, transferAmount, cryptoType, cancelTimestamp)).promise()
    ])
  },
  expireAction: function (
    ses: Object,
    sendingId: string,
    receivingId: string,
    sender: string,
    destination: string,
    transferAmount: string,
    cryptoType: string) {
    return Promise.all([
      ses.sendTemplatedEmail(this.expireActionSenderEmailParams(sendingId, sender, destination, transferAmount, cryptoType)).promise(),
      ses.sendTemplatedEmail(this.expireActionReceiverEmailParams(receivingId, sender, destination, transferAmount, cryptoType)).promise()
    ])
  }
}
