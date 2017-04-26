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

      // console.log("Successfully sent generic message with id %s to recipient %s",
      //   messageId, recipientId);
    } else {
      //console.error("Unable to send message.");
      //console.error(response);
      //console.error(error);
    }
  });
}

module.exports.sendTextMessage = sendTextMessage;

// placeholder for advanced messages. See facebook messenger documentation for the
// rest of the code
var sendGenericMessage = (senderId, messageText) => {
  // To be expanded in later sections
}

module.exports.sendGenericMessage = sendGenericMessage;