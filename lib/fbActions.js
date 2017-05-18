let request = require('request');

//------------FACEBOOK PARAMETERS------------
const facebookAccessToken = process.env.TEST_BOT_PAGE_ACCESS_TOKEN;

// answer webhook validation requests from facebook
function validateWebhook(req,res) {
  if (req.query['hub.mode'] === 'subscribe' &&
      req.query['hub.verify_token'] === 'token_works') {
    console.log("Validating webhook");
    res.status(200).send(req.query['hub.challenge']);
  } else {
    console.error("Failed validation. Make sure the validation tokens match.");
    res.sendStatus(403);
  }
}


// send a text message to the given recipient
function sendTextMessage(recipientID, messageText) {
  responseBuilder = messageText;

  callSendAPI({
    recipient: {
      id: recipientID
    },
    message: {
      text: responseBuilder
    }
  });
}


//use the facebook api list template to send a message based on the given payload
function sendTemplateMessage(recipientID, messageElements, type) {
  if (!(type === 'list' || type === 'generic')) {
    let errorMessage = 'ERROR :: type must be of type "list" or "generic"';
    console.log(errorMessage);
    return Error(errorMessage);
  }

  callSendAPI({
    recipient : {
      id : recipientID
    },
    message : {
      attachment : {
        type : 'template',
        payload : {
          template_type : type,
          elements : messageElements
        }
      }
    }
  });
}

// send a button message to the given user
function sendButtonMessage(recipientID, messageText, buttonList) {
  //TODO tests
  callSendAPI({
    recipient : {
      id : recipientID
    },
    message : {
      attachment : {
        type : 'template',
        payload : {
          template_type : 'button',
          text : messageText,
          buttons : buttonList
        }
      }
    }
  });
}

//facebook send message function
function callSendAPI(messageData) {
  request({
    uri: 'https://graph.facebook.com/v2.6/me/messages',
    qs: { access_token: facebookAccessToken },
    method: 'POST',
    json: messageData

  }, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      let recipientId = body.recipient_id;
      let messageId = body.message_id;
    } else {
      console.error("Unable to send message.");
      console.error(response);
      console.error(error);
    }
  });
}


module.exports = {
  sendButtonMessage,
  validateWebhook,
  sendTemplateMessage,
  sendTextMessage
}