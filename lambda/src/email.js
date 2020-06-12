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
  SendTemplatedEmailReturnType,
  EmailActionRecordType
} from './email.flow'

var AWS = require('aws-sdk')
AWS.config.update({ region: 'us-east-1' })
var ses = new AWS.SES({ apiVersion: '2010-12-01' })
const EMAIL_SOURCE = 'notify@chainsfr.com'
const documentClient = new AWS.DynamoDB.DocumentClient()

const CRYPTO_SYMBOL = {
  ethereum: 'ETH',
  bitcoin: 'BTC'
}

// add erc20 token symbols
for (let [key, value] of Object.entries(Config.ERC20Tokens)) {
  // $FlowFixMe
  CRYPTO_SYMBOL[key] = value.symbol
}

if (!process.env.ENV_VALUE) throw new Error('ENV_VALUE missing')
const deploymentStage = process.env.ENV_VALUE.toLowerCase()
const expirationLength =
  Config.ExpirationLengthConfig[deploymentStage] || Config.ExpirationLengthConfig['default']
const rootUrl = Config.RootUrlConfig[deploymentStage] || Config.RootUrlConfig['default']

if (!process.env.EMAIL_RECORDS_TABLE_NAME) throw new Error('EMAIL_RECORDS_TABLE_NAME missing')
const emailRecordsTableName = process.env.EMAIL_RECORDS_TABLE_NAME
if (!process.env.SES_CONFIG_SET_NAME) throw new Error('SES_CONFIG_SET_NAME missing')
const sesConfigSetName = process.env.SES_CONFIG_SET_NAME

module.exports = {
  // ses utils
  getHumanReadbleTimestamp: function (timestamp: number): string {
    return moment.unix(timestamp).format('MMM Do YYYY, HH:mm:ss a')
  },
  getTimestampLinkParams: function (timestamp: number): string {
    const { years, months, date, hours, minutes, seconds } = moment.unix(timestamp).utc().toObject()
    return `day=${date}&month=${
      months + 1
    }&year=${years}&hour=${hours}&min=${minutes}&sec=${seconds}`
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
      const secondsPassed: number = moment().unix() - params.senderToChainsfer.txTimestamp
      paramsEmailCompatible.remainPeriod = Math.floor(
        Math.max(0, Number(expirationLength) - secondsPassed) / 86400
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
      ConfigurationSetName: sesConfigSetName,
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
  cancelActionReceiverEmailParams: function (
    params: TransferDataEmailCompatibleType
  ): TemplateType {
    return this.getTemplate(params.destination, 'cancelActionReceiverEmail', params)
  },
  expireActionSenderEmailParams: function (params: TransferDataEmailCompatibleType): TemplateType {
    return this.getTemplate(params.sender, 'expireActionSenderEmail', params)
  },
  expireActionReceiverEmailParams: function (
    params: TransferDataEmailCompatibleType
  ): TemplateType {
    return this.getTemplate(params.destination, 'expireActionReceiverEmail', params)
  },
  reminderActionSenderEmailParams: function (
    params: TransferDataEmailCompatibleType
  ): TemplateType {
    return this.getTemplate(params.destination, 'reminderActionSenderEmail', params)
  },
  reminderActionReceiverEmailParams: function (
    params: TransferDataEmailCompatibleType
  ): TemplateType {
    return this.getTemplate(params.destination, 'reminderActionReceiverEmail', params)
  },
  emailErrorSenderEmailParams: function (params: TransferDataEmailCompatibleType): TemplateType {
    return this.getTemplate(params.sender, 'wrongActionSenderEmail', params)
  },
  sendAction: async function (
    params: TransferDataType
  ): Promise<Array<SendTemplatedEmailReturnType>> {
    const paramsEmailCompatible: TransferDataEmailCompatibleType = this.toEmailCompatible(params)
    const messageIds: Array<SendTemplatedEmailReturnType> = await Promise.all([
      ses.sendTemplatedEmail(this.sendActionSenderEmailParams(paramsEmailCompatible)).promise(),
      ses.sendTemplatedEmail(this.sendActionReceiverEmailParams(paramsEmailCompatible)).promise()
    ])
    await Promise.all(
      messageIds.map(async (item: SendTemplatedEmailReturnType): Promise<Array<EmailActionRecordType>> => {
        const { MessageId } = item
        return this.saveEmailActionRecord(MessageId, paramsEmailCompatible.transferId)
      })
    )
    return messageIds
  },
  receiveAction: async function (
    params: TransferDataType
  ): Promise<Array<SendTemplatedEmailReturnType>> {
    const paramsEmailCompatible: TransferDataEmailCompatibleType = this.toEmailCompatible(params)
    const messageIds: Array<SendTemplatedEmailReturnType> = await Promise.all([
      ses.sendTemplatedEmail(this.receiveActionSenderEmailParams(paramsEmailCompatible)).promise(),
      ses.sendTemplatedEmail(this.receiveActionReceiverEmailParams(paramsEmailCompatible)).promise()
    ])
    await Promise.all(
      messageIds.map(async (item: SendTemplatedEmailReturnType): Promise<Array<EmailActionRecordType>> => {
        const { MessageId } = item
        return this.saveEmailActionRecord(MessageId, paramsEmailCompatible.transferId)
      })
    )
    return messageIds
  },
  cancelAction: async function (
    params: TransferDataType
  ): Promise<Array<SendTemplatedEmailReturnType>> {
    const paramsEmailCompatible: TransferDataEmailCompatibleType = this.toEmailCompatible(params)
    let emailQueue = [
      ses.sendTemplatedEmail(this.cancelActionSenderEmailParams(paramsEmailCompatible)).promise()
    ]
    if (!params.expired) {
      // send cancel email to receiver only before expiration
      emailQueue.push(
        ses
          .sendTemplatedEmail(this.cancelActionReceiverEmailParams(paramsEmailCompatible))
          .promise()
      )
    }

    const messageIds: Array<SendTemplatedEmailReturnType> = await Promise.all(emailQueue)
    await Promise.all(
      messageIds.map(async (item: SendTemplatedEmailReturnType): Promise<Array<EmailActionRecordType>> => {
        const { MessageId } = item
        return this.saveEmailActionRecord(MessageId, paramsEmailCompatible.transferId)
      })
    )

    return messageIds
  },
  // send to sender when the expired transfer is reclaimed by the sender
  reclaimAction: async function (
    params: TransferDataType
  ): Promise<Array<SendTemplatedEmailReturnType>> {
    const paramsEmailCompatible: TransferDataEmailCompatibleType = this.toEmailCompatible(params)

    const messageIds: Array<SendTemplatedEmailReturnType> = await Promise.all([
      ses.sendTemplatedEmail(this.reclaimActionSenderEmailParams(paramsEmailCompatible)).promise()
    ])
    await Promise.all(
      messageIds.map(async (item: SendTemplatedEmailReturnType): Promise<Array<EmailActionRecordType>> => {
        const { MessageId } = item
        return this.saveEmailActionRecord(MessageId, paramsEmailCompatible.transferId)
      })
    )
    return messageIds
  },
  // only send once to both sender and receiver when the transfer is expired
  expireAction: async function (
    params: TransferDataType
  ): Promise<Array<SendTemplatedEmailReturnType>> {
    const paramsEmailCompatible: TransferDataEmailCompatibleType = this.toEmailCompatible(params)
    const messageIds: Array<SendTemplatedEmailReturnType> = await Promise.all([
      ses.sendTemplatedEmail(this.expireActionSenderEmailParams(paramsEmailCompatible)).promise(),
      ses.sendTemplatedEmail(this.expireActionReceiverEmailParams(paramsEmailCompatible)).promise()
    ])
    await Promise.all(
      messageIds.map(async (item: SendTemplatedEmailReturnType): Promise<Array<EmailActionRecordType>> => {
        const { MessageId } = item
        return this.saveEmailActionRecord(MessageId, paramsEmailCompatible.transferId)
      })
    )
    return messageIds
  },
  // sent to receiver before expiration
  receiverReminderAction: async function (
    params: TransferDataType
  ): Promise<Array<SendTemplatedEmailReturnType>> {
    const paramsEmailCompatible: TransferDataEmailCompatibleType = this.toEmailCompatible(params)
    const messageIds: Array<SendTemplatedEmailReturnType> = await Promise.all([
      ses
        .sendTemplatedEmail(this.reminderActionReceiverEmailParams(paramsEmailCompatible))
        .promise()
    ])
    await Promise.all(
      messageIds.map(async (item: SendTemplatedEmailReturnType): Promise<Array<EmailActionRecordType>> => {
        const { MessageId } = item
        return this.saveEmailActionRecord(MessageId, paramsEmailCompatible.transferId)
      })
    )
    return messageIds
  },
  // sent to sender after expiration
  senderReminderAction: async function (
    params: TransferDataType
  ): Promise<Array<SendTemplatedEmailReturnType>> {
    const paramsEmailCompatible: TransferDataEmailCompatibleType = this.toEmailCompatible(params)
    const messageIds: Array<SendTemplatedEmailReturnType> = await Promise.all([
      ses.sendTemplatedEmail(this.reminderActionSenderEmailParams(paramsEmailCompatible)).promise()
    ])
    await Promise.all(
      messageIds.map(async (item: SendTemplatedEmailReturnType): Promise<Array<EmailActionRecordType>> => {
        const { MessageId } = item
        return this.saveEmailActionRecord(MessageId, paramsEmailCompatible.transferId)
      })
    )
    return messageIds
  },
  // send to sender after email error
  emailErrorAction: async function (
    params: TransferDataType
  ): Promise<Array<SendTemplatedEmailReturnType>> {
    const paramsEmailCompatible: TransferDataEmailCompatibleType = this.toEmailCompatible(params)
    const messageIds: Array<SendTemplatedEmailReturnType> = await Promise.all([
      ses.sendTemplatedEmail(this.emailErrorSenderEmailParams(paramsEmailCompatible)).promise()
    ])
    await Promise.all(
      messageIds.map(async (item: SendTemplatedEmailReturnType): Promise<Array<EmailActionRecordType>> => {
        const { MessageId } = item
        return this.saveEmailActionRecord(MessageId, paramsEmailCompatible.transferId)
      })
    )
    return messageIds
  },
  saveEmailActionRecord: async function (
    messageId: string,
    transferId: string
  ): Promise<EmailActionRecordType> {
    const newRecord = {
      messageId: messageId,
      transferId: transferId
    }
    await documentClient
      .put({
        TableName: emailRecordsTableName,
        Item: newRecord
      })
      .promise()
    return {
      messageId: messageId,
      transferId: transferId
    }
  },
  getEmailActionRecord: async function (messageId: string): Promise<EmailActionRecordType> {
    const params = {
      TableName: emailRecordsTableName,
      Key: {
        messageId: messageId
      }
    }

    const { Item } = await documentClient.get(params).promise()
    return {
      messageId: Item.messageId,
      transferId: Item.transferId
    }
  }
}
