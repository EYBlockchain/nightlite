// tests for various aspects of modular arithmetic and related functions
const fc = require('fast-check');
const { randomHex } = require('zkp-utils');
const {
  add,
  enc,
  dec,
  scalarMult,
  setAuthorityPrivateKeys,
  bruteForce,
  rangeGenerator,
  edwardsCompress,
  edwardsDecompress,
} = require('../elgamal');
const { BABYJUBJUB, ZOKRATES_PRIME } = require('../config');
const { squareRootModPrime } = require('../number-theory');

const SIZE = 100;
jest.setTimeout(72000);

describe('Random Hex tests', () => {
  test(`Finds random hex of 31 bytes smaller than Fq`, async () => {
    const a = [];
    for (let i = 0; i < 3; i++) a.push(randomHex(31, ZOKRATES_PRIME));
    let b = await Promise.all(a);
    b = b.map(elt => BigInt(elt, 16));
    const c = (b[0] < ZOKRATES_PRIME).toString();
    expect(c).toBe('true');
  });
});

describe('Edwards compression tests', () => {
  test(`Compress and then decompress ${SIZE} random curve points`, async () => {
    // Generate random BigInt,a,between 0 and the Zokrates Prime
    // Check the property that (decompress . compress) === id
    // remember, points mean prizes.
    fc.assert(
      fc.property(fc.bigInt(0n, ZOKRATES_PRIME), a => {
        const point = scalarMult(a.toString(), BABYJUBJUB.GENERATOR);
        expect(edwardsDecompress(edwardsCompress(point))).toEqual(point);
      }),
      { numRuns: SIZE },
    );
  });
});

describe('Elliptic curve arithmetic tests', () => {
  const scalar1 = fc.bigInt(0n, ZOKRATES_PRIME);
  const scalar2 = fc.bigInt(0n, ZOKRATES_PRIME);
  const authorityPrivateKeys = fc.set(fc.bigInt(0n, ZOKRATES_PRIME), 2, 30); // Generate between 2 & 30 authority keys - seems reasonable
  const smallMsgs = fc.array(fc.nat(2500), 2, authorityPrivateKeys.length); // Generate a number (up to the number of authority keys) of small valued messages

  test(`Multiply & Add`, async () => {
    // Generate two random scalars, s1 & s2
    // then, turn them into curve points, p1 = s1G & p2 = s2G
    // Test the property that s1G + s2G === (s1 + s2)G
    fc.assert(
      fc.property(scalar1, scalar2, (x1, x2) => {
        const p1 = scalarMult(x1.toString(), BABYJUBJUB.GENERATOR);
        const p2 = scalarMult(x2.toString(), BABYJUBJUB.GENERATOR);
        expect(add(p1, p2)).toEqual(scalarMult((x1 + x2).toString(), BABYJUBJUB.GENERATOR));
      }),
      { numRuns: 50 },
    );
  });

  test(`Encrypt - Decrypt Invariance`, async () => {
    // Generate a set of authority private keys and corresponding low-valued messages (to reduce brute force time)
    // Test the property that (decrypt . encrypt) === id, for those with knowledge of authority private keys.
    fc.assert(
      fc.property(scalar1, authorityPrivateKeys, smallMsgs, (x1, authKeys, msgs) => {
        setAuthorityPrivateKeys(authKeys);
        const encr = enc(
          x1,
          msgs.map(msg => msg.toString(16)),
        );
        const decr = dec(encr);
        const decrd = decr.map(decrypt => bruteForce(decrypt, rangeGenerator(3000)));
        expect(msgs.map(e => BigInt(e))).toEqual(decrd.map(e => BigInt(e)));
      }),
      { numRuns: 3 }, // Limit to 3 runs as bruteForce is time consuming
    );
  });
});

describe('Number theory tests', () => {
  test(`Correctly give a modular square root`, async () => {
    const n = BigInt('367754678987654567222357890866781');
    const a = squareRootModPrime(n, ZOKRATES_PRIME);
    console.log(n, ZOKRATES_PRIME, a);
    const b = (ZOKRATES_PRIME - a) % ZOKRATES_PRIME;
    expect([a, BigInt(b)]).toEqual(
      expect.arrayContaining([
        BigInt('19825046851317813000674289201444641078897404400231490066066723878645625579997'),
        BigInt('2063196020521462221572116543812634009650960000184544277631480307930182915620'),
      ]),
    );
  });
  test(`Now do it again!`, async () => {
    const n = BigInt(
      '2063196020521462221572116543812634009650960000184544277631480307930182915884',
    );
    const a = squareRootModPrime(n, ZOKRATES_PRIME);
    const b = (ZOKRATES_PRIME - a) % ZOKRATES_PRIME;
    expect([a, BigInt(b)]).toEqual(
      expect.arrayContaining([
        BigInt('1697173238581785465649014476688881419465269941160500191783655439519552779166'),
        BigInt('20191069633257489756597391268568393669083094459255534151914548747056255716451'),
      ]),
    );
  });
});
