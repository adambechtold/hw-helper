
//cut the given string to the given length. pad with given char if neccessary
function stringPad(str, strLen, padder) {
  if(str.length > strLen) {
    str = str.slice(0,strLen);
  } else if (str.length < strLen) {
    str += padder.repeat(strLen - str.length);
  }
  return str;
}

module.exports.stringPad = stringPad;