/**
 * This module handles conversions from one thing to another.
 */
const utils = require('./index');

/**
 * Converts hex strings into byte (decimal values).
 *
 * This function is used so that these hex strings can be passed into merkle-proof.code
 * in a more compressed format than bits. Each byte is individually converted so that
 * 0xffff becomes [15,15].
 *
 * @param {String} hex
 * @returns {String[]} - Array of byte strings in decimals. (i.e., 00 - 15)
 */
function hexToBytes(hex) {
  const cleanHex = utils.strip0x(hex);
  const out = [];
  for (let i = 0; i < cleanHex.length; i += 2) {
    const h = utils.ensure0x(cleanHex[i] + cleanHex[i + 1]);
    out.push(h);
  }
  return out;
}

/**
 * Converts a numeric string into an array of digits
 *
 * @param {String} str - Numeric string
 * @param {Number} base - Base to convert to
 * @returns {Number[]} - Array of single digit numbers.
 */
function parseToDigitsArray(str, base) {
  const digits = str.split('');
  const output = [];
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    const n = parseInt(digits[i], base);
    if (Number.isNaN(n)) return null;
    output.push(n);
  }
  return output;
}

/**
 * TODO: Undocumented function. Presumably adds two numbers.
 */
function add(x, y, base) {
  const z = [];
  const n = Math.max(x.length, y.length);
  let carry = 0;
  let i = 0;
  while (i < n || carry) {
    const xi = i < x.length ? x[i] : 0;
    const yi = i < y.length ? y[i] : 0;
    const zi = carry + xi + yi;
    z.push(zi % base);
    carry = Math.floor(zi / base);
    i += 1;
  }
  return z;
}

/**
 * Multiplies a number by an array of decimal digits.
 *
 * @param {Number} num
 * @param {Number[]} x - Array of decimal digits as in parseToDigitsArray
 * @returns TODO: I have no idea.
 */
function multiplyByNumber(num, x, base) {
  if (num < 0) return null;
  if (num === 0) return [];

  let result = [];
  let power = x;
  // eslint-disable-next-line
  while (true) {
    // eslint-disable-next-line
    if (num & 1) {
      result = add(result, power, base);
    }
    num >>= 1; // eslint-disable-line
    if (num === 0) break;
    power = add(power, power, base);
  }
  return result;
}

/**
 * Converts one base to another base.
 *
 * @param {String} str - Input as string
 * @param {Number} fromBase - Original base as a number.
 * @param {Number} toBase - Base to convert to as a number.
 * @returns {String}
 */
function convertBase(str, fromBase, toBase) {
  const digits = parseToDigitsArray(str, fromBase);
  if (digits === null) return null;

  let outArray = [];
  let power = [1];
  for (let i = 0; i < digits.length; i += 1) {
    // invariant: at this point, fromBase^i = power
    if (digits[i]) {
      outArray = add(outArray, multiplyByNumber(digits[i], power, toBase), toBase);
    }
    power = multiplyByNumber(fromBase, power, toBase);
  }

  let out = '';
  for (let i = outArray.length - 1; i >= 0; i -= 1) {
    out += outArray[i].toString(toBase);
  }
  // if the original input was equivalent to zero, then 'out' will still be empty ''. Let's check for zero.
  if (out === '') {
    let sum = 0;
    for (let i = 0; i < digits.length; i += 1) {
      sum += digits[i];
    }
    if (sum === 0) out = '0';
  }

  return out;
}

/**
 *
 * Splits a binary number into array chunks.
 *
 * Checks whether a binary number is larger than N bits,
 * and splits its binary representation into chunks of size = N bits.
 * The left-most (big endian) chunk will be the only chunk of size <= N bits.
 * If the inequality is strict, it left-pads this left-most chunk with zeros.
 *
 * @param {String} bitStr - A binary number string.
 * @param {Number} N - Chunk size.
 * @return An array whose elements are binary 'chunks' which altogether represent the input binary number.
 */
function splitAndPadBitsN(bitStr, N) {
  let a = [];
  const len = bitStr.length;
  if (len <= N) {
    return [bitStr.padStart(N, '0')];
  }
  const nStr = bitStr.slice(-N); // the rightmost N bits
  const remainderStr = bitStr.slice(0, len - N); // the remaining rightmost bits

  a = [...splitAndPadBitsN(remainderStr, N), nStr, ...a];

  return a;
}

/** Checks whether a hex number is larger than N bits, and splits its binary representation into chunks of size = N bits. The left-most (big endian) chunk will be the only chunk of size <= N bits. If the inequality is strict, it left-pads this left-most chunk with zeros.
@param {string} hexStr A hex number/string.
@param {integer} N The 'chunk size'.
@return An array whose elements are binary 'chunks' which altogether represent the input hex number.
*/
function splitHexToBitsN(hexStr, N) {
  const strippedHexStr = utils.strip0x(hexStr);
  const bitStr = convertBase(strippedHexStr.toString(), 16, 2);
  let a = [];
  a = splitAndPadBitsN(bitStr, N);
  return a;
}

/**
 *
 * Preserves the magnitude of a hex number in a finite field,
 * even if the order of the field is smaller than hexStr.
 * hexStr is converted to decimal (as fields work in decimal
 * integer representation) and then split into chunks of size packingSize.
 * Relies on a sensible packing size being provided (ZoKrates uses packingSize = 128).
 * if the result has fewer elements than it would need for compatibiity with the dsl,
 * it's padded to the left with zero elements
 */
function hexToFieldPreserve(hexStr, packingSize, packets) {
  let bitsArr = [];
  bitsArr = splitHexToBitsN(utils.strip0x(hexStr).toString(), packingSize.toString());
  let decArr = []; // decimal array
  decArr = bitsArr.map(item => convertBase(item.toString(), 2, 10));
  // now we need to add any missing zero elements
  if (packets !== undefined) {
    const missing = packets - decArr.length;
    for (let i = 0; i < missing; i += 1) decArr.unshift('0');
  }
  return decArr;
}

module.exports = {
  convertBase,
  hexToFieldPreserve,
  hexToBytes,
};
