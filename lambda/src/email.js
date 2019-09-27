// @flow
import moment from 'moment'
import Config from './config'
import type {
  WalletLastUsedAddressType,
  WalletAddressDataType,
  TransferDataType,
  SendTransferParamsType,
  SendTransferReturnType,
  ReceiveTransferParamsType,
  ReceiveTransferReturnType,
  CancelTransferParamsType,
  CancelTransferReturnType
} from './transfer.flow'
import type {
  TransferDataEmailCompatibleType,
  TemplateType,
  SendTemplatedEmailReturnType
} from './email.flow'

var AWS = require('aws-sdk')
AWS.config.update({ region: 'us-east-1' })
var ses = new AWS.SES({ apiVersion: '2010-12-01' })
const EMAIL_SOURCE = 'notify@chainsfr.com'

const CRYPTO_SYMBOL = {
  ethereum: 'ETH',
  bitcoin: 'BTC',
  dai: 'DAI',
  libra: 'LIBRA'
}

if (!process.env.ENV_VALUE) throw new Error('ENV_VALUE missing')
const deploymentStage = process.env.ENV_VALUE.toLowerCase()
const expirationLength =
  Config.ExpirationLengthConfig[deploymentStage] || Config.ExpirationLengthConfig['default']
const rootUrl = Config.RootUrlConfig[deploymentStage] || Config.RootUrlConfig['default']

module.exports = {
  // ses utils
  getHumanReadbleTimestamp: function (timestamp: number): string {
    return moment.unix(timestamp).format('MMM Do YYYY, HH:mm:ss a')
  },
  getTimestampLinkParams: function (timestamp: number): string {
    const { years, months, date, hours, minutes, seconds } = moment
      .unix(timestamp)
      .utc()
      .toObject()
    return `day=${date}&month=${months +
      1}&year=${years}&hour=${hours}&min=${minutes}&sec=${seconds}`
  },
  toEmailCompatible: function (params: TransferDataType): TransferDataEmailCompatibleType {
    // must use spread, otherwise types are incompatiable due to object reference
    let paramsEmailCompatible: TransferDataEmailCompatibleType = { ...params }

    // set isDemo value
    paramsEmailCompatible.isDemo = true
    if (deploymentStage === 'prod') {
      paramsEmailCompatible.isDemo = false
    }
    // set messages
    if (!paramsEmailCompatible.sendMessage) {
      paramsEmailCompatible.sendMessage = ''
    }
    if (!paramsEmailCompatible.receiveMessage) {
      paramsEmailCompatible.receiveMessage = ''
    }
    if (!paramsEmailCompatible.cancelMessage) {
      paramsEmailCompatible.cancelMessage = ''
    }

    // set root url
    paramsEmailCompatible.rootUrl = rootUrl

    // set crypto symboll
    paramsEmailCompatible.cryptoSymbol = CRYPTO_SYMBOL[paramsEmailCompatible.cryptoType]

    // set expirePeriod value
    paramsEmailCompatible.expirePeriod = Math.floor(Number(expirationLength) / 86400).toString()

    // convert tx info
    if (params.senderToChainsfer) {
      const txData = params.senderToChainsfer
      paramsEmailCompatible.sendTxHash = txData.txHash
      paramsEmailCompatible.sendTimestampHumanReadable = this.getHumanReadbleTimestamp(
        txData.txTimestamp
      )
      paramsEmailCompatible.sendTimestampLinkParams = this.getHumanReadbleTimestamp(
        txData.txTimestamp
      )

      // set remainPeriod value
      const secondsPassed: number = moment().unix() - Number(params.senderToChainsfer.txTimestamp)
      paramsEmailCompatible.remainPeriod = Math.floor(
        Number(expirationLength) - secondsPassed
      ).toString()
    }
    if (params.chainsferToReceiver) {
      const txData = params.chainsferToReceiver
      paramsEmailCompatible.receiveTxHash = txData.txHash
      paramsEmailCompatible.receiveTimestampHumanReadable = this.getHumanReadbleTimestamp(
        txData.txTimestamp
      )
      paramsEmailCompatible.receiveTimestampLinkParams = this.getHumanReadbleTimestamp(
        txData.txTimestamp
      )
    }
    if (params.chainsferToSender) {
      const txData = params.chainsferToSender
      paramsEmailCompatible.cancelTxHash = txData.txHash
      paramsEmailCompatible.cancelTimestampHumanReadable = this.getHumanReadbleTimestamp(
        txData.txTimestamp
      )
      paramsEmailCompatible.cancelTimestampLinkParams = this.getHumanReadbleTimestamp(
        txData.txTimestamp
      )
    }

    return paramsEmailCompatible
  },
  getTemplate: function (
    toAddress: string,
    templateName: string,
    params: TransferDataEmailCompatibleType
  ): TemplateType {
    return {
      Source: EMAIL_SOURCE,
      ConfigurationSetName: 'email',
      Destination: {
        ToAddresses: [toAddress]
      },
      Template: params.isDemo ? templateName + 'Demo' : templateName,
      TemplateData: JSON.stringify(params)
    }
  },
  /*
   * core functions
   *
   * note that we pass complete transfer data to email templates, redundent properties do not
   * affect functions of the templates. This also simplifies the architecture.
   *
   * this file should be light-weight and should not be modified often
   */
  sendActionSenderEmailParams: function (params: TransferDataEmailCompatibleType): TemplateType {
    return this.getTemplate(params.sender, 'sendActionSenderEmail', params)
  },
  sendActionReceiverEmailParams: function (params: TransferDataEmailCompatibleType): TemplateType {
    return this.getTemplate(params.destination, 'sendActionReceiverEmail', params)
  },
  receiveActionSenderEmailParams: function (params: TransferDataEmailCompatibleType): TemplateType {
    return this.getTemplate(params.sender, 'receiveActionSenderEmail', params)
  },
  receiveActionReceiverEmailParams: function (
    params: TransferDataEmailCompatibleType
  ): TemplateType {
    return this.getTemplate(params.destination, 'receiveActionReceiverEmail', params)
  },
  cancelActionSenderEmailParams: function (params: TransferDataEmailCompatibleType): TemplateType {
    return this.getTemplate(params.sender, 'cancelActionSenderEmail', params)
  },
  reclaimActionSenderEmailParams: function (params: TransferDataEmailCompatibleType): TemplateType {
    return this.getTemplate(params.sender, 'reclaimActionSenderEmail', params)
  },
  cancelActionReceiverEmailParams: function (params: TransferDataEmailCompatibleType): TemplateType {
    return this.getTemplate(params.destination, 'cancelActionReceiverEmail', params)
  },
  expireActionSenderEmailParams: function (params: TransferDataEmailCompatibleType): TemplateType {
    return this.getTemplate(params.sender, 'expireActionSenderEmail', params)
  },
  expireActionReceiverEmailParams: function (params: TransferDataEmailCompatibleType): TemplateType {
    return this.getTemplate(params.destination, 'expireActionReceiverEmail', params)
  },
  reminderActionSenderEmailParams: function (params: TransferDataEmailCompatibleType): TemplateType {
    return this.getTemplate(params.destination, 'reminderActionSenderEmail', params)
  },
  reminderActionReceiverEmailParams: function (
    params: TransferDataEmailCompatibleType
  ): TemplateType {
    return this.getTemplate(params.destination, 'reminderActionReceiverEmail', params)
  },
  sendAction: function (params: TransferDataType): Promise<Array<SendTemplatedEmailReturnType>> {
    const paramsEmailCompatible: TransferDataEmailCompatibleType = this.toEmailCompatible(params)
    return Promise.all([
      ses.sendTemplatedEmail(this.sendActionSenderEmailParams(paramsEmailCompatible)).promise(),
      ses.sendTemplatedEmail(this.sendActionReceiverEmailParams(paramsEmailCompatible)).promise()
    ])
  },
  receiveAction: function (params: TransferDataType): Promise<Array<SendTemplatedEmailReturnType>> {
    const paramsEmailCompatible: TransferDataEmailCompatibleType = this.toEmailCompatible(params)
    return Promise.all([
      ses.sendTemplatedEmail(this.receiveActionSenderEmailParams(paramsEmailCompatible)).promise(),
      ses.sendTemplatedEmail(this.receiveActionReceiverEmailParams(paramsEmailCompatible)).promise()
    ])
  },
  cancelAction: function (params: TransferDataType): Promise<Array<SendTemplatedEmailReturnType>> {
    const paramsEmailCompatible: TransferDataEmailCompatibleType = this.toEmailCompatible(params)
    return Promise.all([
      ses.sendTemplatedEmail(this.cancelActionSenderEmailParams(paramsEmailCompatible)).promise(),
      ses.sendTemplatedEmail(this.cancelActionReceiverEmailParams(paramsEmailCompatible)).promise()
    ])
  },
  // send to sender when the expired transfer is reclaimed by the sender
  reclaimAction: function (params: TransferDataType): Promise<Array<SendTemplatedEmailReturnType>> {
    const paramsEmailCompatible: TransferDataEmailCompatibleType = this.toEmailCompatible(params)
    return Promise.all([
      ses.sendTemplatedEmail(this.reclaimActionSenderEmailParams(paramsEmailCompatible)).promise()
    ])
  },
  // only send once to both sender and receiver when the transfer is expired
  expireAction: function (params: TransferDataType): Promise<Array<SendTemplatedEmailReturnType>> {
    const paramsEmailCompatible: TransferDataEmailCompatibleType = this.toEmailCompatible(params)
    return Promise.all([
      ses.sendTemplatedEmail(this.expireActionSenderEmailParams(paramsEmailCompatible)).promise(),
      ses.sendTemplatedEmail(this.expireActionReceiverEmailParams(paramsEmailCompatible)).promise()
    ])
  },
  // sent to receiver before expiration
  receiverReminderAction: function (
    params: TransferDataType
  ): Promise<Array<SendTemplatedEmailReturnType>> {
    const paramsEmailCompatible: TransferDataEmailCompatibleType = this.toEmailCompatible(params)
    return Promise.all([
      ses
        .sendTemplatedEmail(this.reminderActionReceiverEmailParams(paramsEmailCompatible))
        .promise()
    ])
  },
  // sent to sender after expiration
  senderReminderAction: function (
    params: TransferDataType
  ): Promise<Array<SendTemplatedEmailReturnType>> {
    const paramsEmailCompatible: TransferDataEmailCompatibleType = this.toEmailCompatible(params)
    return Promise.all([
      ses.sendTemplatedEmail(this.reminderActionSenderEmailParams(paramsEmailCompatible)).promise()
    ])
  }
}
