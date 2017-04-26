var express = require('express');
var request = require('request');
var algoliasearch = require('algoliasearch');
var router = express.Router();
var defaults = require('../data/defaults');


//--------------ALGOLIA PARAMETERS-------------
const algoliaAppID = process.env.ALGOLIA_APP_ID;
const algoliaAdminAPIkey = process.env.ALGOLIA_ADMIN_KEY;


// clients for each table
var algoClient = algoliasearch(algoliaAppID, algoliaAdminAPIkey);

//--------------WIT.AI PARAMETERS--------------
const {Wit, log} = require('node-wit');
const witEndpoint = "https://api.wit.ai/message?v=20170424&q=";
const witAccessToken = process.env.WIT_ACCESS_TOKEN;

//------------FACEBOOK PARAMETERS------------
var fbActions = require('./fbActions');
const facebookAccessToken = process.env.TEST_BOT_PAGE_ACCESS_TOKEN;


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
    console.log('wit is sending a message');
    const {sessionId, context, entities} = request;
    const {text, quickreplies} = response;
    const recipientId = sessions[sessionId].fbid;
    console.log('user said...', request.text);
    console.log('user id...', recipientId);
    console.log('current context...', context);
    console.log('sending...', JSON.stringify(response));

    fbActions.sendTextMessage(recipientId, response.text);
  },

  // get the name of the user from the database based on their sender id
  getName({context, entities, sessionId}) {
    let senderID = sessions[sessionId].fbid;
    console.log('getting name for sender: ', senderID);

    let index = algoClient.initIndex('test_USERS');

    let promise = new Promise((resolve, reject) => {
      //search the database for the senders name in the context
      index.search(senderID, (err, content) => {
        if(err) {
          console.error('aloglia search error :: getName', err);
        }
        else {
          let hitlist = content.hits;

          if(hitlist && hitlist.length && hitlist[0].messengerID === senderID) 
          // ensure the the list is not empty and that we have an exact match
          {
            console.log('search completed for : ', senderID);
            let firstname = content.hits[0].firstname;
            let userID = content.hits[0].userID;

            if(firstname) {
            console.log('it worked: ' + firstname);
              resolve(content.hits[0]);
            } else {
              console.log('bye');
              reject(Error('it broke...'));
            }
          } else { //hitlist is empty
              resolve(defaults.defaultUser);
          }
        }
      });
    });

    console.log('default user: ', defaults.defaultUser);

    // attempt to abstract search user function
    //   continuing issue: ansynchronous behavior 

    // let promise = new Promise((resolve, reject) => {
    //   console.log('search based on senderID: ', senderId)
    //   let user = searchUser(senderId);

    //   if(user) {
    //     resolve({
    //       name : user.firstname,
    //       userId : user.userID
    //     });
    //   } else {
    //     console.log('it broke...');
    //     reject(Error('it broke...'));
    //   }
    // });

    promise.then((result) => {
      console.log('it works');
      console.log(result);
      console.log('in promise');
      // context.name = result.name;
      context.userProfile = result;
      context.name = context.userProfile.firstname;
      // context.userID = result.userID;
      console.log('context: ', context);
      return context;
    }, (err) => {
      console.error('it broke...');
    });

    return context;
  },

  //get hw assignemnts for this student
  getHomework({context, entities}) {
    console.log('========');
    console.log('sending... asignments....');
    console.log('========');

    // if we have already found the user information in get name
    //    improvement: use searchUser function to find the user if you don't know who they are
    if(context.userProfile.userID) {
      let index = algoClient.initIndex('test_CLASSES');

      let promise = new Promise((resolve, reject) => {
        //search the database for the classes that the user is in based on userID
        index.search(context.userProfile.userID, (err, content) => {
          if(err) {
            console.error('algolia search error :: getHomework');
          } else {
            console.log('getHomework :: search completed for: ', context.userProfile.userID);

            let hitlist = content.hits;

            let assignmentString = '';

            for (let hit of hitlist) {
              console.log(1);
              console.log('for: ', hit.classID);
              assignmentString += 'for: ' + hit.classID + '\n';
              for (let assignment of hit.assignmentList) {
                console.log(assignment.description);
                assignmentString += '  ' + assignment.description + '\n';
              }
            }

            if(assignmentString) {
              console.log('hw worked');
              resolve(assignmentString);
            } else {
              console.log('hw is a no go...');
              reject(Error('it broke...')); 
            }
          }
        });
      });

      promise.then((result) => {
        console.log('it works');
        console.log(result);
        console.log('in promise');
        context.assignments = result;
        console.log('context: ', context);
        return context;
      }, (err) => {
        console.error('it broke...');
      });

      return context;
    }

    // default option when the user in unknown
    context.assignments = 'mom says take out the trash';
    
    return context;
  }
};


// create our wit object
const wit = new Wit({
  accessToken: witAccessToken,
  actions,
  logger: new log.Logger(log.INFO)
});


// handle incoming facebook messages
function receivedMessage(event) {
  var senderId = event.sender.id;
  var recipientId = event.recipient.id;
  var timeOfMessage = event.timestamp;
  var message = event.message;

  console.log("Received message for user %d and page %d at %d with message:",
    senderId, recipientId, timeOfMessage);
  console.log(JSON.stringify(message));

  var messageId = message.mid;

  var messageText = message.text;
  var messageAttachments = message.attachments;

  if (messageText && !message.is_echo) {

    // If we receive a text message, check to see if it matches a keyword
    // and send back the example. Otherwise, just echo the text we received.
    switch (messageText) {
      case 'generic':
        sendGenericMessage(senderId);
        break;

      default:
        processMessage(senderId, messageText);
    }
  } else if (messageAttachments) {
    // sendTextMessage(senderId, "Message with attachment received");
    console.log('this thing has attachments');
    sendTextMessage(senderId, 'Sorry, I can only process text messages right now');
  }
}

// placeholder for advanced messages. See facebook messenger documentation for the
// rest of the code
function sendGenericMessage(senderId, messageText) {
  // To be expanded in later sections
}

//handle messages before sending them off to be sent
function processMessage(senderId, messageText) {
  let responseBuilder = messageText;

  console.log('pre-wit. messageText: ', messageText);

  let sessionId = findOrCreateSession(senderId);

  console.log('sesssionID: ', sessionId);

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

  console.log('wit has run its actions');


  // //send the intent to be printed back on FB
  wit.message(messageText, {})
    .then((data) => {
      console.log('Yay, got Wit.ai response: ' + JSON.stringify(data));
    })
    .catch(console.error);
}


// ===========ALGOLIA SEARCH FUNCTIONS================
//search for a user based on the given param
function searchUser(query) {
  console.log('^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^')
  let index = algoClient.initIndex('test_USERS');

  let promise = new Promise((resolve, reject) => {
    index.search(query, (err, content) => {
    //search the database
      if(err) {
        console.error('algolia search error :: getHomework');
      } else {
        console.log('getHomework :: search completed for: ', query);
        let hitlist = content.hits;
        
        if(hitlist && hitlist.length) { //if the hit list has items
          console.log('user found: ', hitlist[0]);
          return hitlist[0];
        } else {
          console.log('user not found. Sending generic.');
          return {
            "userID" : "generic_user_0001",
            "messengerID" : null,
            "userTpye" : "student",
            "firstname" : "Generic",
            "lastname" : "User",
            "school" : "Northeastern University",
            "objectID" : "352867770",
          };
        }
      }
    });
  });

  let outResult = {};

  promise.then((result) => {
    console.log('it works');
    console.log(result);
    console.log('in promise');
    return result;
  }, (err) => {
    console.error('it broke...');
  });

  return outResult;
}


//webhook token verifier from Facebook
router.get('/webhook/', function(req, res) {
  fbActions.validateWebhook(req,res);
});

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'ScChatty the chatbot!' });
});

module.exports = router;
