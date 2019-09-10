const config = require('config');
const ethersUtils = require('@eyblockchain/dapp-utils/ethers');
const nfTokenJson = require('../build/contracts/ERC721Interface.json');
const utils = require('../zkp/utils');
const computeVectors = require('../zkp/computeVectors');
const Element = require('../zkp/Element');

// TODO: Replace with zokrates.
const zokrates = null;

/**
 * Mint a commitment
 * @param {string} tokenId - the asset token
 * @param {string} ownerPublicKey - Address of the token owner
 * @param {string} salt - Alice's token serial number as a hex string
 * @param {string} account - Account that sends the transaction.
 * @param {Object} vkId - vkId for NFT's MintToken
 * @returns {string} z_A - The token
 * This is a convenience because the sender (Alice)
 * knows S_A,pk_A,n and n so could in fact calculate the token themselves.
 * @returns {Integer} z_A_index - the index of the token within the Merkle Tree.  This is required for later transfers/joins so that Alice knows which 'chunks' of the Merkle Tree she needs to 'get' from the NFTokenShield contract in order to calculate a path.
 */
async function mint(
  tokenId,
  ownerPublicKey,
  salt,
  account,
  vkId,
  nfTokenShieldJson,
  nfTokenShieldAddress,
) {
  const nfTokenShield = ethersUtils.getContractWithSigner(
    nfTokenShieldJson,
    nfTokenShieldAddress,
    account,
  );

  // Calculate new arguments for the proof:
  const tokenCommitmentSender = utils.recursiveHashConcat(
    utils.strip0x(tokenId).slice(-config.get('hashLength') * 2),
    ownerPublicKey,
    salt,
  );

  const inputs = computeVectors([
    new Element(tokenId, 'field'),
    new Element(tokenCommitmentSender, 'field'),
  ]);

  const hostDir = config.NFT_MINT_DIR;

  // compute the proof
  // TODO: Integrate new zokrates.
  let proof = await zokrates.computeProof(
    [
      new Element(tokenId, 'field'),
      new Element(ownerPublicKey, 'field'),
      new Element(salt, 'field'),
      new Element(tokenCommitmentSender, 'field'),
    ],
    hostDir,
    'MintToken',
  );

  proof = Object.values(proof);
  // convert to flattened array:
  proof = utils.flattenDeep(proof);
  // convert to decimal, as the solidity functions expect uints
  proof = proof.map(el => utils.hexToDec(el));

  // make token shield contract an approver to transfer this token on behalf of the owner
  // (to comply with the standard as msg.sender has to be owner or approver)
  // TODO: None of this is tested at all.
  const nfTokenAddress = await nfTokenShield.getNFToken();
  // Uses a generic ERC721Interface as its JSON.
  const nfTokenContract = ethersUtils.getContractWithSigner(nfTokenJson, nfTokenAddress, account);
  await nfTokenContract.approve(nfTokenShield.address); // Correct reference for address?

  // Mint a commitment. (Commitmint, if you will).
  const finalInputs = [...inputs, '1']; // TODO: Not sure why the last 1 is necessary.
  const mintReceipt = await nfTokenShield.mint(proof, finalInputs, vkId);
  const { senderCommitmentTreeIndex } = mintReceipt.logs[0].args;

  return {
    tokenCommitmentSender,
    senderCommitmentTreeIndex,
  };
}

module.export = mint;
