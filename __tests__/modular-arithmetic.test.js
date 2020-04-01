// tests for various aspects of modular arithmetic and related functions
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
const { BABYJUBJUB, ZOKRATES_PRIME, TEST_PRIVATE_KEYS } = require('../config');
const { randomHex, hash, decToHex } = require('../utils');
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
  test(`Compress and then decompress an array of ${SIZE} curve points`, async () => {
    // first, lets generate 100 random scalars up to 31 bytes long
    const promises = [];
    for (let i = 0; i < SIZE; i++) promises.push(randomHex(31));
    const scalars = await Promise.all(promises);
    // then, turn them into curve points
    const points = scalars.map(s => scalarMult(s, BABYJUBJUB.GENERATOR));
    // compress them, decompress them and see if we get the same points back
    // remember, points mean prizes.
    const compressed = points.map(p => edwardsCompress(p));
    const decompressed = compressed.map(e => edwardsDecompress(e));
    expect(points).toEqual(decompressed);
  });
});

describe('Elliptic curve arithmetic tests', () => {
  const p1 = scalarMult(TEST_PRIVATE_KEYS[0], BABYJUBJUB.GENERATOR);
  const p2 = scalarMult(TEST_PRIVATE_KEYS[1], BABYJUBJUB.GENERATOR);

  test(`Multiply & Add`, async () => {
    // then, turn them into curve points
    const p3 = add(p1, p2);
    const p4 = scalarMult(TEST_PRIVATE_KEYS[0] + TEST_PRIVATE_KEYS[1], BABYJUBJUB.GENERATOR);
    expect(p3).toEqual(p4);
  });

  test(`Encrypt, Decrypt`, async () => {
    // then, turn them into curve points
    setAuthorityPrivateKeys();
    const possiblePubKeys = [];
    for (let i = 0; i < SIZE; i++) possiblePubKeys.push(hash(randomHex(31)));
    let msgs = [decToHex('2500'), possiblePubKeys[24]];
    msgs = await Promise.all(msgs);
    console.log('Original messages:', msgs);
    const encr = enc(
      BigInt('2486479783016228757507651969864099385830549377396139930920515135746522658521'),
      msgs,
    );
    console.log('encryptedMessages:', encr);
    const decr = dec(encr);
    console.log('decryptedMessages:', decr);
    const decrdec = [
      bruteForce(decr[0], rangeGenerator(30000)),
      bruteForce(decr[1], possiblePubKeys),
    ];
    console.log('brute forced decryption:', decrdec);
    expect(msgs.map(e => BigInt(e))).toEqual(decrdec.map(e => BigInt(e)));
  });
});

describe('Number theory tests', () => {
  test(`Correctly give a modular square root`, async () => {
    const n = BigInt('367754678987654567222357890866781');
    const a = squareRootModPrime(n, ZOKRATES_PRIME);
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
