const ethersUtils = require('@eyblockchain/dapp-utils/ethers');
const zokrates = require('@eyblockchain/zokrates.js');
const fs = require('fs');
const config = require('../config/config');
const nfTokenJson = require('../contracts/NFTokenMetadata.json');
const utils = require('../zkp/utils');
const { recursiveHashConcat } = require('../index');
const { hexToDecimal } = require('../zkp/utils/conversions');
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
 * @param {String} blockchainOptions.account - Account that is sending these transactions
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
  const tokenCommitmentSender = recursiveHashConcat(
    utils.strip0x(tokenId).slice(-config.hashLength * 2),
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

  const fileName = proofName || 'proof.json';

  const vectors = computeVectors([
    new Element(tokenId, 'field'),
    new Element(ownerPublicKey, 'field'),
    new Element(salt, 'field'),
    new Element(tokenCommitmentSender, 'field'),
  ]);

  await zokrates.computeWitness(codePath, outputDirectory, witnessName, vectors);

  await zokrates.generateProof(pkPath, codePath, `${outputDirectory}/witness`, provingScheme, {
    createFile: createProofJson,
    directory: outputDirectory,
    fileName,
  });

  let { proof } = JSON.parse(fs.readFileSync(`${outputDirectory}/${fileName}`));

  // check the proof for reasonableness
  if (proof.a === undefined || proof.b === undefined || proof.c === undefined) {
    console.log('\nproof.a', proof.a, '\nproof.b', proof.b, '\nproof.c', proof.c);
    throw new Error('proof object does not contain a,b, or c parameter(s)');
  }

  // TODO: This is an artifact from open source Nightfall, as it expects uppercase keys.
  // We should change this when possible.
  proof.A = proof.a;
  proof.B = proof.b;
  proof.C = proof.c;

  proof = Object.values(proof);
  // convert to flattened array:
  proof = utils.flattenDeep(proof);
  // convert to decimal, as the solidity functions expect uints
  proof = proof.map(el => hexToDecimal(el));

  // make token shield contract an approver to transfer this token on behalf of the owner
  // (to comply with the standard as msg.sender has to be owner or approver)
  // TODO: None of this is tested at all.
  const nfTokenAddress = await nfTokenShield.getNFToken();
  // Uses a generic ERC721Interface as its JSON.
  const nfTokenContract = ethersUtils.getContractWithSigner(nfTokenJson, nfTokenAddress, account);
  await nfTokenContract.approve(nfTokenShield.address, tokenId); // Correct reference for address?

  // Mint a commitment on the token shield contract.
  const inputs = computeVectors([
    new Element(tokenId, 'field'),
    new Element(tokenCommitmentSender, 'field'),
  ]);
  const finalInputs = [...inputs, '1']; // TODO: Not sure why the last 1 is necessary.
  const mintReceipt = await nfTokenShield.mint(proof, finalInputs, vkId);
  const mintWaited = await mintReceipt.wait();

  // Get the event that we're looking for. This may not work if we're sending many "Mint" transactions simultaneously.
  const [mintLog] = mintWaited.events.filter(event => {
    if (event.event !== 'Mint') return false;
    return true;
  });

  const senderCommitmentTreeIndex = mintLog.args.token_index.toString();

  return {
    tokenCommitmentSender,
    senderCommitmentTreeIndex,
  };
}

module.exports = mint;
