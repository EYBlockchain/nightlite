/**
@module utils.js
@author Westlad,Chaitanya-Konda,iAmMichaelConnor
@desc Set of utilities to manipulate variable into forms most liked by
Ethereum and Zokrates
*/

import BI from 'big-integer';
import hexToBinary from 'hex-to-binary';
import crypto from 'crypto';
import { Buffer } from 'safe-buffer';
import config from '../config';

const inputsHashLength = 32;
const merkleDepth = 33;

// FUNCTIONS ON HEX VALUES

/**
utility function to remove a leading 0x on a string representing a hex number.
If no 0x is present then it returns the string un-altered.
*/
function strip0x(hex) {
  if (typeof hex === 'undefined') return '';
  if (typeof hex === 'string' && hex.indexOf('0x') === 0) {
    return hex.slice(2).toString();
  }
  return hex.toString();
}

function isHex(h) {
  const regexp = /^[0-9a-fA-F]+$/;
  return regexp.test(strip0x(h));
}

/**
utility function to check that a string has a leading 0x (which the Solidity
compiler uses to check for a hex string).  It adds it if it's not present. If
it is present then it returns the string unaltered
*/
function ensure0x(hex = '') {
  const hexString = hex.toString();
  if (typeof hexString === 'string' && hexString.indexOf('0x') !== 0) {
    return `0x${hexString}`;
  }
  return hexString;
}

/**
Utility function to convert a string into a hex representation of fixed length.
@param {string} str - the string to be converted
@param {int} outLength - the length of the output hex string in bytes (excluding the 0x)
if the string is too short to fill the output hex string, it is padded on the left with 0s
if the string is too long, an error is thrown
*/
function utf8StringToHex(str, outLengthBytes) {
  const outLength = outLengthBytes * 2; // work in characters rather than bytes
  const buf = Buffer.from(str, 'utf8');
  let hex = buf.toString('hex');
  if (outLength < hex.length)
    throw new Error('String is to long, try increasing the length of the output hex');
  hex = hex.padStart(outLength, '00');
  return ensure0x(hex);
}

function hexToUtf8String(hex) {
  const cleanHex = strip0x(hex).replace(/00/g, '');

  const buf = Buffer.from(cleanHex, 'hex');
  return buf.toString('utf8');
}

/**
Converts hex strings into binary, so that they can be passed into merkle-proof.code
for example (0xff -> [1,1,1,1,1,1,1,1])
*/
function hexToBin(hex) {
  return hexToBinary(strip0x(hex)).split('');
}

/** Helper function for the converting any base to any base
 */
function parseToDigitsArray(str, base) {
  const digits = str.split('');
  const ary = [];
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    const n = parseInt(digits[i], base);
    if (Number.isNaN(n)) return null;
    ary.push(n);
  }
  return ary;
}

/** Helper function for the converting any base to any base
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

/** Helper function for the converting any base to any base
 Returns a*x, where x is an array of decimal digits and a is an ordinary
 JavaScript number. base is the number base of the array x.
*/
function multiplyByNumber(num, x, base) {
  if (num < 0) return null;
  if (num === 0) return [];

  let result = [];
  let power = x;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    // eslint-disable-next-line no-bitwise
    if (num & 1) {
      result = add(result, power, base);
    }
    num >>= 1; // eslint-disable-line
    if (num === 0) break;
    power = add(power, power, base);
  }
  return result;
}

/** Helper function for the converting any base to any base
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

// the hexToBinary library was giving some funny values with 'undefined' elements within the binary string. Using convertBase seems to be working nicely. THe 'Simple' suffix is to distinguish from hexToBin, which outputs an array of bit elements.
function hexToBinSimple(hex) {
  const bin = convertBase(strip0x(hex), 16, 2);
  return bin;
}

/**
Converts hex strings into byte (decimal) values.  This is so that they can
be passed into  merkle-proof.code in a more compressed fromat than bits.
Each byte is invididually converted so 0xffff becomes [15,15]
*/
function hexToBytes(hex) {
  const cleanHex = strip0x(hex);
  const out = [];
  for (let i = 0; i < cleanHex.length; i += 2) {
    const h = ensure0x(cleanHex[i] + cleanHex[i + 1]);
    out.push(parseInt(h, 10).toString());
  }
  return out;
}

// Converts hex strings to decimal values
function hexToDec(hexStr) {
  if (hexStr.substring(0, 2) === '0x') {
    return convertBase(hexStr.substring(2).toLowerCase(), 16, 10);
  }
  return convertBase(hexStr.toLowerCase(), 16, 10);
}

/** converts a hex string to an element of a Finite Field GF(fieldSize) (note, decimal representation is used for all field elements)
@param {string} hexStr A hex string.
@param {integer} fieldSize The number of elements in the finite field.
@return {string} A Field Value (decimal value) (formatted as string, because they're very large)
*/
function hexToField(hexStr, fieldSize) {
  const cleanHexStr = strip0x(hexStr);
  const decStr = hexToDec(cleanHexStr);
  const q = BI(fieldSize);
  return BI(decStr)
    .mod(q)
    .toString();
}

/**
Left-pads the input hex string with zeros, so that it becomes of size N octets.
@param {string} hexStr A hex number/string.
@param {integer} N The string length (i.e. the number of octets).
@return A hex string (padded) to size N octets, (plus 0x at the start).
*/
function leftPadHex(hexStr, n) {
  return ensure0x(strip0x(hexStr).padStart(n, '0'));
}

/**
Used by splitAndPadBitsN function.
Left-pads the input binary string with zeros, so that it becomes of size N bits.
@param {string} bitStr A binary number/string.
@param {integer} N The 'chunk size'.
@return A binary string (padded) to size N bits.
*/
function leftPadBitsN(bitStr, n) {
  const len = bitStr.length;
  let paddedStr;
  if (len > n) {
    return new Error(`String larger than ${n} bits passed to leftPadBitsN`);
  }
  if (len === n) {
    return bitStr;
  }
  paddedStr = '0'.repeat(n - len);
  paddedStr = paddedStr.toString() + bitStr.toString();
  return paddedStr;
}

/**
Used by split'X'ToBitsN functions.
Checks whether a binary number is larger than N bits, and splits its binary representation into chunks of size = N bits. The left-most (big endian) chunk will be the only chunk of size <= N bits. If the inequality is strict, it left-pads this left-most chunk with zeros.
@param {string} bitStr A binary number/string.
@param {integer} N The 'chunk size'.
@return An array whose elements are binary 'chunks' which altogether represent the input binary number.
*/
function splitAndPadBitsN(bitStr, n) {
  let a = [];
  const len = bitStr.length;
  if (len <= n) {
    return [leftPadBitsN(bitStr, n)];
  }
  const nStr = bitStr.slice(-n); // the rightmost N bits
  const remainderStr = bitStr.slice(0, len - n); // the remaining rightmost bits

  a = [...splitAndPadBitsN(remainderStr, n), nStr, ...a];

  return a;
}

/** Checks whether a hex number is larger than N bits, and splits its binary representation into chunks of size = N bits. The left-most (big endian) chunk will be the only chunk of size <= N bits. If the inequality is strict, it left-pads this left-most chunk with zeros.
@param {string} hexStr A hex number/string.
@param {integer} N The 'chunk size'.
@return An array whose elements are binary 'chunks' which altogether represent the input hex number.
*/
function splitHexToBitsN(hexStr, n) {
  const strippedHexStr = strip0x(hexStr);
  const bitStr = hexToBinSimple(strippedHexStr.toString());
  let a = [];
  a = splitAndPadBitsN(bitStr, n);
  return a;
}

// Converts binary value strings to decimal values
function binToDec(binStr) {
  const dec = convertBase(binStr, 2, 10);
  return dec;
}

/** Preserves the magnitude of a hex number in a finite field, even if the order of the field is smaller than hexStr. hexStr is converted to decimal (as fields work in decimal integer representation) and then split into chunks of size packingSize. Relies on a sensible packing size being provided (ZoKrates uses packingSize = 128).
 *if the result has fewer elements than it would need for compatibiity with the dsl, it's padded to the left with zero elements
 */
function hexToFieldPreserve(hexStr, packingSize, packets, silenceWarnings) {
  let bitsArr = [];
  bitsArr = splitHexToBitsN(strip0x(hexStr).toString(), packingSize.toString());

  let decArr = []; // decimal array
  decArr = bitsArr.map(item => binToDec(item.toString()));

  // fit the output array to the desired number of packets:
  if (packets !== undefined) {
    if (packets < decArr.length) {
      const overflow = decArr.length - packets;
      if (!silenceWarnings)
        throw new Error(
          `Field split into an array of ${decArr.length} packets: ${decArr}
          , but this exceeds the requested packet size of ${packets}. Data would have been lost; possibly unexpectedly. To silence this warning, pass '1' or 'true' as the final parameter.`,
        );
      // remove extra packets (dangerous!):
      for (let i = 0; i < overflow; i += 1) decArr.shift();
    } else {
      const missing = packets - decArr.length;
      // add any missing zero elements
      for (let i = 0; i < missing; i += 1) decArr.unshift('0');
    }
  }
  return decArr;
}

// Converts binary value strings to hex values
function binToHex(binStr) {
  const hex = convertBase(binStr, 2, 16);
  return hex ? `0x${hex}` : null;
}

// FUNCTIONS ON DECIMAL VALUES

// Converts decimal value strings to hex values
function decToHex(decStr) {
  const hex = convertBase(decStr, 10, 16);
  return hex ? `0x${hex}` : null;
}

// Converts decimal value strings to binary values
function decToBin(decStr) {
  return convertBase(decStr, 10, 2);
}

/** Checks whether a decimal integer is larger than N bits, and splits its binary representation into chunks of size = N bits. The left-most (big endian) chunk will be the only chunk of size <= N bits. If the inequality is strict, it left-pads this left-most chunk with zeros.
@param {string} decStr A decimal number/string.
@param {integer} N The 'chunk size'.
@return An array whose elements are binary 'chunks' which altogether represent the input decimal number.
*/
function splitDecToBitsN(decStr, N) {
  const bitStr = decToBin(decStr.toString());
  let a = [];
  a = splitAndPadBitsN(bitStr, N);
  return a;
}

function isProbablyBinary(arr) {
  const foundField = arr.find(el => el !== 0 && el !== 1);
  // ...hence it is not binary:
  return !foundField;
}

// FUNCTIONS ON FIELDS

/**
Converts an array of Field Elements (decimal numbers which are smaller in magnitude than the field size q), where the array represents a decimal of magnitude larger than q, into the decimal which the array represents.
@param {[string]} fieldsArr is an array of (decimal represented) field elements. Each element represents a number which is 2**128 times larger than the next in the array. So the 0th element of fieldsArr requires the largest left-shift (by a multiple of 2**128), and the last element is not shifted (shift = 1). The shifted elements should combine (sum) to the underlying decimal number which they represent.
@param {integer} packingSize Each field element of fieldsArr is a 'packing' of exactly 'packingSize' bits. I.e. packingSize is the size (in bits) of each chunk (element) of fieldsArr. We use this to reconstruct the underlying decimal value which was, at some point previously, packed into a fieldsArr format.
@returns {string} A decimal number (as a string, because it might be a very large number)
*/
function fieldsToDec(fieldsArr, packingSize) {
  const len = fieldsArr.length;
  let acc = new BI('0');
  const s = [];
  const t = [];
  const shift = [];
  const exp = new BI(2).pow(packingSize);
  for (let i = 0; i < len; i += 1) {
    s[i] = new BI(fieldsArr[i].toString());
    shift[i] = new BI(exp).pow(len - 1 - i); // binary shift of the ith field element
    t[i] = new BI('0');
    t[i] = s[i].multiply(shift[i]);
    acc = acc.add(t[i]);
  }
  const decStr = acc.toString();
  return decStr;
}

// UTILITY FUNCTIONS:

/**
Utility function to xor to two hex strings and return as buffer
Looks like the inputs are somehow being changed to decimal!
*/
function xor(a, b) {
  const length = Math.max(a.length, b.length);
  const buffer = Buffer.allocUnsafe(length); // creates a buffer object of length 'length'
  for (let i = 0; i < length; i += 1) {
    buffer[i] = a[i] ^ b[i]; // eslint-disable-line
  }
  // a.forEach((item)=>console.log("xor input a: " + item))
  // b.forEach((item)=>console.log("xor input b: " + item))
  // buffer.forEach((item)=>console.log("xor outputs: " + item))
  return buffer;
}

/**
Utility function to concatenate two hex strings and return as buffer
Looks like the inputs are somehow being changed to decimal!
*/
function concatenate(a, b) {
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
Utility function:
hashes a concatenation of items but it does it by
breaking the items up into 432 bit chunks, hashing those, plus any remainder
and then repeating the process until you end up with a single hash.  That way
we can generate a hash without needing to use more than a single sha round.  It's
not the same value as we'd get using rounds but it's at least doable.
*/
function hash(item) {
  const preimage = strip0x(item);

  const h = `0x${crypto
    .createHash('sha256')
    .update(preimage, 'hex')
    .digest('hex')
    .slice(-(inputsHashLength * 2))}`;
  return h;
}

/**
Utility function to:
- convert each item in items to a 'buffer' of bytes (2 hex values), convert those bytes into decimal representation
- 'concatenate' each decimally-represented byte together into 'concatenated bytes'
- hash the 'buffer' of 'concatenated bytes' (sha256) (sha256 returns a hex output)
- truncate the result to the right-most 64 bits
Return:
createHash: we're creating a sha256 hash
update: [input string to hash (an array of bytes (in decimal representaion) [byte, byte, ..., byte] which represents the result of: item1, item2, item3. Note, we're calculating hash(item1, item2, item3) ultimately]
digest: [output format ("hex" in our case)]
slice: [begin value] outputs the items in the array on and after the 'begin value'
*/
function concatenateThenHash(...items) {
  const concatvalue = items
    .map(item => Buffer.from(strip0x(item), 'hex'))
    .reduce((acc, item) => concatenate(acc, item));

  const h = `0x${crypto
    .createHash('sha256')
    .update(concatvalue, 'hex')
    .digest('hex')}`;
  return h;
}

/**
function to generate a promise that resolves to a string of hex
@param {int} bytes - the number of bytes of hex that should be returned
*/
function rndHex(bytes) {
  return new Promise((resolve, reject) => {
    crypto.randomBytes(bytes, (err, buf) => {
      if (err) reject(err);
      resolve(`0x${buf.toString('hex')}`);
    });
  });
}

function getLeafIndexFromZCount(zCount) {
  // force it to be a number:
  const zCountInt = parseInt(zCount, 10);
  const MERKLE_DEPTH = parseInt(merkleDepth, 10);
  const MERKLE_WIDTH = parseInt(2 ** (MERKLE_DEPTH - 1), 10);
  const leafIndex = parseInt(MERKLE_WIDTH - 1 + zCountInt, 10);
  return leafIndex;
}

/* flattenDeep converts a nested array into a flattened array. We use this to pass our proofs and vks into the verifier contract.
Example:
A vk of the form:
[
  [
    [ '1','2' ],
    [ '3','4' ]
  ],
    [ '5','6' ],
    [
      [ '7','8' ], [ '9','10' ]
    ],
  [
    [ '11','12' ],
    [ '13','14' ]
  ],
    [ '15','16' ],
    [
      [ '17','18' ], [ '19','20' ]
    ],
  [
    [ '21','22' ],
    [ '23','24' ]
  ],
  [
    [ '25','26' ],
    [ '27','28' ],
    [ '29','30' ],
    [ '31','32' ]
  ]
]

is converted to:
['1','2','3','4','5','6',...]
*/
function flattenDeep(arr) {
  return arr.reduce(
    (acc, val) => (Array.isArray(val) ? acc.concat(flattenDeep(val)) : acc.concat(val)),
    [],
  );
}

// function to pad out a Hex value with leading zeros to l bits total length,
// preserving the '0x' at the start
function padHex(A, l) {
  if (l % 8 !== 0) throw new Error('cannot convert bits into a whole number of bytes');
  return ensure0x(strip0x(A).padStart(l / 4, '0'));
}

/**
function to compute the sequence of numbers that go after the 'a' in
$ 'zokrates compute-witness -a'.  These will be passed into a ZoKrates container
by zokrates.js to compute a witness.  Note that we don't always encode these numbers
in the same way (sometimes they are individual bits, sometimes more complex encoding
is used to save space e.g. fields ).
@param {object} elements - the array of Element objects that represent the parameters
we wish to encode for ZoKrates.
*/
export function computeVectors(elements) {
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
        a = a.concat(hexToFieldPreserve(element.hex, element.packingSize, element.packets, 1));
        break;

      default:
        throw new Error('Encoding type not recognised');
    }
  });
  return a;
}

/**
This function computes the path through a Mekle tree to get from a token
to the root by successive hashing.  This is needed for part of the private input
to proofs that need demonstrate that a token is in a Merkle tree.
It works for any size of Merkle tree, it just needs to know the tree depth, which it gets from config.js
@param {string} account - the account that is paying for these tranactions
@param {contract} shieldContract - an instance of the shield contract that holds the tokens to be joined
@param {array} myToken - the set of n tokens/committments (those not yet used will be 0) returned
from TokenShield.sol
@param {integer} myTokenIndex - the index within the shield contract of the merkle tree of the token we're calculating the witness for
@returns {object} containging: an array of strings - where each element of the array is a node of the sister-path of
the path from myToken to the Merkle Root and whether the sister node is to the left or the right (this is needed because the order of hashing matters)
*/
export async function computePath(account, shieldContract, _myToken, myTokenIndex) {
  console.group('Computing path on local machine...');
  const myToken = strip0x(_myToken);
  console.log('myToken', myToken);
  if (myToken.length !== config.INPUTS_HASHLENGTH * 2) {
    throw new Error(`tokens have incorrect length: ${myToken}`);
  }
  const myTokenTruncated = myToken.slice(-config.MERKLE_HASHLENGTH * 2);
  console.log('myTokenTruncated', myTokenTruncated);
  console.log(`myTokenIndex: ${myTokenIndex}`);
  const leafIndex = getLeafIndexFromZCount(myTokenIndex);
  console.log('leafIndex', leafIndex);

  // define Merkle Constants:
  const { MERKLE_DEPTH } = config;

  // get the relevant token data from the contract
  let leaf = await zkp.getMerkleNode(account, shieldContract, leafIndex);
  leaf = strip0x(leaf);
  if (leaf === myTokenTruncated) {
    console.log(
      `Found a matching token commitment, ${leaf} in the on-chain Merkle Tree at the specified index ${leafIndex}`,
    );
  } else {
    throw new Error(
      `Failed to find the token commitment, ${myToken} in the on-chain Merkle Tree at the specified index ${leafIndex} (when truncated to ${myTokenTruncated}). Found ${leaf} at this index instead.`,
    );
  }

  // let p = []; // direct path
  let p0 = leafIndex; // index of path node in the merkle tree
  let nodeHash;
  // now we've verified the location of myToken in the Merkle Tree, we can extract the rest of the path and the sister-path:
  let s = []; // sister path
  let s0 = 0; // index of sister path node in the merkle tree
  let t0 = 0; // temp index for next highest path node in the merkle tree

  let sisterSide = '';

  for (let r = MERKLE_DEPTH - 1; r > 0; r -= 1) {
    if (p0 % 2 === 0) {
      // p even
      s0 = p0 - 1;
      t0 = Math.floor((p0 - 1) / 2);
      sisterSide = '0'; // if p is even then the sister will be on the left. Encode this as 0
    } else {
      // p odd
      s0 = p0 + 1;
      t0 = Math.floor(p0 / 2);
      sisterSide = '1'; // conversly if p is odd then the sister will be on the right. Encode this as 1
    }

    nodeHash = zkp.getMerkleNode(account, shieldContract, s0);
    s[r] = {
      merkleIndex: s0,
      nodeHashOld: nodeHash,
      sisterSide,
    };

    p0 = t0;
  }

  // separate case for the root:
  nodeHash = zkp.getLatestRoot(shieldContract);
  s[0] = {
    merkleIndex: 0,
    nodeHashOld: nodeHash,
  };

  // and strip the '0x' from s
  s = s.map(async el => {
    return {
      merkleIndex: el.merkleIndex,
      sisterSide: el.sisterSide,
      nodeHashOld: strip0x(await el.nodeHashOld),
    };
  });

  s = await Promise.all(s);

  // Check the lengths of the hashes of the path and the sister-path - they should all be a set length (except the more secure root):

  // Handle the root separately:
  s[0].nodeHashOld = strip0x(s[0].nodeHashOld);
  if (s[0].nodeHashOld.length !== 0 && s[0].nodeHashOld.length !== config.INPUTS_HASHLENGTH * 2)
    // the !==0 check is for the very first path calculation
    throw new Error(`path nodeHash has incorrect length: ${s[0].nodeHashOld}`);

  // Now the rest of the nodes:
  for (let i = 1; i < s.length; i += 1) {
    s[i].nodeHashOld = strip0x(s[i].nodeHashOld);

    if (s[i].nodeHashOld.length !== 0 && s[i].nodeHashOld.length !== config.MERKLE_HASHLENGTH * 2)
      // the !==0 check is for the very first path calculation
      throw new Error(`sister path nodeHash has incorrect length: ${s[i].nodeHashOld}`);
  }

  // next work out the path from our token or coin to the root
  /*
  E.g.
                 ABCDEFG
        ABCD                EFGH
    AB        CD        EF        GH
  A    B    C    D    E    F    G    H

  If C were the token, then the X's mark the 'path' (the path is essentially a path of 'siblings'):

                 root
        ABCD                 X
     X        CD        EF        GH
  A    B    C    X    E    F    G    H
  */

  let sisterPositions = s
    .map(pos => pos.sisterSide)
    .join('')
    .padEnd(config.ZOKRATES_PACKING_SIZE, '0');
  console.log('sisterPositions binary encoding:', sisterPositions);

  sisterPositions = binToHex(sisterPositions);
  console.log('sisterPositions hex encoding:', sisterPositions);
  console.groupEnd();

  // create a hex encoding of all the sister positions
  const sisterPath = s.map(pos => ensure0x(pos.nodeHashOld));

  return { path: sisterPath, positions: sisterPositions }; // return the sister-path of nodeHashes together with the encoding of which side each is on
}

function orderBeforeConcatenation(order, pair) {
  if (parseInt(order, 10) === 1) {
    return pair;
  }
  return pair.reverse();
}

export function checkRoot(commitment, path, root) {
  // define Merkle Constants:
  const { MERKLE_DEPTH, MERKLE_HASHLENGTH } = config;

  console.log(`commitment:`, commitment);
  const truncatedCommitment = commitment.slice(-MERKLE_HASHLENGTH * 2); // truncate to the desired 216 bits for Merkle Path computations
  // console.log(`truncatedCommitment:`, truncatedCommitment);
  // console.log(`path:`);
  // console.log(path.path);
  // console.log(`path positions hex`);
  // console.log(path.positions);
  const order = hexToBin(path.positions);
  // console.log(`root:`, root);

  let hash216 = truncatedCommitment;
  let hash256;

  for (let r = MERKLE_DEPTH - 1; r > 0; r -= 1) {
    const pair = [hash216, path.path[r]];
    const orderedPair = orderBeforeConcatenation(order[r - 1], pair);
    hash256 = concatenateThenHash(...orderedPair);
    // keep the below comments for future debugging:
    // console.log(`hash pre-slice at row ${r - 1}:`, hash256);
    hash216 = `0x${hash256.slice(-MERKLE_HASHLENGTH * 2)}`;
    // console.log(`hash at row ${r - 1}:`, hash216);
  }

  const rootCheck = hash256;

  if (root !== rootCheck) {
    throw new Error(
      `Root ${root} cannot be recalculated from the path and commitment ${commitment}. An attempt to recalculate gives ${rootCheck} as the root.`,
    );
  } else {
    console.log(
      '\nRoot successfully reconciled from first principles using the commitment and its sister-path.',
    );
  }
}

module.exports = {
  isHex,
  utf8StringToHex,
  hexToUtf8String,
  ensure0x,
  strip0x,
  hexToBin,
  hexToBinSimple,
  hexToBytes,
  hexToDec,
  hexToField,
  hexToFieldPreserve,
  decToHex,
  decToBin,
  binToDec,
  binToHex,
  isProbablyBinary,
  fieldsToDec,
  xor,
  concatenate,
  hash,
  concatenateThenHash,
  add,
  parseToDigitsArray,
  convertBase,
  splitDecToBitsN,
  splitHexToBitsN,
  splitAndPadBitsN,
  leftPadBitsN,
  getLeafIndexFromZCount,
  rndHex,
  flattenDeep,
  padHex,
  leftPadHex,
};
