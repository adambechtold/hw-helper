// Main questions for Alred:
// 1) Overcoming the asynchronous problems
//   -- abstracting algolia actions into separate files
//   -- wit.ai misinterpretation problem (probably caused by response/update delay)
// 2) Passing variables around
//   -- using the sessions variable from index.


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
    console.log('current context...', context);
    console.log('sending...', JSON.stringify(response));

    fbActions.sendTextMessage(recipientId, response.text);
  },

  // get the name of the user from the database based on their sender id
  getName({context, entities, sessionId}) {
    //see if the name is already in the context
    if(context.name) {
      return context;
    }

    let senderID = sessions[sessionId].fbid;
    console.log('getting name for sender: ', senderID);

    let index = algoClient.initIndex('test_USERS');

    new Promise((resolve, reject) => {
      //   //search the database for the senders name in the context
      index.search(senderID, (err, content) => {
        if (err) {
          // reject promise if error is found
          console.log('algolia search error');
          reject(err);
        }

        if (content.hits.length < 1 || content.hits[0].messengerID != senderID) {
          // the user has not been found
          resolve({
            userInfo: defaults.defaultUser,
            knonwUser: false
          });
        }

        let user = content.hits[0];

        resolve({
          userInfo: user,
          knonwUser: true
        });

      });
    }).then((result) => {
      if (result.knonwUser) {
        context.userProfile = result.userInfo;
        context.name = context.userProfile.firstname;
      } else {
        console.log('let\'s make a new user');
        context.newUser = true;
      }
      console.log('end promise context: ', context);
      return context;
    }).catch((err) => {
      // handle errors from promise
      console.error('it broke...');
      return context;
    });

    console.log('getName complete_+_+_+_+_+_+_++_');
    // return context;
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
      school: "Northeastern University"
    }

    //TODO: create a new user running algolia
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

    let promise = new Promise((resolve, reject) => {
      //search the database for the senders name in the context
      index.search(userSchool, (err, content) => {
        if (err) {
          // reject promise if error is found
          console.log('algolia search error');
          reject(err);
        }
        else {
          let hitlist = content.hits;

          if(hitlist.length < 1) {
            let classes = 'No classes available at ' + userSchool + ' : (';
            resolve(classes);
          }

          let classList = [];
          for(let hit of hitlist) {
            classList.push({
              title: hit.classID,
              subtitle : hit.description,
              image_url : hit.imageURL,
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
                payload: 'classID: ' + hit.classID
              }]
            });
          }

          fbActions.sendGenericMessage(senderID, classList);

          resolve('complete');
        }
      });
    });

    promise.then((classResponse) => {
      if(classResponse == 'complete') {
        context.classes = '';
      } else {
        context.classes = classResponse;
      }
      return context;
    }).catch((err) => {
      // handle errors from promise
      console.error('it broke...');
      return context;
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
    if(context.userProfile && context.userProfile.userID) {
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
        context.assignments = result;
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
        fbActions.sendGenericMessage(senderId);
        break;

      default:
        processMessage(senderId, messageText);
    }
  } else if (messageAttachments && !message.is_echo) {
    // sendTextMessage(senderId, "Message with attachment received");
    console.log('this thing has attachments');
    sendTextMessage(senderId, 'Sorry, I can only process text messages right now');
  }
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
// function searchUser(query) {
//   let index = algoClient.initIndex('test_USERS');

//   let promise = new Promise((resolve, reject) => {
//     index.search(query, (err, content) => {
//     //search the database
//       if(err) {
//         console.error('algolia search error :: getHomework');
//       } else {
//         console.log('getHomework :: search completed for: ', query);
//         let hitlist = content.hits;
        
//         if(hitlist && hitlist.length) { //if the hit list has items
//           console.log('user found: ', hitlist[0]);
//           return hitlist[0];
//         } else {
//           console.log('user not found. Sending generic.');
//           return defaults.defaultUser;
//         }
//       }
//     });
//   });

//   let outResult = {};

//   promise.then((result) => {
//     console.log('it works');
//     console.log(result);
//     console.log('in promise');
//     return result;
//   }, (err) => {
//     console.error('it broke...');
//   });

//   return outResult;
// }

//webhook token verifier from Facebook
router.get('/webhook/', function(req, res) {
  fbActions.validateWebhook(req,res);
});

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'ScChatty the chatbot!' });
});

module.exports = router;