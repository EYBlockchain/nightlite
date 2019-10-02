const config = require('../config/config');

/**
 * TODO: No documentation was found.
 * @param {Number} zCount
 * @throws {TypeError} - When receiving something other than a Number.
 * @returns {Number} - leafIndex
 */
function getLeafIndexFromZCount(zCount) {
  if (typeof zCount !== 'number') {
    throw new TypeError('Received something other than a Number');
  }
  const merkleDepth = parseInt(config.merkleDepth, 10);
  const merkleWidth = parseInt(2 ** (merkleDepth - 1), 10);
  const leafIndex = parseInt(merkleWidth - 1 + zCount, 10);
  return leafIndex;
}

module.exports = getLeafIndexFromZCount;
