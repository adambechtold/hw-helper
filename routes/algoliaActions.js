var algoliasearch = require('algoliasearch');

//--------------ALGOLIA PARAMETERS-------------
const algoliaAppID = process.env.ALGOLIA_APP_ID;
const algoliaAdminAPIkey = process.env.ALGOLIA_ADMIN_KEY;


// clients for each table
var algoClient = algoliasearch(algoliaAppID, algoliaAdminAPIkey);


var search = (queryAttribute, query, table, exactMatch, responseType, defaultValue) => {
  
  let index = algoClient.initIndex(table);

  let promise = new Promise((resolve, reject) => {

    var algoResponse = index.search(query, (err, content) => {
    //search the database
      if(err) {
        console.error('algolia search error :: search :: algoliaActions.js');
      } else {
        console.log('aloglia :: search completed for: ', query);
        let hitlist = content.hits;
        
        if(hitlist && hitlist.length && (!exactMatch || hitlist[0].queryAttribute == query)) 
         //if the hit list has items and satisfies the exactness requirement
        {
          switch(responseType) {
            case 'hits':
              return (content.hits);
              break;
            case 'single':
              return (content.hits[0]);
              break;
            default:
              return (content);
          }
        } else if (defaultValue) {
          console.log('user not found. Sending default.');
          return (defaultValue);
        } else {
          console.log('user not found. no default to return.');
          throw 'algoliaActions :: search :: no user found. no default to return';
        }
      }
    });

    if(algoResponse) {
      resolve(algoResponse);
    } else {
      reject('algo search error');
    }
  });

  // out result is here to make the promise happy?

  promise.then((result) => {
    console.log('it works');
    console.log(result);
    console.log('in promise');
    return result;
  }, (err) => {
    console.error('it broke...');
  });
}

module.exports.search = search;