const ethersUtils = require('@eyblockchain/dapp-utils/ethers');
const zokrates = require('@eyblockchain/zokrates.js');
const fs = require('fs');
const utils = require('../zkp/utils');
const conversions = require('../zkp/utils/conversions');
const { recursiveHashConcat, hashConcat } = require('../index');
const computeVectors = require('../zkp/computeVectors');
const computePath = require('../zkp/computePath');
const Element = require('../zkp/Element');

/**
 * Mint a commitment
 * @param {string} tokenId - the asset token
 * @param {String} secretKey - Secret key of sender
 * @param {String} salt
 * @param {String} vkId
 * @param {String} commitment - Commitment of token to be burned
 * @param {String} commitmentIndex
 * @param {String} tokenReceiver - Receiver of token
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
async function burn(
  tokenId,
  secretKey,
  salt,
  vkId,
  commitment,
  commitmentIndex,
  tokenReceiver,
  blockchainOptions,
  zokratesOptions,
) {
  const { nfTokenShieldJson, nfTokenShieldAddress, account } = blockchainOptions;
  const nfTokenShield = ethersUtils.getContractWithSigner(
    nfTokenShieldJson,
    nfTokenShieldAddress,
    account,
  );

  // solidity getter for the public variable latestRoot
  const root = await nfTokenShield.latestRoot();

  // Calculate new arguments for the proof:
  const newArguments = recursiveHashConcat(salt, secretKey);
  if (newArguments !== hashConcat(salt, secretKey))
    throw new Error(`hashConcat and recursiveHashConcat didn't agree`);

  const path = await computePath(account, nfTokenShield, commitment, commitmentIndex).then(
    result => {
      return {
        elements: result.path.map(element => new Element(element, 'field', 2)),
        positions: new Element(result.positions, 'field', 1),
      };
    },
  );

  // check the path and root match:
  if (path.elements[0].hex !== root) {
    throw new Error(`Root inequality: sister-path[0]=${path.elements[0].hex} root=${root}`);
  }

  const {
    codePath,
    outputDirectory,
    witnessName,
    pkPath,
    provingScheme,
    createProofJson,
  } = zokratesOptions;

  const proofName = zokratesOptions.proofName || 'proof.json';

  const witnessVectors = computeVectors([
    new Element(tokenReceiver, 'field'),
    new Element(tokenId, 'field'),
    new Element(secretKey, 'field'),
    new Element(salt, 'field'),
    ...path.elements.slice(1),
    path.positions,
    new Element(newArguments, 'field'),
    new Element(root, 'field'),
  ]);

  await zokrates.computeWitness(codePath, outputDirectory, witnessName, witnessVectors);

  await zokrates.generateProof(pkPath, codePath, `${outputDirectory}/witness`, provingScheme, {
    createFile: createProofJson,
    directory: outputDirectory,
    fileName: proofName,
  });

  let { proof } = JSON.parse(fs.readFileSync(`${outputDirectory}/${proofName}`));

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
  proof = proof.map(el => conversions.hexToDecimal(el));

  const inputs = computeVectors([
    new Element(tokenReceiver, 'field'),
    new Element(tokenId, 'field'),
    new Element(newArguments, 'field'),
    new Element(root, 'field'),
  ]);
  const finalInputs = [...inputs, '1'];

  await nfTokenShield.burn(proof, finalInputs, vkId);

  return { commitment };
}

module.exports = burn;
