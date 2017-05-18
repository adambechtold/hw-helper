const express = require('express');
let router = express.Router();

//------------FACEBOOK PARAMETERS------------
let {validateWebhook} = require('../lib/fbActions');

//-----------PROCESSING ACTIONS-------------
let {receivedMessage, receivedPostback} = require('../lib/messageProcessing');


// handle new facebook events to the webhook
router.post('/webhook', (req, res) => {
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
    res.sendStatus(200);
  }
});


//============HANDLE SOME BASIC REQUESTS================
//webhook token verifier from Facebook
router.get('/webhook/', function(req, res) {
  validateWebhook(req,res);
});

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'ScChatty the chatbot!' });
});

module.exports = router;