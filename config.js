module.exports = {
  LEAF_HASHLENGTH: 32, // expected length of an input to a hash in bytes
  NODE_HASHLENGTH: 27,
  BATCH_PROOF_SIZE: 20, // the number of proofs in a batch (you will need to redo the proofs if oyu change this)
  ZOKRATES_PACKING_SIZE: '128', // ZOKRATES_PRIME is approx 253-254bits (just shy of 256), so we pack field elements into blocks of 128 bits.
  GASPRICE: 20000000000,
  POLLING_FREQUENCY: 6000, // How many milliseconds to wait between each poll
  TREE_HEIGHT: 32,
};
