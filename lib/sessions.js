
var sessions = {};

//finds the session info stored in sessions or creates a new entry in sessions if needed
function findOrCreateSession(fbid) {
  let sessionId;
  // Let's see if we already have a session for the user fbid
  Object.keys(sessions).forEach(k => {
    if (sessions[k].fbid === fbid) {
      // Yep, got it!
      sessionId = k;
    }
  });
  if (!sessionId) {
    // No session found for user fbid, let's create a new one
    sessionId = new Date().toISOString();
    sessions[sessionId] = {fbid: fbid, context: {}};
  }
  return sessionId;
}

//remove a session entry if it exists
function deleteSession(sessionId) {
  if(sessions[sessionId]) {
    delete sessions[sessionId];
  } else {
    console.log('cannot delete. Session does not exist.');
  }
}


module.exports = {
  sessions,
  findOrCreateSession,
  deleteSession
};