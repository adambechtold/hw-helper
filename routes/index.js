// Main questions for Alred:
// 1) Overcoming the asynchronous problems
//   -- abstracting algolia actions into separate files
//   -- wit.ai misinterpretation problem (probably caused by response/update delay)
// 2) Passing variables around
//   -- using the sessions variable from index.


const express = require('express');
const request = require('request');
const algoliasearch = require('algoliasearch');
let router = express.Router();
const defaults = require('../data/defaults');

//--------------ALGOLIA PARAMETERS-------------
const algoliaAppID = process.env.ALGOLIA_APP_ID;
const algoliaAdminAPIkey = process.env.ALGOLIA_ADMIN_KEY;

// clients for each table
var algoClient = algoliasearch(algoliaAppID, algoliaAdminAPIkey);

let algoActions = require('./algoliaActions');

//--------------WIT.AI PARAMETERS--------------
const {Wit, log} = require('node-wit');
const witEndpoint = "https://api.wit.ai/message?v=20170424&q=";
const witAccessToken = process.env.WIT_ACCESS_TOKEN;
const witActions = require('./witActions');

//------------FACEBOOK PARAMETERS------------
let fbActions = require('./fbActions');

//------------HELPER FUCNTIONS---------------
var helperActions = require('./helperActions');


// This will contain all user sessions.
// Each session has an entry:
// sessionId -> {fbid: facebookUserId, context: sessionState}
var sessions = {};

const findOrCreateSession = (fbid) => {

  let sessionId;
  // Let's see if we already have a session for the user fbid
  Object.keys(sessions).forEach(k => {
    if (sessions[k].fbid === fbid) {
      // Yep, got it!
      sessionId = k;
    }
  });
  if (!sessionId) {
    // No session found for user fbid, let's create a new one
    sessionId = new Date().toISOString();
    sessions[sessionId] = {fbid: fbid, context: {}};
  }
  return sessionId;
};

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

// WitAi actions
const actions = {
  //handle wit.ai generated responses
  send(request, response) {
    const {sessionId, context, entities} = request;
    const {text, quickreplies} = response;
    const recipientID = sessions[sessionId].fbid;
    console.log('user said...', request.text);
    console.log('current context...', context);
    console.log('sending...', JSON.stringify(response));

    if(response.quickreplies) {
      fbActions.sendButtonMessage(recipientID, response.text, witActions.formatQuickReplies(response.quickreplies));
    } else {
      fbActions.sendTextMessage(recipientID, response.text);
    }
  },

  // get the name of the user from the database based on their sender id
  getName({context, entities, sessionId}) {
    //see if the name is already in the context
    if(context.name) {
      return context;
    }

    let senderID = sessions[sessionId].fbid;

    let index = algoClient.initIndex('test_USERS');

    //set index to do an exact search
    index.setSettings({
      hitsPerPage: 1,
      typoTolerance: false
    });

    return index.search(senderID).then((content) => {
      if (content.hits.length < 1 || senderID != content.hits[0].messengerID) {
        // the user has not been found
        context.newUser = true;
        return context;
      }

      let user = content.hits[0];

      context.userProfile = user;
      context.name = user.firstname;

      return context;
    }).catch((err) => {
      console.log('ALGOLIA SEARCH ERROR :: getName');
      console.error(err);
    });
  }, 
  
  //create a new user with their fbid and name
  createUser({sessionId, context, text, entities}) {
    let senderID = sessions[sessionId].fbid;

    // if user sent bad info...
    if(!entities.contact || entities.contact.length < 1) {
      fbActions.sendTextMessage(senderID, 'Not sure I caught that. Can you try something else?');
      return context;
    }

    //info is good. extract the name
    let userName = entities.contact[0].value;

    //parse through to get first and last name
    let firstName = userName.split(' ')[0];
    let lastName = userName.split(' ').slice(1).join(' ');
    
    //create the userID
    let userIDfirst = helperActions.stringPad(firstName, 4, '*').toLowerCase();
    let userIDlast = helperActions.stringPad(lastName, 4, '*').toLowerCase();

    //TODO lookup other users with this user name to generate another userID
    //  for now, just use 0001
    let userID = userIDfirst + '_' + userIDlast + '_0001';
    firstName = firstName.charAt(0).toUpperCase() + firstName.slice(1);
    lastName = lastName.charAt(0).toUpperCase() + lastName.slice(1);
    
    let newUser = {
      userID: userID,
      userTpye: "student",
      messengerID: senderID,
      firstname: firstName,
      lastname: lastName,
      school: "All University"
    }

    let index = algoClient.initIndex('test_USERS');
    index.addObject(newUser, (err, content) => {
      if(err) {
        console.log('createUser :: Algolia search error');
      } else {
        console.log('new user added!!');
      }
    });

    context.name = firstName;
    context.userProfile = newUser;

    //remove new user context
    !context.newUser || delete context.user;
  
    return context;
  },

  //get a list of the classes available at the students' school
  getClasses({context, entities, sessionId, text}) {
    let senderID = sessions[sessionId].fbid;    

    if(!context.userProfile) {
      console.log('ERROR :: getClasses :: no User Profile available in context.');
      return context;
    }

    console.log('=========== CLASS SEARCH');
    console.log('let\'s find all the classes for :', context.userProfile.school);

    let userSchool = context.userProfile.school;
    let index = algoClient.initIndex('test_CLASSES');

    return index.search(userSchool).then((content) => {
      let hitlist = content.hits;

      if (hitlist.length < 1) {
        context.classes = 'No classes available at ' + userSchool + ' : (';
        return context;
      }

      let classList = [];

      for(let hit of hitlist) {
        classList.push({
          title: hit.classID,
          subtitle: hit.description,
          image_url: hit.imageURL,
          //item_url...
          //image_url...
          buttons: [{
            type: 'web_url',
            title: 'Learn More',
            url: 'http://www.northeastern.edu/scout/'
          },
          {
            type: 'postback',
            title: 'Sign me up!',
            payload: '{ "type" : "classSignup", \
                "school" : "' + hit.school + '", \
                "classID" : "' + hit.classID + '", \
                "senderID" : "' + senderID + '", \
                "userID" : "' + context.userProfile.userID + '", \
                "classObjectID" : "' + hit.objectID + '" } '
          }]
        });
      }

      fbActions.sendTemplateMessage(senderID, classList, 'generic');

      return context;

    }).catch((err) => {
      console.log('ALGOLIA SEARCH ERROR :: getClasses');
      console.log(err);
      return context;
    });
  },

  //get hw assignemnts for this student
  getHomework({context, entities, sessionId}) {
    let senderID = sessions[sessionId].fbid;

     if(!context.userProfile) {
      console.log('ERROR :: getHomework :: no User Profile available in context.');
      return context;
    }

    // if we have already found the user information in get name
    //    improvement: use searchUser function to find the user if you don't know who they are

    let index = algoClient.initIndex('test_CLASSES');

    //search the database for the classes that the user is in based on userID
    return index.search(context.userProfile.userID).then((content) => {
      let hitlist = content.hits;
      let assignmentString = '';

      //TODO input logic for no assignments

      //begin list of elements in the list. first is the header element
      let elementList = [{
        title: "Let's see what there is to do!",
        image_url: 'http://i.imgur.com/l6Z1Dsy.jpg',
      }];

      //create the rest of the elements in the list
      for (let hit of hitlist) {
        for (let assignment of hit.assignmentList) {

          elementList.push({
            title: hit.classID,
            //imageurl
            subtitle: assignment.description,
            //input stuff regarding dates
            // default action option
            buttons: [
              {
                title: 'Submit',
                type: 'web_url',
                url: 'http://www.northeastern.edu/scout/',
              }
            ]
          });
        }
      }

      fbActions.sendTemplateMessage(senderID, elementList, 'list');

      context.assignments = 'complete';
      return context;
    }).catch((err) => {
      console.log('ALGOLIA SEARCH ERROR :: getHomework');
      console.log(err);
      return context;
    });
  }
};

// create our wit object
const wit = new Wit({
  accessToken: witAccessToken,
  actions,
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
      console.log('Waiting for the next user messsage');

      //TODO implement some logic to end the user's session


      //update the user's current session state
      sessions[sessionId].context = context;
    })
    .catch((err) => {
      console.log(sessionId);
      console.log(witAccessToken);
      console.error('Houston, we have a probelm with Wit: ', err.stack || err);
    });
}


//============HANDLE SOME BASIC REQUESTS================

//webhook token verifier from Facebook
router.get('/webhook/', function(req, res) {
  fbActions.validateWebhook(req,res);
});


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

  if (payloadType === 'classSignup') {
    //this is a message to signup the current user to a certain class
    let school = payload.school;
    let classID = payload.classID;
    // get the user info for the the current user
    
    let index = algoClient.initIndex('test_CLASSES');

    //complete a partial update of the class to add the user's userID if they are 
    //  not already signed up for that class
    index.partialUpdateObject({
      studentList : {
        value : payload.userID,
        _operation: 'AddUnique'
      },
      objectID : payload.classObjectID
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

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'ScChatty the chatbot!' });
});

module.exports = router;