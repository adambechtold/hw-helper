var express = require('express');
var request = require('request');
var algoliasearch = require('algoliasearch');
var router = express.Router();
var algoliaActions = require('../routes/algoliaActions');

const algoliaAppID = process.env.ALGOLIA_APP_ID;
const algoliaAdminAPIkey = process.env.ALGOLIA_ADMIN_KEY;

var client = algoliasearch(algoliaAppID, algoliaAdminAPIkey);


router.get('/algolia', (req, res) => {
  console.log("GET: algolia.js");

  res.json('hello');
})

router.post('/algoliaTest', (req, res) => {
  let body = req.body;

  let index = client.initIndex('test_USERS');

  let promise = new Promise((resolve, reject) => {
    index.search(body.query, (err, content) => {
      if (err) {
        console.log('search end in :: ALOGLIA ERROR');
         reject(err);
      }

      else if (content.hits.length < 1 || content.hits[0].firstname != body.query) {
        console.log('search end in :: ALGOLIA: NO USER FOUND');
        resolve({userFound : false});
      } 

      else {
        console.log('search end in user found');
        resolve({
          userFound: true,
          user: content.hits[0]
        });
      }
    }); //end search function
  }); // end promise

  promise.then((result) => {
    console.log('return promise resolution');
    if(result.userFound) {
      res.json('we found: ' + result.user.firstname);
    }
      res.json('you need to create a new user');
  }).catch((err) => {
    console.log('return error to the client');
    res.json(err);
  });
});



router.post('/algolia', (req, res) => {
  body = req.body;

  index = client.initIndex(req.body.index);
  console.log("Index selected: " + req.body.index);
  intent = req.body.intent;

  //USE THE GENERIC SEARCH FUNCTION
  if(intent == 'gensearch') {
    res.json(algoliaActions.search(body.queryAttribute, body.query, body.index, body.exactMatch, body.responseType, body.defaultValue));
  }

  //ADD ITEM IF POST REQUEST IS TYPE ADD
  if(intent == "add") {
    object = req.body.newObject;

    index.addObject(object, function(err, content) {
      if(err) {
        console.log("algolia: ERROR ADDING OBJECT");
        console.error(err);
        res.json("algolia: ERROR ADDING OBJECT");
      }
      else {
        console.log("algolia: OBJECT ADDED");
        res.json("objectID=" + content.objectID);
      }
    });
    return;
  }

  //SEARCH IF POST REQUEST IS TYPE SEARCH
  if(intent == "search") {
    searchParam = req.body.query;
    index.search(searchParam, function(err, content) {
      if(err) {
        console.log("aloglia: SEARCHING ERROR");
        res.json("algolia: SEARCH FAILED");
      } else {
        console.log("algolia: SEARCH COMPLETED");
        console.log(content);
        res.json(content.hits);
      }
    });
    return;
  }

  //UPDATE IF POST REQUEST IS TYPE UPDATE
  else if (intent == "update") {
    console.log("UPDATE RECORD");
    object = req.body.object;
    newObject = req.body.newObject;
    updateParam = [object, newObject ];
    console.log(updateParam);
    index.saveObject(updateParam, function(err, content) {
      console.log(content);
      if(!err) {
        res.json("update successfull")
      }
      else {
        console.log("UPDATE ERROR");
        res.json("UPDATE ERROR");
      }
    });
    return;
  }

  //UPDATE PARTIAL IF TYPE UPDATEPARTIAL
  else if (intent == "updatePartial") {
    console.log("UPDATE RECORD");
    objectMod = req.body.objectMod;
    index.partialUpdateObject(objectMod, function(err, content) {
      console.log(content);
      if(!err) {
        res.json("update successfull")
      }
      else {
        console.log("UPDATE ERROR");
        res.json("UPDATE ERROR");
      }
    });
    return;
  }

  //DECLINE OPERATION IF UNKNOWN INTENT
  else {
    console.log("algolia: UNKNOWN INTENT " + req.body.query);
    res.json("algolia: UNKNOWN INTENT. Try \"add\" or \"search\" ");
  }
});


router.delete('/algolia', (req, res) => {
  //delete an item in the index
  console.log("let's get deletey");
  object = req.body.object.objectID;
  index.deleteObject(object, function(err) {
    if(!err) {
      console.log('delete success');
      res.json('delete success');
    }
    else {
      console.log('DELETE ATTEMPT FAILED');
    }
  });
});


module.exports = router;
