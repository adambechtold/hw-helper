// I want to define functions here to clean up the index, but I need access to a variable in index.

let formatQuickReplies = ((quickreplies) => {
  let buttonArray = [];
  console.log('quickreplies: ', quickreplies);
  for (let choice of quickreplies) {
    console.log('choice : ', choice);
    buttonArray.push({
      type : 'postback',
      title : choice,
      payload : 'quickReply|' + choice
    })
  }
  return buttonArray;
});

module.exports.formatQuickReplies = formatQuickReplies;