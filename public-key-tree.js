const { PUBLIC_KEY_TREE_HEIGHT, ZOKRATES_PRIME } = require('./config');

const FIRST_LEAF_INDEX = 2 ** PUBLIC_KEY_TREE_HEIGHT - 1;
/**
This function queries the Merkle tree held in PublicKeyTree.sol and returns
the sibling path from the provided leaf (key) up to the root. The root is also
returned as element 0 of the sibling path.
@param {object} contractInstance - and instance of the contract that inherits PublicKeyTree.sol
@param {string} key - the public key leaf that the path is to be computed for
*/
async function getPublicKeyTreeData(contractInstance, _key) {
  const key = `0x${(BigInt(_key) % ZOKRATES_PRIME).toString(16)}`;
  const commitmentIndex = await contractInstance.L.call(key);
  const siblingPath = []; // sibling path
  let s = 0; // index of sibling path node in the merkle tree
  let t = 0; // temp index for next highest path node in the merkle tree
  let p = commitmentIndex.toNumber();

  const leafIndex = commitmentIndex - FIRST_LEAF_INDEX;
  if (leafIndex < 0) {
    throw Error('Publickey is not added yet, do a mint commitment to new user\'s publickey to get added');
  }
  for (let r = PUBLIC_KEY_TREE_HEIGHT; r > 0; r--) {
    if (p % 2 === 0) {
      s = p - 1;
      t = Math.floor((p - 1) / 2);
    } else {
      s = p + 1;
      t = Math.floor(p / 2);
    }
    siblingPath[r] = contractInstance.M.call(s);
    p = t;
  }
  siblingPath[0] = contractInstance.M.call(0); // store the root value here

  return {
    leafIndex,
    siblingPath: await Promise.all(siblingPath),
  };
}

module.exports = { getPublicKeyTreeData };
