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
  receiveActionSenderEmailParams: function (id, sender, destination, transferAmount, cryptoType) {
    return {
      Source: EMAIL_SOURCE,
      Destination: {
        ToAddresses: [sender]
      },
      Message: {
        Body: {
          Html: {
            Charset: 'UTF-8',
            Data: `To view details of this transfer, click <a class="ulink" href="http://localhost:3000/send?id=${id}" target="_blank">here</a>.`
          }
        },
        Subject: {
          Charset: 'UTF-8',
          Data: `Chainsfer: ${destination} accepted your transfer of ${transferAmount} ${CRYPTO_SYMBOL[cryptoType]}`
        }
      }
    }
  },
  receiveActionReceiverEmailParams: function (id, sender, destination, transferAmount, cryptoType) {
    return {
      Source: EMAIL_SOURCE,
      Destination: {
        ToAddresses: [destination]
      },
      Message: {
        Body: {
          Html: {
            Charset: 'UTF-8',
            Data: `To view details of this transfer, click <a class="ulink" href="http://localhost:3000/receive?id=${id}" target="_blank">here</a>.`
          }
        },
        Subject: {
          Charset: 'UTF-8',
          Data: `Chainsfer: Transfer of ${transferAmount} ${CRYPTO_SYMBOL[cryptoType]} from ${sender} accepted`
        }
      }
    }
  },
  cancelActionSenderEmailParams: function (id, sender, destination, transferAmount, cryptoType) {
    return {
      Source: EMAIL_SOURCE,
      Destination: {
        ToAddresses: [sender]
      },
      Message: {
        Body: {
          Html: {
            Charset: 'UTF-8',
            Data: `To view details of this transfer, click <a class="ulink" href="http://localhost:3000/send?id=${id}" target="_blank">here</a>.`
          }
        },
        Subject: {
          Charset: 'UTF-8',
          Data: `Chainsfer: Transfer of ${transferAmount} ${CRYPTO_SYMBOL[cryptoType]} to ${destination} cancelled`
        }
      }
    }
  },
  cancelActionReceiverEmailParams: function (id, sender, destination, transferAmount, cryptoType) {
    return {
      Source: EMAIL_SOURCE,
      Destination: {
        ToAddresses: [destination]
      },
      Message: {
        Body: {
          Html: {
            Charset: 'UTF-8',
            Data: `To view details of this transfer, click <a class="ulink" href="http://localhost:3000/receive?id=${id}" target="_blank">here</a>.`
          }
        },
        Subject: {
          Charset: 'UTF-8',
          Data: `Chainsfer: Transfer of ${transferAmount} ${CRYPTO_SYMBOL[cryptoType]} from ${sender} cancelled`
        }
      }
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
      ses.sendEmail(this.receiveActionSenderEmailParams(sendingId, sender, destination, transferAmount, cryptoType)).promise(),
      ses.sendEmail(this.receiveActionReceiverEmailParams(receivingId, sender, destination, transferAmount, cryptoType)).promise()
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
      ses.sendEmail(this.cancelActionSenderEmailParams(sendingId, sender, destination, transferAmount, cryptoType)).promise(),
      ses.sendEmail(this.cancelActionReceiverEmailParams(receivingId, sender, destination, transferAmount, cryptoType)).promise()
    ])
  }
}
