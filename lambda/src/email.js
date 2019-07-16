// @flow

import moment from 'moment'
import Config from './config'

const EMAIL_SOURCE = 'notify@chainsfr.com'

const CRYPTO_SYMBOL = {
  'ethereum': 'ETH',
  'bitcoin': 'BTC',
  'dai': 'DAI',
  'libra': 'LIBRA'
}

if (!process.env.ENV_VALUE) throw new Error('ENV_VALUE missing')
const deploymentStage = process.env.ENV_VALUE.toLowerCase()

const rootUrl = Config.RootUrlConfig[deploymentStage] || Config.RootUrlConfig['default']

module.exports = {
  sendActionSenderEmailParams: function (id: string, sender: string, destination: string, transferAmount: string, cryptoType: string, sendTimestamp: number) {
    const cryptoSymbol = CRYPTO_SYMBOL[cryptoType]
    const sendTimestampStr = moment.unix(sendTimestamp).format('MMM Do YYYY, HH:mm:ss a')
    const { years, months, date, hours, minutes, seconds } = moment.unix(sendTimestamp).utc().toObject()
    const sendTimestampParam = `day=${date}&month=${months + 1}&year=${years}&hour=${hours}&min=${minutes}&sec=${seconds}`
    return {
      Source: EMAIL_SOURCE,
      ConfigurationSetName: 'email',
      Destination: {
        ToAddresses: [sender]
      },
      Template: 'sendActionSenderEmail',
      TemplateData: `{\"id\": \"${id}\", \"rootUrl\": \"${rootUrl}\", \"sender\": \"${sender}\", \"destination\": \"${destination}\", \"transferAmount\": \"${transferAmount}\",  \"cryptoSymbol\": \"${cryptoSymbol}\", \"sendTimestamp\": \"${sendTimestampStr}\", \"sendTimestampParam\": \"${sendTimestampParam}\"}`
    }
  },
  sendActionReceiverEmailParams: function (id: string, sender: string, destination: string, transferAmount: string, cryptoType: string, sendTimestamp: number) {
    const cryptoSymbol = CRYPTO_SYMBOL[cryptoType]
    const sendTimestampStr = moment.unix(sendTimestamp).format('MMM Do YYYY, HH:mm:ss a')
    const { years, months, date, hours, minutes, seconds } = moment.unix(sendTimestamp).utc().toObject()
    const sendTimestampParam = `day=${date}&month=${months + 1}&year=${years}&hour=${hours}&min=${minutes}&sec=${seconds}`
    return {
      Source: EMAIL_SOURCE,
      ConfigurationSetName: 'email',
      Destination: {
        ToAddresses: [destination]
      },
      Template: 'sendActionReceiverEmail',
      TemplateData: `{\"id\": \"${id}\", \"rootUrl\": \"${rootUrl}\", \"sender\": \"${sender}\", \"destination\": \"${destination}\", \"transferAmount\": \"${transferAmount}\", \"cryptoSymbol\": \"${cryptoSymbol}\", \"sendTimestamp\": \"${sendTimestampStr}\", \"sendTimestampParam\": \"${sendTimestampParam}\"}`
    }
  },
  receiveActionSenderEmailParams: function (id: string, sender: string, destination: string, transferAmount: string, cryptoType: string, receiveTimestamp: number) {
    const cryptoSymbol = CRYPTO_SYMBOL[cryptoType]
    const receiveTimestampStr = moment.unix(receiveTimestamp).format('MMM Do YYYY, HH:mm:ss a')
    const { years, months, date, hours, minutes, seconds } = moment.unix(receiveTimestamp).utc().toObject()
    const receiveTimestampParam = `day=${date}&month=${months + 1}&year=${years}&hour=${hours}&min=${minutes}&sec=${seconds}`
    return {
      Source: EMAIL_SOURCE,
      ConfigurationSetName: 'email',
      Destination: {
        ToAddresses: [sender]
      },
      Template: 'receiveActionSenderEmail',
      TemplateData: `{\"id\": \"${id}\", \"rootUrl\": \"${rootUrl}\", \"sender\": \"${sender}\", \"destination\": \"${destination}\", \"transferAmount\": \"${transferAmount}\", \"cryptoSymbol\": \"${cryptoSymbol}\", \"receiveTimestamp\": \"${receiveTimestampStr}\", \"receiveTimestampParam\": \"${receiveTimestampParam}\"}`
    }
  },
  receiveActionReceiverEmailParams: function (id: string, sender: string, destination: string, transferAmount: string, cryptoType: string, sendTimestamp: number) {
    const cryptoSymbol = CRYPTO_SYMBOL[cryptoType]
    const sendTimestampStr = moment.unix(sendTimestamp).format('MMM Do YYYY, HH:mm:ss a')
    const { years, months, date, hours, minutes, seconds } = moment.unix(sendTimestamp).utc().toObject()
    const sendTimestampParam = `day=${date}&month=${months + 1}&year=${years}&hour=${hours}&min=${minutes}&sec=${seconds}`
    return {
      Source: EMAIL_SOURCE,
      ConfigurationSetName: 'email',
      Destination: {
        ToAddresses: [destination]
      },
      Template: 'receiveActionReceiverEmail',
      TemplateData: `{\"id\": \"${id}\", \"rootUrl\": \"${rootUrl}\", \"sender\": \"${sender}\", \"destination\": \"${destination}\", \"transferAmount\": \"${transferAmount}\", \"cryptoSymbol\": \"${cryptoSymbol}\", \"sendTimestamp\": \"${sendTimestampStr}\", \"sendTimestampParam\": \"${sendTimestampParam}\"}`
    }
  },
  cancelActionSenderEmailParams: function (id: string, sender: string, destination: string, transferAmount: string, cryptoType: string, cancelTimestamp: number) {
    const cryptoSymbol = CRYPTO_SYMBOL[cryptoType]
    const cancelTimestampStr = moment.unix(cancelTimestamp).format('MMM Do YYYY, HH:mm:ss a')
    const { years, months, date, hours, minutes, seconds } = moment.unix(cancelTimestamp).utc().toObject()
    const cancelTimestampParam = `day=${date}&month=${months + 1}&year=${years}&hour=${hours}&min=${minutes}&sec=${seconds}`
    return {
      Source: EMAIL_SOURCE,
      ConfigurationSetName: 'email',
      Destination: {
        ToAddresses: [sender]
      },
      Template: 'cancelActionSenderEmail',
      TemplateData: `{\"id\": \"${id}\", \"rootUrl\": \"${rootUrl}\", \"sender\": \"${sender}\", \"destination\": \"${destination}\", \"transferAmount\": \"${transferAmount}\", \"cryptoSymbol\": \"${cryptoSymbol}\", \"cancelTimestamp\": \"${cancelTimestampStr}\", \"cancelTimestampParam\": \"${cancelTimestampParam}\"}`
    }
  },
  cancelActionReceiverEmailParams: function (id: string, sender: string, destination: string, transferAmount: string, cryptoType: string, cancelTimestamp: number) {
    const cryptoSymbol = CRYPTO_SYMBOL[cryptoType]
    const cancelTimestampStr = moment.unix(cancelTimestamp).format('MMM Do YYYY, HH:mm:ss a')
    const { years, months, date, hours, minutes, seconds } = moment.unix(cancelTimestamp).utc().toObject()
    const cancelTimestampParam = `day=${date}&month=${months + 1}&year=${years}&hour=${hours}&min=${minutes}&sec=${seconds}`
    return {
      Source: EMAIL_SOURCE,
      ConfigurationSetName: 'email',
      Destination: {
        ToAddresses: [destination]
      },
      Template: 'cancelActionReceiverEmail',
      TemplateData: `{\"id\": \"${id}\", \"rootUrl\": \"${rootUrl}\", \"sender\": \"${sender}\", \"destination\": \"${destination}\", \"transferAmount\": \"${transferAmount}\", \"cryptoSymbol\": \"${cryptoSymbol}\", \"cancelTimestamp\": \"${cancelTimestampStr}\", \"cancelTimestampParam\": \"${cancelTimestampParam}\"}`
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
      TemplateData: `{\"id\": \"${id}\", \"rootUrl\": \"${rootUrl}\", \"sender\": \"${sender}\", \"destination\": \"${destination}\", \"transferAmount\": \"${transferAmount}\", \"cryptoSymbol\": \"${cryptoSymbol}\"}`
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
      TemplateData: `{\"id\": \"${id}\", \"rootUrl\": \"${rootUrl}\", \"sender\": \"${sender}\", \"destination\": \"${destination}\", \"transferAmount\": \"${transferAmount}\", \"cryptoSymbol\": \"${cryptoSymbol}\"}`
    }
  },
  reminderActionReceiverEmailParams: function (id: string, sender: string, destination: string, transferAmount: string, cryptoType: string, sendTimestamp: number) {
    const cryptoSymbol = CRYPTO_SYMBOL[cryptoType]
    const sendTimestampStr = moment.unix(sendTimestamp).format('MMM Do YYYY, HH:mm:ss a')
    const { years, months, date, hours, minutes, seconds } = moment.unix(sendTimestamp).utc().toObject()
    const sendTimestampParam = `day=${date}&month=${months + 1}&year=${years}&hour=${hours}&min=${minutes}&sec=${seconds}`
    return {
      Source: EMAIL_SOURCE,
      ConfigurationSetName: 'email',
      Destination: {
        ToAddresses: [destination]
      },
      Template: 'reminderActionReceiverEmail',
      TemplateData: `{\"id\": \"${id}\", \"rootUrl\": \"${rootUrl}\", \"sender\": \"${sender}\", \"destination\": \"${destination}\", \"transferAmount\": \"${transferAmount}\", \"cryptoSymbol\": \"${cryptoSymbol}\", \"sendTimestamp\": \"${sendTimestampStr}\", \"sendTimestampParam\": \"${sendTimestampParam}\"}`
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
    sendTimestamp: string) {
    return Promise.all([
      ses.sendTemplatedEmail(this.sendActionSenderEmailParams(sendingId, sender, destination, transferAmount, cryptoType, sendTimestamp)).promise(),
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
    cryptoType: string,
    isFirstExpirationReminder: boolean) {
    if (isFirstExpirationReminder) {
      return Promise.all([
        ses.sendTemplatedEmail(this.expireActionSenderEmailParams(sendingId, sender, destination, transferAmount, cryptoType)).promise(),
        ses.sendTemplatedEmail(this.expireActionReceiverEmailParams(receivingId, sender, destination, transferAmount, cryptoType)).promise()
      ])
    } else {
      return Promise.all([
        ses.sendTemplatedEmail(this.expireActionSenderEmailParams(sendingId, sender, destination, transferAmount, cryptoType)).promise()
      ])
    }
  },
  receiverReminderAction: function (
    ses: Object,
    sendingId: string,
    receivingId: string,
    sender: string,
    destination: string,
    transferAmount: string,
    cryptoType: string,
    sendTxHash: string,
    sendTimestamp: string) {
    return Promise.all([
      ses.sendTemplatedEmail(this.reminderActionReceiverEmailParams(receivingId, sender, destination, transferAmount, cryptoType, sendTimestamp)).promise()
    ])
  }
}
