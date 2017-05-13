let algoliasearch = require('algoliasearch');

//--------------ALGOLIA PARAMETERS-------------
const algoliaAppID = process.env.ALGOLIA_APP_ID;
const algoliaAdminAPIkey = process.env.ALGOLIA_ADMIN_KEY;


// clients for each table
let algoClient = algoliasearch(algoliaAppID, algoliaAdminAPIkey);


module.exports = {
  algoClient
}