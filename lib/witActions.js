
let {stringPad} = require('./helperActions.js');

//------------FACEBOOK PARAMETERS------------
let {sendButtonMessage, sendTextMessage, sendTemplateMessage} = require('./fbActions');

//------------ALGOLIA PARAMETERS-------------
let {algoClient} = require('./algoliaActions');

let {sessions, findOrCreateSession} = require('../lib/sessions.js');

let formatQuickReplies = ((quickreplies) => {
  let buttonArray = [];
  for (let choice of quickreplies) {
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

    if(response.quickreplies) {
      sendButtonMessage(recipientID, response.text, formatQuickReplies(response.quickreplies));
    } else {
      sendTextMessage(recipientID, response.text);
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
      sendTextMessage(senderID, 'Not sure I caught that. Can you try something else?');
      return context;
    }

    //info is good. extract the name
    let userName = entities.contact[0].value;

    //parse through to get first and last name
    let firstName = userName.split(' ')[0];
    let lastName = userName.split(' ').slice(1).join(' ');
    
    //create the userID
    let userIDfirst = stringPad(firstName, 4, '*').toLowerCase();
    let userIDlast = stringPad(lastName, 4, '*').toLowerCase();

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
    !context.newUser || delete context.newUser;
  
    return context;
  },

  //get a list of the classes available at the students' school
  getClasses({context, entities, sessionId, text}) {
    let senderID = sessions[sessionId].fbid;    

    if(!context.userProfile) {
      console.log('ERROR :: getClasses :: no User Profile available in context.');
      return context;
    }

    let userSchool = context.userProfile.school;
    let index = algoClient.initIndex('test_CLASSES');

    return index.search(userSchool).then((content) => {
      let hitlist = content.hits;

      if (hitlist.length < 1) {
        context.classes = 'No classes available at ' + userSchool + ' : (';
        return context;
      }

      let classList = [];
      let currentUser = context.userProfile.userID;

      for(let hit of hitlist) {
        //filter out this person's current classes
        if (!(hit.studentList.indexOf(currentUser) > -1)) {
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
      }

      if (classList.length > 0) {
        sendTemplateMessage(senderID, classList, 'generic');
        return context;
      } else {
        sendTextMessage(senderID, "Looks like you're signed up for all available classes. Nerd...");
      }

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

      console.log('hi one');
      if (hitlist.length == 0) {
        console.log('hi');
        sendTextMessage(senderID, "No assignments! FREEDOM!!");
        return context;
      }

      //TODO input logic for too many assignments

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
      sendTemplateMessage(senderID, elementList, 'list');
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