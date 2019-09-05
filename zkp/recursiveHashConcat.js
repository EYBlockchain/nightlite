const config = require('config');
const utils = require('./utils');

/**
 * Hashes chunks of an array until a single hash is output.
 *
 * Hashes a concatenation of items by breaking the items up into 432 bit chunks, hashing those, plus any remainder
 * and then repeating the process until you end up with a single hash.  That way
 * we can generate a hash without needing to use more than a single sha round.  It's
 * not the same value as we'd get using rounds but it's at least doable.
 *
 * @param {Array} items - Arbitrary number of hex strings
 * @returns {String} - Concatenated hash.
 */
function recursiveHashConcat(...items) {
  const conc = utils.concatHexToSingleString(items);

  let hash = utils.hashC(conc);
  while (hash.length > config.get('hashLength') * 2) hash = utils.hashC(hash); // have we reduced it to a single 216 bit hash?
  return utils.ensure0x(hash);
}

module.exports = recursiveHashConcat;
