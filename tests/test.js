var express = require('express');
var request = require('request');
var router = express.Router();


var data = [1, 2, 3, 4];

router.post('/test', (req, res) => {
  //add some data to the array
  console.log('post request');

  console.log(req);


  query = req.body.query;

  // callWithWitAi(query, function(err, intent) {
  //   handleIntent()
  // });

  res.json(query);


  // var val = req.body.value;
  // console.log(req.body.value);
  //
  // data.push(val);
  // res.json( data );
});

const serverAccessToken = 'SPFJO6E643KP63WHBED4KHVD2YY6RCJW';
const witEndpoint = "https://api.wit.ai/message?v=20170401&q";

function callWithWitAi(query, callback) {
  console.log("Send wit: " + query);
  query = encodeURIComponent(query);
  console.log("Asking: " + query);
  request({
    uri : witEndpoint + query,
    qs : { access_token : serverAccessToken },
    method : "GET"
  }, function(error, response, body) {
    if(!error && response.statusCode == 200) {
      console.log("Successfully got: %s", response.body);
    }
    else {
      console.log(response.statusCode);
      console.log("Unable to send message.");
      callback(error);
    }
  });
}

function handleIntent(intent, sender) {
  console.log("handling" + intent);

}

router.get('/test/', (req, res) => {
  //send the value of data
  console.log('i am here now')
  res.json( data );
});

router.get('/test/:id', (req, res) => {
  //send the value of data
  console.log('i am here');

  res.json( data[req.params.id] );
});


router.put('/test', (req, res) => {
  //update the given index with some random value
  console.log('put request');

  const index = req.body.index;
  const value = req.body.value;

  data = otherFunc(data, index, value);

  res.json( data );
});

function otherFunc(data, index, value) {
  data[index] = value;

  return data;
}

router.delete('/test', (req, res) => {
  //delete the object at a given index
  console.log('delete request');
  const index = +req.query.index;
  var pre = data.slice(0, index);
  console.log(pre);
  var rest = data.slice(index + 1, data.length);
  console.log(rest);
  data = pre.concat(rest);

  res.json(data);
});

module.exports = router;
