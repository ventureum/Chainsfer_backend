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
var AWS = require("aws-sdk");

// Set the region
AWS.config.update({ region: "us-east-1" });

const fs = require("fs");
let sendActionSenderHtml = "./templates/send_action_sender_notification.html";
let sendActionReceiverHtml =
  "./templates/send_action_receiver_notification.html";

let receiveActionSenderHtml =
  "./templates/receive_action_sender_notification.html";
let receiveActionReceiverHtml =
  "./templates/receive_action_receiver_notification.html";

let cancelActionSenderHtml =
  "./templates/cancel_action_sender_notification.html";
let cancelActionReceiverHtml =
  "./templates/cancel_action_receiver_notification.html";

let sendActionSenderStr = fs.readFileSync(sendActionSenderHtml, "utf8");
let sendActionReceiverStr = fs.readFileSync(sendActionReceiverHtml, "utf8");

let receiveActionSenderStr = fs.readFileSync(receiveActionSenderHtml, "utf8");
let receiveActionReceiverStr = fs.readFileSync(receiveActionReceiverHtml, "utf8");

let cancelActionSenderStr = fs.readFileSync(cancelActionSenderHtml, "utf8");
let cancelActionReceiverStr = fs.readFileSync(cancelActionReceiverHtml, "utf8");

const sendActionSenderEmail = {
  Template: {
    TemplateName: "sendActionSenderEmail",
    SubjectPart:
      "Chainsfer: {{transferAmount}} {{cryptoSymbol}} has been sent to {{destination}}",
    HtmlPart: sendActionSenderStr
  }
};

const sendActionReceiverEmail = {
  Template: {
    TemplateName: "sendActionReceiverEmail",
    SubjectPart:
      "Chainsfer: {{sender}} sent you {{transferAmount}} {{cryptoSymbol}}",
    HtmlPart: sendActionReceiverStr
  }
};

const receiveActionSenderEmail = {
  Template: {
    TemplateName: "receiveActionSenderEmail",
    SubjectPart:
      "Chainsfer: {{destination}} accepted your transfer of {{transferAmount}} {{cryptoSymbol}}",
    HtmlPart: receiveActionSenderStr
  }
};

const receiveActionReceiverEmail = {
  Template: {
    TemplateName: "receiveActionReceiverEmail",
    SubjectPart:
      "Chainsfer: A transfer of {{transferAmount}} {{cryptoSymbol}} from {{sender}} has been deposited",
    HtmlPart: receiveActionReceiverStr
  }
};

const cancelActionSenderEmail = {
  Template: {
    TemplateName: "cancelActionSenderEmail",
    SubjectPart:
      "Chainsfer: The transfer of {{transferAmount}} {{cryptoSymbol}} to {{destination}} has been cancelled",
    HtmlPart: cancelActionSenderStr
  }
};

const cancelActionReceiverEmail = {
  Template: {
    TemplateName: "cancelActionReceiverEmail",
    SubjectPart:
      "Chainsfer: The transfer of {{transferAmount}} {{cryptoSymbol}} from {{sender}} has been cancelled",
    HtmlPart: cancelActionReceiverStr
  }
};

var templates = [
  sendActionSenderEmail,
  sendActionReceiverEmail,
  receiveActionSenderEmail,
  receiveActionReceiverEmail,
  cancelActionSenderEmail,
  cancelActionReceiverEmail
];

async function main() {
  let listTemplatesPromise = new AWS.SES({ apiVersion: "2010-12-01" })
      .listTemplates()
      .promise();
  console.log('Existing templates: ', await listTemplatesPromise)

  for (let _template of templates) {
    // Create the promise and SES service object
    let createTemplatePromise = new AWS.SES({ apiVersion: "2010-12-01" })
      .createTemplate(_template)
      .promise();
    try {
      let rv = await createTemplatePromise;
      console.log(`Created ${_template.Template.TemplateName}`, rv);
    } catch (error) {
      if (error.code === "AlreadyExists") {
        // template exist, update template
        let updateTemplatePromise = new AWS.SES({ apiVersion: "2010-12-01" })
          .updateTemplate(_template)
          .promise();

        let rv = await updateTemplatePromise;
        console.log(`Updated ${_template.Template.TemplateName}`, rv);
      }
    }
  }
}

main();
