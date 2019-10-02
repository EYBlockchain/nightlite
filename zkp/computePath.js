const config = require('../config/config');
const utils = require('./utils');

/**
@notice gets a node from the merkle tree data from the nfTokenShield contract.
@param {string} account - the account that is paying for the transactions
@param {contract} nfTokenShield - an instance of the nfTokenShield smart contract
@param {integer} index - the index of the token in the merkle tree, which we want to get from the nfTokenShield contract.
@returns {Array[integer,Array[string,...]]} [chunkNumber, chunks[]] - where chunkNumber is the same as the input chunkNumber (returned for convenience), and chunks[] is an array of hex strings which represent token commitments (leaf nodes) or non-leaf nodes of the merkle tree.
*/
async function getMerkleNode(account, shieldContract, index) {
  // get the chunk
  const node = await shieldContract.M.call(index, { from: account });
  return node;
}

/**
 * Computes path through Merkle tree to get from a token to the root.
 *
 * This is needed for part of the private input
 * to proofs that need demonstrate that a token is in a Merkle tree.
 * It works for any size of Merkle tree, it just needs to know the tree depth, which it gets from config.js
 * @param {String} account - the account that is paying for these transactions
 * @param {Contract} shieldContract - instance of the shield contract that holds the tokens to be joined
 * @param {Array} myToken - the set of n tokens/committments (those not yet used will be 0) returned from TokenShield.sol
 * @param {Number} myTokenIndex - the index within the shield contract of the merkle tree of the token we're calculating the witness for
 * @returns {Object} an array of strings - where each element of the array is a node of the sister-path of
 * the path from myToken to the Merkle Root and whether the sister node is to the left or the right (this is needed because the order of hashing matters)
 */
async function computePath(account, shieldContract, _myToken, myTokenIndex) {
  const { hashLength } = config;
  const myToken = utils.strip0x(_myToken);
  if (myToken.length !== hashLength * 2) {
    throw new Error(`tokens have incorrect length: ${myToken}`);
  }
  const leafIndex = utils.getLeafIndexFromZCount(myTokenIndex);

  // define Merkle Constants:
  const { merkleDepth } = config;

  // get the relevant token data from the contract
  let p = []; // direct path
  let p0 = leafIndex; // index of path node in the merkle tree
  let node = await getMerkleNode(account, shieldContract, p0);
  node = utils.strip0x(node);
  if (node !== myToken)
    throw new Error(
      `Failed to find the token commitment, ${myToken} in the on-chain Merkle Tree at the specified index ${p0}. Found ${node} at this index instead.`,
    );

  let nodeHash;
  // now we've verified the location of myToken in the Merkle Tree, we can extract the rest of the path and the sister-path:
  let s = []; // sister path
  let s0 = 0; // index of sister path node in the merkle tree
  let t0 = 0; // temp index for next highest path node in the merkle tree

  let sisterSide = '';

  for (let r = merkleDepth - 1; r > 0; r -= 1) {
    if (p0 % 2 === 0) {
      // p even
      s0 = p0 - 1;
      t0 = Math.floor((p0 - 1) / 2);
      sisterSide = '0'; // if p is even then the sister will be on the left. Encode this as 0
    } else {
      // p odd
      s0 = p0 + 1;
      t0 = Math.floor(p0 / 2);
      sisterSide = '1'; // conversely if p is odd then the sister will be on the right. Encode this as 1
    }

    nodeHash = getMerkleNode(account, shieldContract, p0);
    p[r] = {
      merkleIndex: p0,
      nodeHashOld: nodeHash,
    };

    nodeHash = getMerkleNode(account, shieldContract, s0);
    s[r] = {
      merkleIndex: s0,
      nodeHashOld: nodeHash,
      sisterSide,
    };

    p0 = t0;
  }
  // separate case for the root:
  nodeHash = getMerkleNode(account, shieldContract, 0);
  p[0] = {
    merkleIndex: 0,
    nodeHashOld: nodeHash,
  };
  // the root strictly has no sister-node and destructuring is not the way to go here:
  s[0] = p[0]; // eslint-disable-line prefer-destructuring

  // and strip the '0x' from s and p
  s = s.map(async el => {
    return {
      merkleIndex: el.merkleIndex,
      sisterSide: el.sisterSide,
      nodeHashOld: utils.strip0x(await el.nodeHashOld),
    };
  });
  p = p.map(async el => {
    return {
      merkleIndex: el.merkleIndex,
      nodeHashOld: utils.strip0x(await el.nodeHashOld),
    };
  });

  p = await Promise.all(p);
  s = await Promise.all(s);

  // check the lengths of the hashes of the path and the sister-path - they should all be a set length:
  for (let i = 0; i < p.length; i += 1) {
    p[i].nodeHashOld = utils.strip0x(p[i].nodeHashOld);
    if (p[i].nodeHashOld.length !== 0 && p[i].nodeHashOld.length !== hashLength * 2)
      throw new Error(`path nodeHash has incorrect length: ${p[i].nodeHashOld}`);
    if (s[i].nodeHashOld.length !== 0 && s[i].nodeHashOld.length !== hashLength * 2)
      throw new Error(`sister path nodeHash has incorrect length: ${s[i].nodeHashOld}`);
  }

  const sisterPositions = utils.binToHex(
    s
      .map(pos => pos.sisterSide)
      .join('')
      .padEnd(config.zokratesPackingSize, '0'),
  ); // create a hex encoding of all the sister positions
  return { path: s.map(pos => utils.ensure0x(pos.nodeHashOld)), positions: sisterPositions }; // return the sister-path of nodeHashes together with the encoding of which side each is on
}

module.exports = computePath;
