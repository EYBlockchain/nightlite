/**
functions to support El-Gamal encryption over a BabyJubJub curve
*/

const { squareRootModPrime, addMod, mulMod } = require('./number-theory');
const { BABYJUBJUB, ZOKRATES_PRIME, TEST_PRIVATE_KEYS } = require('./config');
const { modDivide } = require('./modular-division'); // TODO REPLACE WITH NPM VERSION
const utils = require('./utils');

const one = BigInt(1);
const { JUBJUBE, JUBJUBC, JUBJUBD, JUBJUBA, GENERATOR } = BABYJUBJUB;
const Fp = BigInt(ZOKRATES_PRIME); // the prime field used with the curve E(Fp)
const Fq = JUBJUBE / JUBJUBC;
const AUTHORITY_PRIVATE_KEYS = [];
const AUTHORITY_PUBLIC_KEYS = [];

function isOnCurve(p) {
  const { JUBJUBA: a, JUBJUBD: d } = BABYJUBJUB;
  const uu = (p[0] * p[0]) % Fp;
  const vv = (p[1] * p[1]) % Fp;
  const uuvv = (uu * vv) % Fp;
  return (a * uu + vv) % Fp === (one + d * uuvv) % Fp;
}

function negate(g) {
  return [Fp - g[0], g[1]]; // this is wierd - we negate the x coordinate, not the y with babyjubjub!
}

/**
Point addition on the babyjubjub curve TODO - MOD P THIS
*/
function add(p, q) {
  const { JUBJUBA: a, JUBJUBD: d } = BABYJUBJUB;
  const u1 = p[0];
  const v1 = p[1];
  const u2 = q[0];
  const v2 = q[1];
  const uOut = modDivide(u1 * v2 + v1 * u2, one + d * u1 * u2 * v1 * v2, Fp);
  const vOut = modDivide(v1 * v2 - a * u1 * u2, one - d * u1 * u2 * v1 * v2, Fp);
  if (!isOnCurve([uOut, vOut])) throw new Error('Addition point is not on the babyjubjub curve');
  return [uOut, vOut];
}

/**
Scalar multiplication on a babyjubjub curve
@param {String} scalar - scalar mod q (will wrap if greater than mod q, which is probably ok)
@param {Object} h - curve point in u,v coordinates
*/
function scalarMult(scalar, h) {
  const { INFINITY } = BABYJUBJUB;
  const a = ((BigInt(scalar) % Fq) + Fq) % Fq; // just in case we get a value that's too big or negative
  const exponent = a.toString(2).split(''); // extract individual binary elements
  let doubledP = [...h]; // shallow copy h to prevent h being mutated by the algorithm
  let accumulatedP = INFINITY;
  for (let i = exponent.length - 1; i >= 0; i--) {
    const candidateP = add(accumulatedP, doubledP);
    accumulatedP = exponent[i] === '1' ? candidateP : accumulatedP;
    doubledP = add(doubledP, doubledP);
  }
  if (!isOnCurve(accumulatedP))
    throw new Error('Scalar multiplication point is not on the babyjubjub curve');
  return accumulatedP;
}

// function to set the public keys used by the authority for decryption
function setAuthorityPublicKeys() {
  for (let i = 0; i < AUTHORITY_PRIVATE_KEYS.length; i++) {
    if (AUTHORITY_PRIVATE_KEYS[i] === undefined)
      throw new Error('Cannot create public key, private key not set');
    AUTHORITY_PUBLIC_KEYS[i] = scalarMult(AUTHORITY_PRIVATE_KEYS[i], GENERATOR);
  }
}

/** function to set the private keys used by the authority for decryption
@param {Array(String)} keys - array of hex private key strings
*/
function setAuthorityPrivateKeys(keys = TEST_PRIVATE_KEYS) {
  if (keys[0] === TEST_PRIVATE_KEYS[0])
    console.log('DANGER, WILL ROBINSON! INSECURE TEST-KEYS ARE BEING USED!');
  for (let i = 0; i < keys.length; i++) {
    AUTHORITY_PRIVATE_KEYS.push(utils.ensure0x(keys[i]));
  }
  setAuthorityPublicKeys();
}

/**
Performs El-Gamal encryption
@param {Array(String)} strings - array containing the hex strings to be encrypted
@param {String} randomSecret - random value mod Fq.  Must be changed each time
this function is called
*/
function enc(randomSecret, strings) {
  if (AUTHORITY_PUBLIC_KEYS.length < strings.length) {
    console.log('number of authority public keys:', AUTHORITY_PUBLIC_KEYS.length);
    console.log('number of message strings:', strings.length);
    throw new Error(
      'The number of authority public keys must greater than or equal to the number of messages',
    );
  }
  // eslint-disable-next-line valid-typeof
  if (typeof randomSecret !== 'bigint')
    throw new Error(
      'The random secret chosen for encryption should be a BigInt, unlike the messages, which are hex strings',
    );
  // We can't directly encrypt hex strings.  We can encrypt a curve point however,
  // so we convert a string to a curve point by a scalar multiplication
  const messages = strings.map(e => scalarMult(utils.ensure0x(e), GENERATOR));
  // now we use the public keys and random number to generate shared secrets
  const sharedSecrets = AUTHORITY_PUBLIC_KEYS.map(e => {
    if (e === undefined) throw new Error('Trying to encrypt with a undefined public key');
    return scalarMult(randomSecret, e);
  });
  // finally, we can encrypt the messages using the share secrets
  const c0 = scalarMult(randomSecret, GENERATOR);
  const encryptedMessages = messages.map((e, i) => add(e, sharedSecrets[i]));
  const encryption = [c0, ...encryptedMessages];
  // console.log('encryption', encryption);
  return encryption;
}

/**
Decrypt the above
*/
function dec(encryption) {
  const c0 = encryption[0]; // this encrypts the sender's random secret, needed for shared-secret generation
  const encryptedMessages = encryption.slice(1);
  // recover the shared secrets
  const sharedSecrets = AUTHORITY_PRIVATE_KEYS.map(e => {
    if (e === undefined) throw new Error('Trying to decrypt with a undefined private key');
    return scalarMult(e, c0);
  });
  // then decrypt
  const messages = encryptedMessages.map((c, i) => add(c, negate(sharedSecrets[i])));
  return messages;
}

/**
The decryption gives curve points, which were originally mapped to a value.
Unfortunately, reversing that mapping requires brute forcing discrete logarithm.
Forturnately, there aren't many values that we need to check so it's not too onerous
@param {array} m - ordered pair mod q representing the decrypted curve point
@param {generator} gen - generator (implements generator interface) for brute force guesses
*/
function bruteForce(m, gen) {
  for (const guess of gen) {
    const p = scalarMult(guess, GENERATOR);
    if (p[0] === m[0] && p[1] === m[1]) return guess;
  }
  return 'no decrypt found';
}

function* rangeGenerator(max) {
  for (let i = 0; i < max; i++) yield i;
}

/** A useful function that takes a curve point and throws away the x coordinate
retaining only the y coordinate and the odd/eveness of the x coordinate (plays the
part of a sign in mod arithmetic with a prime field).  This loses no information
because we know the curve that relates x to y and the odd/eveness disabiguates the two
possible solutions. So it's a useful data compression.
TODO - probably simpler to use integer arithmetic rather than binary manipulations
*/
function edwardsCompress(p) {
  const px = p[0];
  const py = p[1];
  const xBits = px.toString(2).padStart(256, '0');
  const yBits = py.toString(2).padStart(256, '0');
  const sign = xBits[255] === '1' ? '1' : '0';
  const yBitsC = sign.concat(yBits.slice(1)); // add in the sign bit
  const y = utils.ensure0x(
    BigInt('0b'.concat(yBitsC))
      .toString(16)
      .padStart(64, '0'),
  ); // put yBits into hex
  return y;
}

function edwardsDecompress(y) {
  const py = BigInt(y)
    .toString(2)
    .padStart(256, '0');
  const sign = py[0];
  const yfield = BigInt(`0b${py.slice(1)}`); // remove the sign encoding
  if (yfield > ZOKRATES_PRIME || yfield < 0)
    throw new Error(`y cordinate ${yfield} is not a field element`);
  // 168700.x^2 + y^2 = 1 + 168696.x^2.y^2
  const y2 = mulMod([yfield, yfield]);
  const x2 = modDivide(
    addMod([y2, BigInt(-1)]),
    addMod([mulMod([JUBJUBD, y2]), -JUBJUBA]),
    ZOKRATES_PRIME,
  );
  let xfield = squareRootModPrime(x2);
  const px = BigInt(xfield)
    .toString(2)
    .padStart(256, '0');
  if (px[255] !== sign) xfield = ZOKRATES_PRIME - xfield;
  const p = [xfield, yfield];
  if (!isOnCurve(p)) throw new Error('The computed point was not on the Babyjubjub curve');
  return p;
}

module.exports = {
  rangeGenerator,
  bruteForce,
  dec,
  enc,
  setAuthorityPrivateKeys,
  AUTHORITY_PUBLIC_KEYS,
  scalarMult,
  add,
  edwardsCompress,
  edwardsDecompress,
};
