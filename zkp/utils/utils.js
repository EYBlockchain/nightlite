const config = require('config');

/**
 * Checks if string has a leading 0x and adds it if it's not present.
 *
 * @param {String} input
 * @throws {TypeError} - If it receives something other than a string.
 * @returns {String}
 */
function ensure0x(input) {
  if (typeof input !== 'string') {
    throw new TypeError('Received something other than a string');
  }
  if (input.indexOf('0x') !== 0) {
    return `0x${input}`;
  }
  return input;
}

/**
 * Removes leading 0x on a string.
 *
 * @param {String} input
 * @throws {TypeError} - If it receives something other than a string.
 * @returns {String}
 */
function strip0x(input) {
  if (typeof input !== 'string') {
    throw new TypeError('Received something other than a string');
  }
  if (input.indexOf('0x') === 0) {
    return input.slice(2).toString();
  }
  return input;
}

/**
 * TODO: This function was undocumented.
 * @param {*} c
 * @returns {*} hash
 */
function hashC(c) {
  let hash = '';
  let conc = c;
  while (conc) {
    const slc = conc.slice(-config.get('hashLength') * 4); // grab the first 432 bits (or whatever is left)
    conc = conc.substring(0, conc.length - config.get('hashLength') * 4); // and remove it from the input string
    hash =
      crypto
        .createHash('sha256') // hash it and grab 216 bits
        .update(slc, 'hex')
        .digest('hex')
        .slice(-config.get('hashLength') * 2) + hash;
  }
  return hash;
}

/**
 * Concatenates two hex strings into a single buffer.
 *
 * Formerly named concat
 *
 * @param {String} a
 * @param {String} b
 * @throws {TypeError} - If it receives something other than a string.
 * @returns {Buffer}
 */
function concatHexToBuffer(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') {
    throw new TypeError('Received something other than a string');
  }
  const length = a.length + b.length;
  const buffer = Buffer.allocUnsafe(length); // creates a buffer object of length 'length'
  for (let i = 0; i < a.length; i += 1) {
    buffer[i] = a[i];
  }
  for (let j = 0; j < b.length; j += 1) {
    buffer[a.length + j] = b[j];
  }
  return buffer;
}

/**
 * Concatenates multiple hex strings into a single hex string, stripping out all '0x's and adding one to the beginning.
 *
 * Formerly named concatItems
 *
 * @param {Array} items - Array of hex strings.
 * @returns {String}
 */
function concatHexToSingleString(...items) {
  const combinedBuffer = items
    .map(item => Buffer.from(strip0x(item), 'hex'))
    .reduce((acc, item) => concatHexToBuffer(acc, item));
  return `0x${combinedBuffer.toString('hex')}`;
}

module.exports = {
  ensure0x,
  strip0x,
  hashC,
  concatHexToBuffer,
  concatHexToSingleString,
};
