const config = require('../config/config');
const ethersUtils = require('@eyblockchain/dapp-utils/ethers');
const zokrates = require('@eyblockchain/zokrates.js');
const { recursiveHashConcat, hashConcat } = require('../index');
const { hexToDecimal } = require('../zkp/utils/conversions');
const utils = require('../zkp/utils');
const computeVectors = require('../zkp/computeVectors');
const computePath = require('../zkp/computePath');
const Element = require('../zkp/Element');
const fs = require ('fs');

/**
This function actually transfers a token, assuming that we have a proof.
* @param {string} salt - Alice's token commitment's serial number as a hex string
* @param {string} receiverSalt - Bob's token commitment's serial number as a hex string
* @param {string} tokenId - the token's unique id (this is a full 256 bits)
* @param {string} receiverPublicKey - Bob's public key
* @param {string} secretKey - Alice's private key
* @param {string} tokenCommitmentSender - Alice's token commitment (commitment)
* @param {Integer} senderCommitmentTreeIndex - the position of senderCommitment in the on-chain Merkle Tree
* @param {Object} vkId - vkId for NFT's TransferToken
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
* @returns {string} tokenCommitmentReceiver - The token
* @returns {Integer} receiverCommitmentTreeIndex - the index of the token within the Merkle Tree.  This is required for later transfers/joins so that Alice knows which 'chunks' of the Merkle Tree she needs to 'get' from the NFTokenShield contract in order to calculate a path.
* @returns {object} txObj - a promise of a blockchain transaction
*/
async function transfer(tokenId, receiverPublicKey, salt, receiverSalt, secretKey, tokenCommitmentSender, senderCommitmentTreeIndex, vkId, blockchainOptions, zokratesOptions) {
  console.log('all inputted values: ', tokenId, receiverPublicKey, salt, receiverSalt, secretKey, tokenCommitmentSender, senderCommitmentTreeIndex, vkId, blockchainOptions, zokratesOptions )
  const { nfTokenShieldJson, nfTokenShieldAddress, account } = blockchainOptions;
  const nfTokenShield = ethersUtils.getContractWithSigner(
    nfTokenShieldJson,
    nfTokenShieldAddress,
    account,
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

  // Get token data from the Shield contract:
  const root = await nfTokenShield.latestRoot(); // solidity getter for the public variable latestRoot
  console.log(`Merkle Root: ${root}`);

  // Calculate new arguments for the proof:

  const n = recursiveHashConcat(salt, secretKey);
  if (n !== hashConcat(salt, secretKey))
    throw new Error(`hashConcat and recursiveHashConcat didn't agree`);
  const tokenCommitmentReceiver = recursiveHashConcat(utils.strip0x(tokenId).slice(-config.hashLength * 2), receiverPublicKey, receiverSalt);

  // we need the Merkle path from the token commitment to the root, expressed as Elements
  const path = await computePath(account, nfTokenShield, tokenCommitmentSender, senderCommitmentTreeIndex).then(result => {
    return {
      elements: result.path.map(element => new Element(element, 'field', 2)),
      positions: new Element(result.positions, 'field', 1),
    };
  });
  // check the path and root match:
  if (path.elements[0].hex !== root) {
    throw new Error(`Root inequality: sister-path[0]=${path.elements[0].hex} root=${root}`);
  }

  const vectors = computeVectors([
    new Element(tokenId, 'field'),
    ...path.elements.slice(1),
    path.positions,
    new Element(n, 'field'),
    new Element(receiverPublicKey, 'field'),
    new Element(salt, 'field'),
    new Element(receiverSalt, 'field'),
    new Element(secretKey, 'field'),
    path.elements[0],
    new Element(tokenCommitmentReceiver, 'field'),
  ]);

  await zokrates.computeWitness(codePath, outputDirectory, witnessName, vectors);
  await zokrates.generateProof(pkPath, codePath, `${outputDirectory}/witness`, provingScheme, {
    createFile: createProofJson,
    directory: outputDirectory,
    fileName,
  });

  let { proof } = JSON.parse(fs.readFileSync(`${outputDirectory}/${fileName}`));

  // compute the proof
  console.group('Computing proof with w=[A,path[],receiverPublicKey,salt,receiverSalt,secretKey]  x=[n,root,tokenCommitmentReceiver,1]');
  console.log('proof ',  proof);

  proof = Object.values(proof);
  // convert to flattened array:
  proof = utils.flattenDeep(proof);
  // convert to decimal, as the solidity functions expect uints
  proof = proof.map(el => hexToDecimal(el));

  const inputs = computeVectors([
    new Element(n, 'field'),
    new Element(root, 'field'),
    new Element(tokenCommitmentReceiver, 'field'),
  ]);

  const finalInputs = [...inputs, '1']; // TODO: Took this from the mint function
  // Transfer a commitment from the token shield contract.
  const transferReceipt = await nfTokenShield.transfer(proof, finalInputs, vkId);
  const transferWaited = await transferReceipt.wait();

  const [transferLog] = transferWaited.events.filter( event => {
    if (event.event !== 'Transfer') return false;
    return true;
  });

  // Get the event that we're looking for.
  const receiverCommitmentTreeIndex = transferLog.args.token_index.toString();

  return {
    tokenCommitmentReceiver,
    receiverCommitmentTreeIndex,
  };
}

module.exports = transfer;