var request = require('request');

//------------FACEBOOK PARAMETERS------------
const facebookAccessToken = process.env.TEST_BOT_PAGE_ACCESS_TOKEN;

// answer webhook validation requests from facebook
var validateWebhook = (req,res) => {
  if (req.query['hub.mode'] === 'subscribe' &&
      req.query['hub.verify_token'] === 'token_works') {
    console.log("Validating webhook");
    res.status(200).send(req.query['hub.challenge']);
  } else {
    console.error("Failed validation. Make sure the validation tokens match.");
    res.sendStatus(403);
  }
}

module.exports.validateWebhook = validateWebhook;

// functions to send stuff
var sendTextMessage = (recipientId, messageText) => {

  responseBuilder = messageText;

  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: responseBuilder
    }
  };

  callSendAPI(messageData);
}

module.exports.sendTextMessage = sendTextMessage;


//send an advanced message with attachments to facebook
let sendGenericMessage = (recipientId, messagePayload) => {
  console.log('=-=-=-=-=-=-=-=-==- SEND ATTACHMENTS');
  let messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: 'template',
        payload: {
          template_type: 'generic',
          elements: messagePayload
        }
      }
    }
  };

  callSendAPI(messageData);
}

module.exports.sendGenericMessage = sendGenericMessage;

//facebook send message function
function callSendAPI(messageData) {
  request({
    uri: 'https://graph.facebook.com/v2.6/me/messages',
    qs: { access_token: facebookAccessToken },
    method: 'POST',
    json: messageData

  }, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      var recipientId = body.recipient_id;
      var messageId = body.message_id;

      console.log("Successfully sent message with id %s to recipient %s",
        messageId, recipientId);
    } else {
      console.error("Unable to send message.");
      console.error(response);
      console.error(error);
    }
  });
}