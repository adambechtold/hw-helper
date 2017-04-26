var index = require('index.js');

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

    sendTextMessage(recipientId, response.text);
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

module.exports.actions = actions;