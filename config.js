const nodeHashLength = process.env.HASH_TYPE === 'mimc' ? 32 : 27;

module.exports = {
  LEAF_HASHLENGTH: 32, // expected length of an input to a hash in bytes
  NODE_HASHLENGTH: nodeHashLength,
  HASH_TYPE: process.env.HASH_TYPE,
  BATCH_PROOF_SIZE: 20, // the number of proofs in a batch (you will need to redo the proofs if oyu change this)
  ZOKRATES_PACKING_SIZE: 128, // ZOKRATES_PRIME is approx 253-254bits (just shy of 256), so we pack field elements into blocks of 128 bits.
  GASPRICE: 20000000000,
  POLLING_FREQUENCY: 6000, // How many milliseconds to wait between each poll
  TREE_HEIGHT: 32,
  PUBLIC_KEY_TREE_HEIGHT: 32, // Height of the PUBLIC KEY Merkle tree (defined so that of there was just a root, height would be 0)
  // *****

  // the various parameters needed to describe the Babyjubjub curve that we use for El-Gamal
  BABYJUBJUB: {
    JUBJUBA: BigInt(168700),
    JUBJUBD: BigInt(168696),
    INFINITY: [BigInt(0), BigInt(1)],
    GENERATOR: [
      BigInt('16540640123574156134436876038791482806971768689494387082833631921987005038935'),
      BigInt('20819045374670962167435360035096875258406992893633759881276124905556507972311'),
    ],
    JUBJUBE: BigInt(
      '21888242871839275222246405745257275088614511777268538073601725287587578984328',
    ),
    JUBJUBC: BigInt(8),
    MONTA: BigInt(168698),
    MONTB: BigInt(1),
  },
  // Private keys we can use for test purposes
  TEST_PRIVATE_KEYS: [
    BigInt('1725287587578984328'),
    BigInt('1451177726853807360'),
    BigInt('2464057452572750886'),
  ],

  ALLOWED_DECRYPTION_TYPES: {
    Burn: { PUBLIC_INPUTS_START_POSITION: 5, PUBLIC_INPUTS_END_POSITION: 9 },
    Transfer: { PUBLIC_INPUTS_START_POSITION: 6, PUBLIC_INPUTS_END_POSITION: 14 },
  },

  ZOKRATES_PRIME: BigInt(
    '21888242871839275222246405745257275088548364400416034343698204186575808495617',
  ), // decimal representation of the prime p of GaloisField(p)
};
