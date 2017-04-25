let FeedParser = require('feedparser');
var request = require('request');
var feedParser = new FeedParser();


var googleNewsEndpoint = "https://news.google.com/news?ouput=rss";

request.get(googleNewsEndpoint, ( err, response, body ) => {
  console.log('error:', err); // Print the error if one occurred
  console.log('statusCode:', response && response.statusCode); // Print the response status code if a response was received
  console.log('body:', body); // Print the HTML for the Google homepage.
});
