let algoliasearch = require('algoliasearch');
let {ALGOLIA_ADMIN_KEY, ALGOLIA_APP_ID} = require('../secrets/alogliaTokens');

//--------------ALGOLIA PARAMETERS-------------
// const algoliaAppID = process.env.ALGOLIA_APP_ID;
// const algoliaAdminAPIkey = process.env.ALGOLIA_ADMIN_KEY;

// clients for each table
let algoClient = algoliasearch(ALGOLIA_APP_ID, ALGOLIA_APP_ID);

module.exports = {
  algoClient
}