var express = require('express');
var request = require('request');
var bodyParser = require('body-parser');
var http = require('http');
var router = express.Router();


var wolfAppID = "HEWYTR-J7PAWX2P4J";
var wolfHost = "http://api.wolframalpha.com/v1/result";
var wolfPath = "?appid=" + wolfAppID +"&i=";
var wolfQueryEnd = "%3f";

var wolfAsk = "tallest+building";


router.post('/wolfram', (req, res) => {
  //add some data to the array
  console.log('post request');

  var query = req.body.query;
  console.log(req.body.query);

  url = wolfHost + wolfPath + query + wolfQueryEnd;

  request(url, function(error, response, html) {
    if(!error) {
      console.log(response.body);
      wolfResponse = response.body;
      res.json(wolfResponse);
    }
  })
});

router.get('/wolfram/', (req, res) => {
  //send the value of data

  url = wolfHost + wolfPath + wolfAsk + wolfQueryEnd;
  var wolfResponse;

  request(url, function(error, response, html) {
    if(!error) {
      console.log(response.body);
      wolfResponse = response.body;
      res.json(wolfResponse);
    }
  })
});

module.exports = router;
