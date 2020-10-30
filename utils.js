/**
 * @module utils.js
 * @author Westlad,Chaitanya-Konda,iAmMichaelConnor
 * @desc Set of utilities to manipulate variable into forms most liked by
 * Ethereum and Zokrates
 */

const {
  hexToBin,
  strip0x,
  ensure0x,
  hexToBytes,
  hexToDecLimbs,
  shaHash,
  mimcHash,
} = require('zkp-utils');
const logger = require('./logger');
const config = require('./config');

/* flattenDeep converts a nested array into a flattened array. We use this to pass our proofs and vks into the verifier contract.
 * Example:
 * A vk of the form:
 * [
 *   [
 *     [ '1','2' ],
 *     [ '3','4' ]
 *   ],
 *     [ '5','6' ],
 *     [
 *       [ '7','8' ], [ '9','10' ]
 *     ],
 * ]
 *
 * is converted to:
 * ['1','2','3','4','5','6',...]
 */
function flattenDeep(arr) {
  return arr.reduce(
    (acc, val) => (Array.isArray(val) ? acc.concat(flattenDeep(val)) : acc.concat(val)),
    [],
  );
}

function concatenateThenHash(...items) {
  if (config.HASH_TYPE === 'mimc' || process.env.HASH_TYPE === 'mimc') {
    return `0x${mimcHash(
      items.map(e => BigInt(ensure0x(e))),
      'ALT_BN_254',
    )
      .toString(16)
      .padStart(64, '0')}`;
  }
  return shaHash(...items);
}

/**
Function to compute the sequence of numbers that go after the 'a' in:
$ 'zokrates compute-witness -a'.
These will be passed into a ZoKrates container by zokrates.js to compute a witness.
Note that we don't always encode these numbers in the same way (sometimes they are individual bits, sometimes more complex encoding is used to save space e.g. fields ).
@param {array} elements - the array of Element objects that represent the parameters we wish to encode for ZoKrates.
*/

function formatInputsForZkSnark(elements) {
  let a = [];
  elements.forEach(element => {
    switch (element.encoding) {
      case 'bits':
        a = a.concat(hexToBin(strip0x(element.hex)));
        break;

      case 'bytes':
        a = a.concat(hexToBytes(strip0x(element.hex)));
        break;

      case 'field':
        // each vector element will be a 'decimal representation' of integers modulo a prime. p=21888242871839275222246405745257275088548364400416034343698204186575808495617 (roughly = 2*10e76 or = 2^254)
        a = a.concat(hexToDecLimbs(element.hex, element.packingSize, element.packets, 0));
        break;
      case 'scalar':
        // this copes with a decimal (BigInt) field element, that needs no conversion
        // eslint-disable-next-line valid-typeof
        if (typeof element.hex !== 'bigint')
          throw new Error(`scalar ${element.hex} is not of type BigInt`);
        a = a.concat(element.hex.toString(10));
        break;
      default:
        throw new Error('Encoding type not recognised');
    }
  });
  return a;
}

function gasUsedStats(txReceipt, functionName) {
  logger.debug(`\nGas used in ${functionName}:`);

  const { gasUsed } = txReceipt;
  const gasUsedLog = txReceipt.events.GasUsed;
  const gasUsedByShieldContract = Number(gasUsedLog.returnValues.byShieldContract.toString());
  const gasUsedByVerifierContract = Number(gasUsedLog.returnValues.byVerifierContract.toString());
  const refund = gasUsedByVerifierContract + gasUsedByShieldContract - gasUsed;

  logger.debug('Total:', gasUsed);
  logger.debug('By shield contract:', gasUsedByShieldContract);
  logger.debug('By verifier contract (pre refund):', gasUsedByVerifierContract);
  logger.debug('Refund:', refund);
  logger.debug('Attributing all of refund to the verifier contract...');
  logger.debug('By verifier contract (post refund):', gasUsedByVerifierContract - refund);
}

module.exports = {
  concatenateThenHash,
  flattenDeep,
  formatInputsForZkSnark,
  gasUsedStats,
};
