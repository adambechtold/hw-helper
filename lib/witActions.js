// I want to define functions here to clean up the index, but I need access to a variable in index.

//------------FACEBOOK PARAMETERS------------
var fbActions = require('./fbActions');

var algoliasearch = require('algoliasearch');

const algoliaAppID = process.env.ALGOLIA_APP_ID;
const algoliaAdminAPIkey = process.env.ALGOLIA_ADMIN_KEY;
var algoClient = algoliasearch(algoliaAppID, algoliaAdminAPIkey);
let algoActions = require('./algoliaActions');

let {sessions, findOrCreateSession} = require('../lib/sessions.js');

let formatQuickReplies = ((quickreplies) => {
  let buttonArray = [];
  console.log('quickreplies: ', quickreplies);
  for (let choice of quickreplies) {
    console.log('choice : ', choice);
    buttonArray.push({
      type : 'postback',
      title : choice,
      payload : JSON.stringify({
        type : 'quickReply',
        message : choice
      })
    })
  }
  return buttonArray;
});

// WitAi actions
const actions = {
  //handle wit.ai generated responses
  send(request, response) {
    const {sessionId, context, entities} = request;
    const {text, quickreplies} = response;
    const recipientID = sessions[sessionId].fbid;
    // console.log('user said...', request.text);
    // console.log('current context...', context);
    // console.log('sending...', JSON.stringify(response));

    if(response.quickreplies) {
      fbActions.sendButtonMessage(recipientID, response.text, formatQuickReplies(response.quickreplies));
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

    // ALFRED: this is the way I use the sessions variable. it is in almost every wit function
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
            payload: JSON.stringify({
              type : 'classSignup',
              school : hit.school,
              classID : hit.classID,
              senderID : senderID,
              userID : context.userProfile.userID,
              classObjectID : hit.objectID
            })
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

      //TODO input logic for no assignments or too many assignments

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


module.exports = {
  formatQuickReplies,
  actions
};