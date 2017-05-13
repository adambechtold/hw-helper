
//-------------SESSION HANDLING---------------------
let {sessions, findOrCreateSession, deleteSession} = require('../lib/sessions.js');

//------------FACEBOOK PARAMETERS-------------------
let fbActions = require('../lib/fbActions');

//--------------ALGOLIA PARAMETERS-----------------
let {algoClient} = require('../lib/algoliaActions');

//--------------WIT.AI PARAMETERS------------------
const {Wit, log} = require('node-wit');
const witEndpoint = "https://api.wit.ai/message?v=20170424&q=";
const witAccessToken = process.env.WIT_ACCESS_TOKEN;
const witActions = require('../lib/witActions');

// create our wit object
const wit = new Wit({
  accessToken: witAccessToken,
  actions : witActions.actions,
  logger: new log.Logger(log.INFO)
});

//----------MESSAGE PROCESSING FUNCTIONS-----------
// handle incoming facebook messages
function receivedMessage(event) {
  let senderId = event.sender.id;
  let recipientId = event.recipient.id;
  let timeOfMessage = event.timestamp;
  let message = event.message;

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

  // how did wit think about this message?
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

module.exports = {
  receivedMessage,
  receivedPostback
}