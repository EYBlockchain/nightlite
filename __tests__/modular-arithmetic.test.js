// tests for various aspects of modular arithmetic and related functions
const { scalarMult, edwardsCompress, edwardsDecompress } = require('../elgamal');
const { BABYJUBJUB } = require('../config');
const { randomHex } = require('../utils');

const SIZE = 100;

describe('Edwards compression tests', () => {
  test(`Compress and then decompress an array of ${SIZE} curve points`, async () => {
    // first, lets generate 100 random scalars up to 31 bytes long
    const promises = [];
    for (let i = 0; i < SIZE; i++) promises.push(randomHex(31));
    const scalars = await Promise.all(promises);
    // then, turn them into curve points
    const points = scalars.map(s => scalarMult(s, BABYJUBJUB.GENERATOR));
    // compress them, decompress them and see if we get the same points back
    const compressed = points.map(p => edwardsCompress(p));
    const decompressed = compressed.map(e => edwardsDecompress(e));
    expect(points).toEqual(decompressed);
  });
});
