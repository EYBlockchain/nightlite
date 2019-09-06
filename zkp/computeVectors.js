const hexToBinary = require('hex-to-binary');
const config = require('config');
const utils = require('./utils');

/**
 * Computes the sequence of numbers for `zokrates.computeWitness()`
 *
 * Note that we don't always encode these numbers
 * in the same way (sometimes they are individual bits, sometimes more complex encoding
 * is used to save space e.g. fields ).
 *
 * @param {Array} elements - the array of Element objects that represent the parameters we wish to encode for ZoKrates.
 * @returns {Array} - Array of
 */
function computeVectors(elements) {
  let a = [];
  elements.forEach(element => {
    switch (element.encoding) {
      case 'bits':
        a = a.concat(hexToBinary(utils.strip0x(element.hex)).split(''));
        break;
      case 'bytes':
        a = a.concat(utils.hexToBytes(element.hex));
        break;
      case 'field': // each vector element will be a 'decimal representation' of integers modulo a prime. p=21888242871839275222246405745257275088548364400416034343698204186575808495617 (roughly = 2*10e76 or = 2^254)
        a = a.concat(
          utils.hexToFieldPreserve(
            utils.strip0x(element.hex),
            config.get('zokratesPackingSize'),
            element.packets,
          ),
        );
        break;
      default:
        throw new Error('Encoding type not recognized');
    }
  });
  return a;
}

module.exports = computeVectors;
