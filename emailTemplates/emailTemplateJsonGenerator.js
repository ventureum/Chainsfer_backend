const fs = require('fs')
let sendActionSenderHtml = 'send_action_sender_notification.html'
let sendActionReceiverHtml = 'send_action_receiver_notification.html'
let senderHtmlStr = fs.readFileSync(sendActionSenderHtml, 'utf8')
let receiverHtmlStr = fs.readFileSync(sendActionReceiverHtml, 'utf8')

const senderOutput = {
  Template: {
    TemplateName: "sendActionSenderEmail",
    SubjectPart: "Chainsfer: {{transferAmount}} {{cryptoSymbol}} has been sent to {{destination}}",
    HtmlPart: senderHtmlStr
  }
}

const receiverOutput = {
  Template: {
    TemplateName: "sendActionReceiverEmail",
    SubjectPart: "Chainsfer: {{sender}} sent you {{transferAmount}} {{cryptoSymbol}}",
    HtmlPart: receiverHtmlStr
  }
}

fs.writeFile('sendActionSenderEmail.json', JSON.stringify(senderOutput, null, 2), 'utf8', () => { console.log('sendActionSenderEmail done') })
fs.writeFile('sendActionReceiverEmail.json', JSON.stringify(receiverOutput, null, 2), 'utf8', () => { console.log('sendActionReceiverEmail done') })
