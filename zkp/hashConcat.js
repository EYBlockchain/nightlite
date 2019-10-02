const config = require('../config/config');
const utils = require('./utils');

/**
 * Converts array of into array of Buffers into a single buffer,
 *
 * TODO: What's the difference between this and hashC?
 *
 * - convert each item in items to a 'buffer' of bytes (2 hex values), convert those bytes into decimal representation
 * - 'concat' each decimally-represented byte together into 'concatenated bytes'
 * - hash the 'buffer' of 'concatenated bytes' (sha256) (sha256 returns a hex output)
 * - truncate the result to the right-most 64 bits
 *
 * createHash: we're creating a sha256 hash
 * update: [input string to hash (an array of bytes (in decimal representaion) [byte, byte, ..., byte] which represents the result of: item1, item2, item3. Note, we're calculating hash(item1, item2, item3) ultimately]
 * digest: [output format ("hex" in our case)]
 * slice: [begin value] outputs the items in the array on and after the 'begin value'
 *
 * @param {Array} items - Array of items to be hashed.
 * @returns {String}
 */
function hashConcat(...items) {
  const concatValue = utils.concatHexToSingleString(items);

  const hash = `0x${crypto
    .createHash('sha256')
    .update(concatValue, 'hex')
    .digest('hex')
    .slice(-(config.hashLength * 2))}`;
  return hash;
}

module.exports = hashConcat;
