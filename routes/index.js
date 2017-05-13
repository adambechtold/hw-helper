
const express = require('express');
const request = require('request');
const algoliasearch = require('algoliasearch');
let router = express.Router();
const defaults = require('../data/defaults');

//--------------ALGOLIA PARAMETERS-------------
let algoActions = require('../lib/algoliaActions');

//--------------WIT.AI PARAMETERS--------------
const {Wit, log} = require('node-wit');
const witEndpoint = "https://api.wit.ai/message?v=20170424&q=";
const witAccessToken = process.env.WIT_ACCESS_TOKEN;
const witActions = require('../lib/witActions');

//------------FACEBOOK PARAMETERS------------
let fbActions = require('../lib/fbActions');

//------------HELPER FUCNTIONS---------------
var helperActions = require('../lib/helperActions');

// This will contain all user sessions.
// Each session has an entry:
// sessionId -> {fbid: facebookUserId, context: sessionState}
let {sessions, findOrCreateSession, deleteSession} = require('../lib/sessions.js');
// ALFRED: this is the variable i want to use in other files

//=========================================================

// handle new events to the webhook
router.post('/webhook', function (req, res) {
  let data = req.body;

  // Make sure this is a page subscription
  if (data.object === 'page') {

    // Iterate over each entry - there may be multiple if batched
    data.entry.forEach(function(entry) {
      let pageID = entry.id;
      let timeOfEvent = entry.time;

      // Iterate over each messaging event
      entry.messaging.forEach(function(event) {
        if (event.message) {
          receivedMessage(event);
        } else if (event.delivery) {
           console.log('Message delivered to id: ', event.sender.id);
        } else if (event.postback) {
          receivedPostback(event);
        } else if (event.read) {
           //user read your message. do nothing
        } else {
          console.log("Webhook received unknown event: ", event);
        }
      });
    });

    // Assume all went well.
    //
    // You must send back a 200, within 20 seconds, to let us know
    // you've successfully received the callback. Otherwise, the request
    // will time out and we will keep trying to resend.
    res.sendStatus(200);
  }
});


// create our wit object
const wit = new Wit({
  accessToken: witAccessToken,
  actions : witActions.actions,
  logger: new log.Logger(log.INFO)
});

// handle new events to the webhook
router.post('/webhook', function (req, res) {
  var data = req.body;

  // Make sure this is a page subscription
  if (data.object === 'page') {

    // Iterate over each entry - there may be multiple if batched
    data.entry.forEach(function(entry) {
      var pageID = entry.id;
      var timeOfEvent = entry.time;

      // Iterate over each messaging event
      entry.messaging.forEach(function(event) {
        if (event.message) {
          receivedMessage(event);
        } else if (event.delivery) {
           console.log('Message delivered to id: ', event.sender.id);
        } else if (event.postback) {
          receivedPostback(event);
        } else if (event.read) {
           //user read your message. do nothing
        } else {
          console.log("Webhook received unknown event: ", event);
        }
      });
    });

    // Assume all went well.
    res.sendStatus(200);
  }
});


// handle incoming facebook messages
function receivedMessage(event) {
  let senderId = event.sender.id;
  let recipientId = event.recipient.id;
  let timeOfMessage = event.timestamp;
  let message = event.message;

  console.log("Received message for user %d and page %d at %d with message:",
    senderId, recipientId, timeOfMessage);
  console.log(JSON.stringify(message));

  let messageId = message.mid;

  let messageText = message.text;
  let messageAttachments = message.attachments;

  if (messageText && !message.is_echo) {
    console.log("Received message for user %d and page %d at %d with message:",
    senderId, recipientId, timeOfMessage);
    console.log(JSON.stringify(message));
    // If we receive a text message, check to see if it matches a keyword
    // and send back the example. Otherwise, just echo the text we received.
    processMessage(senderId, messageText);

  } else if (messageAttachments && !message.is_echo) {
    // sendTextMessage(senderId, "Message with attachment received");
    console.log('this thing has attachments');
    sendTextMessage(senderId, 'Sorry, I can only process text messages right now');
  }
}

//handle messages before sending them off to be sent
function processMessage(senderId, messageText) {
  let responseBuilder = messageText;

  let sessionId = findOrCreateSession(senderId);

  // how did wit thing about this message?
  wit.message(messageText, {})
    .then((data) => {
      console.log('Yay, got Wit.ai response: ' + JSON.stringify(data));
    })
    .catch(console.error);

  wit.runActions (
    sessionId, //the user's current session
    messageText, // user's message
    sessions[sessionId].context
    ).then((context) => {
      // bot has completed all its actions

      deleteSession(sessionId);

      //update the user's current session state
      //sessions[sessionId].context = context;
    })
    .catch((err) => {
      console.log(sessionId);
      console.log(witAccessToken);
      console.error('Houston, we have a probelm with Wit: ', err.stack || err);
    });
}

//handle postbacks from messenger
function receivedPostback(event) {
  let senderID = event.sender.id;
  let recipientId = event.recipient.id;
  let timestamp = event.timestamp;
  let payload = event.postback.payload;

  console.log('Received postback for user %d and page %d at %d with payload:',
    senderID, recipientId, timestamp);
  console.log(payload);

  let sessionId = findOrCreateSession(senderID);

  payload = JSON.parse(payload);
  let payloadType = payload.type;

  //send 'quickReply' messages from buttons to wit for interpretation. i.e. treat them
  // as a normal user message
  if (payloadType === 'quickReply') {
    let userMessage = payload.message;

    //convert the postback event to a message event
    delete event.payload;
    event.message = {
      messageid : null,
      text : userMessage
    }

    receivedMessage(event);
  }

  else if (payloadType === 'classSignup') {
    //this is a message to signup the current user to a certain class
    let school = payload.school;
    let classID = payload.classID;
    // get the user info for the the current user

    let index = algoClient.initIndex('test_CLASSES');

    //complete a partial update of the class to add the user's userID if they are 
    //  not already signed up for that class
    index.partialUpdateObject({
      studentList: {
        value: payload.userID,
        _operation: 'AddUnique'
      },
      objectID: payload.classObjectID
    }).then((content) => {
      //send confirmation message
      fbActions.sendTextMessage(senderID, "You're all signed up for " + classID + '!');
    }).catch((err) => {
      //send failure message
      fbActions.sendTextMessage(senderID, 'Looks like that class is full...');
      console.log('recievedPostback ERROR :: partial update :: ', err);
    });
  }
}


//============HANDLE SOME BASIC REQUESTS================

//webhook token verifier from Facebook
router.get('/webhook/', function(req, res) {
  fbActions.validateWebhook(req,res);
});

//webhook token verifier from Facebook
router.get('/webhook/', function(req, res) {
  fbActions.validateWebhook(req,res);
});

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'ScChatty the chatbot!' });
});

module.exports = router;