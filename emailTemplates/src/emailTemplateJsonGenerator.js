/*
 *  Upload email templates to AWS SES
 *
 * Create an AWS credentials at ~/.aws/credentials
 * [default]
 * aws_access_key_id = <YOUR_ACCESS_KEY_ID>
 * aws_secret_access_key = <YOUR_SECRET_ACCESS_KEY>
 *
 * Usage: npm run upload
 */

// Load the SDK for JavaScript
var AWS = require('aws-sdk')

// Set the region
AWS.config.update({ region: 'us-east-1' })

const path = require('path')
const fs = require('fs')

let templatesDir = path.resolve(__dirname, '../emailTemplates/templates')

const EMAIL_META = [
  {
    filename: 'send_action_sender_notification.html',
    name: 'sendActionSenderEmail',
    subject: 'Chainsfr: Your transfer of {{transferAmount}} {{cryptoSymbol}} has been sent to {{receiverName}}'
  },
  {
    filename: 'send_action_receiver_notification.html',
    name: 'sendActionReceiverEmail',
    subject: 'Chainsfr: {{senderName}} sent you a transfer of {{transferAmount}} {{cryptoSymbol}}'
  },
  {
    filename: 'receive_action_sender_notification.html',
    name: 'receiveActionSenderEmail',
    subject:
      'Chainsfr: {{receiverName}} accepted your transfer of {{transferAmount}} {{cryptoSymbol}}'
  },
  {
    filename: 'receive_action_receiver_notification.html',
    name: 'receiveActionReceiverEmail',
    subject:
      'Chainsfr: The transfer of {{transferAmount}} {{cryptoSymbol}} from {{senderName}} has been deposited'
  },
  {
    filename: 'cancel_action_sender_notification.html',
    name: 'cancelActionSenderEmail',
    subject:
      'Chainsfr: The transfer of {{transferAmount}} {{cryptoSymbol}} to {{receiverName}} has been cancelled'
  },
  {
    filename: 'reclaim_action_sender_notification.html',
    name: 'reclaimActionSenderEmail',
    subject:
      'Chainsfr: The expired transfer of {{transferAmount}} {{cryptoSymbol}} to {{receiverName}} has been reclaimed'
  },
  {
    filename: 'cancel_action_receiver_notification.html',
    name: 'cancelActionReceiverEmail',
    subject:
      'Chainsfr: The transfer of {{transferAmount}} {{cryptoSymbol}} from {{senderName}} has been cancelled'
  },
  {
    filename: 'expire_action_sender_notification.html',
    name: 'expireActionSenderEmail',
    subject:
      'Chainsfr: The transfer of {{transferAmount}} {{cryptoSymbol}} to {{receiverName}} has expired'
  },
  {
    filename: 'expire_action_receiver_notification.html',
    name: 'expireActionReceiverEmail',
    subject:
      'Chainsfr: The transfer of {{transferAmount}} {{cryptoSymbol}} from {{senderName}} has expired'
  },
  {
    filename: 'reminder_action_receiver_notification.html',
    name: 'reminderActionReceiverEmail',
    subject:
      'Chainsfr: Remember to deposit the transfer of {{transferAmount}} {{cryptoSymbol}} from {{senderName}}'
  },
  {
    filename: 'reminder_action_sender_notification.html',
    name: 'reminderActionSenderEmail',
    subject:
      'Chainsfr: Remember to reclaim your transfer of {{transferAmount}} {{cryptoSymbol}} to {{receiverName}}'
  },
  {
    filename: 'wrong_action_sender_notification.html',
    name: 'wrongActionSenderEmail',
    subject:
      'Chainsfr: Your transfer of {{transferAmount}} {{cryptoSymbol}} to {{receiverName}} is NOT successful'
  },
  {
    filename: 'remind_wrong_action_sender_notification.html',
    name: 'remindWrongActionSenderEmail',
    subject:
      'Chainsfr: Remember to cancel the unsuccessful transfer of {{transferAmount}} {{cryptoSymbol}} to {{receiverName}}'
  }
]

async function main () {
  let listTemplatesPromise = new AWS.SES({ apiVersion: '2010-12-01' }).listTemplates().promise()
  console.log('Existing templates: ', await listTemplatesPromise)

  var templates = []
  for (let meta of EMAIL_META) {
    // prod
    templates.push({ Template: {
      TemplateName: meta.name,
      SubjectPart: meta.subject,
      HtmlPart: fs.readFileSync(`${templatesDir}/prod/${meta.filename}`, 'utf8')
    }})
    // demo
    templates.push({ Template: {
      TemplateName: meta.name + 'Demo',
      SubjectPart: meta.subject,
      HtmlPart: fs.readFileSync(`${templatesDir}/demo/${meta.filename}`, 'utf8')
    }})
  }

  for (let _template of templates) {
    // Create the promise and SES service object
    let createTemplatePromise = new AWS.SES({ apiVersion: '2010-12-01' })
      .createTemplate(_template)
      .promise()
    try {
      let rv = await createTemplatePromise
      console.log(`Created ${_template.Template.TemplateName}`, rv)
    } catch (error) {
      if (error.code === 'AlreadyExists') {
        // template exist, update template
        let updateTemplatePromise = new AWS.SES({ apiVersion: '2010-12-01' })
          .updateTemplate(_template)
          .promise()

        let rv = await updateTemplatePromise
        console.log(`Updated ${_template.Template.TemplateName}`, rv)
      } else {
        console.log(error)
      }
    }
  }
}

main()
