const config = require('config');
const ethersUtils = require('@eyblockchain/dapp-utils/ethers');
const zokrates = require('@eyblockchain/zokrates.js');
const nfTokenJson = require('../build/contracts/ERC721Interface.json');
const utils = require('../zkp/utils');
const computeVectors = require('../zkp/computeVectors');
const Element = require('../zkp/Element');

/**
 * Mint a commitment
 * @param {string} tokenId - the asset token
 * @param {string} ownerPublicKey - Address of the token owner
 * @param {string} salt - Alice's token serial number as a hex string
 * @param {Object} vkId - vkId for NFT's MintToken
 * @param {Object} blockchainOptions
 * @param {String} blockchainOptions.nfTokenShieldJson - ABI of nfTokenShield
 * @param {String} blockchainOptions.nfTokenShieldAddress - Address of deployed nfTokenShieldContract
 * @param {String} blockchainOptions.account - Account that is sending htese transactions
 * @param {Object} zokratesOptions
 * @param {String} zokratesOptions.codePath - Location of compiled code (without the .code suffix)
 * @param {String} [zokratesOptions.outputDirectory=./] - Directory to output all generated files
 * @param {String} [zokratesOptions.witnessName=witness] - Name of witness file
 * @param {String} [zokratesOptions.pkPath] - Location of the proving key file
 * @param {Boolean} zokratesOptions.createProofJson - Whether or not to create a proof.json file
 * @param {String} [zokratesOptions.proofName=proof.json] - Name of generated proof JSON.
 * @returns {String} tokenCommitmentSender
 * @returns {Number} senderCommitmentTreeIndex - the index of the token within the Merkle Tree.  This is required for later transfers/joins so that Alice knows which 'chunks' of the Merkle Tree she needs to 'get' from the NFTokenShield contract in order to calculate a path.
 */
async function mint(tokenId, ownerPublicKey, salt, vkId, blockchainOptions, zokratesOptions) {
  const { nfTokenShieldJson, nfTokenShieldAddress, account } = blockchainOptions;
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

  const {
    codePath,
    outputDirectory,
    witnessName,
    pkPath,
    provingScheme,
    createProofJson,
    proofName,
  } = zokratesOptions;

  await zokrates.computeWitness(
    codePath,
    outputDirectory,
    witnessName,
    computeVectors([
      new Element(tokenId, 'field'),
      new Element(ownerPublicKey, 'field'),
      new Element(salt, 'field'),
      new Element(tokenCommitmentSender, 'field'),
    ]),
  );

  let proof = await zokrates.generateProof(pkPath, codePath, provingScheme, {
    createFile: createProofJson,
    directory: outputDirectory,
    fileName: proofName,
  });

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

  // Mint a commitment on the token shield contract.
  const inputs = computeVectors([
    new Element(tokenId, 'field'),
    new Element(tokenCommitmentSender, 'field'),
  ]);
  const finalInputs = [...inputs, '1']; // TODO: Not sure why the last 1 is necessary.
  const mintReceipt = await nfTokenShield.mint(proof, finalInputs, vkId);
  const { senderCommitmentTreeIndex } = mintReceipt.logs[0].args;

  return {
    tokenCommitmentSender,
    senderCommitmentTreeIndex,
  };
}

module.export = mint;
