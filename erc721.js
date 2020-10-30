/* eslint no-underscore-dangle: 0 */ // --> ON
/**
 * This module contains the logic needed to interact with the FTokenShield contract,
 * specifically handling the mint, transfer, simpleBatchTransfer, and burn functions for fungible commitments.
 *
 * @module erc721.js
 * @author westlad, Chaitanya-Konda, iAmMichaelConnor
 */
const zokrates = require('@eyblockchain/zokrates.js');
const { strip0x, ensure0x, shaHash, hexToDec, leftPadHex } = require('zkp-utils');
const { GN } = require('general-number');
const fs = require('fs');
const config = require('./config');
const merkleTree = require('./merkleTree');
const utils = require('./utils');
const logger = require('./logger');
const Element = require('./Element');
const { getWeb3ContractInstance, sendSignedTransaction } = require('./contractUtils');

/**
 * Mint a commitment
 * @param {string} tokenId - Token's unique ID
 * @param {string} zkpPublicKey - ZKP public key, see README for more info
 * @param {string} salt - Alice's token serial number as a hex string
 * @param {Object} blockchainOptions
 * @param {String} blockchainOptions.nfTokenShieldAddress - Address of deployed nfTokenShieldContract
 * @param {String} blockchainOptions.erc721Address - Address of ERC721 contract
 * @param {String} blockchainOptions.account - Account that is sending these transactions
 * @param {Object} zokratesOptions
 * @param {String} zokratesOptions.codePath - Location of compiled code (without the .code suffix)
 * @param {String} [zokratesOptions.outputDirectory=./] - Directory to output all generated files
 * @param {String} [zokratesOptions.witnessName=witness] - Name of witness file
 * @param {String} [zokratesOptions.pkPath] - Location of the proving key file
 * @param {Boolean} zokratesOptions.createProofJson - Whether or not to create a proof.json file
 * @param {String} [zokratesOptions.proofName=proof.json] - Name of generated proof JSON.
 * @returns {String} commitment
 * @returns {Number} commitmentIndex - the index of the token within the Merkle Tree.  This is required for later transfers/joins so that Alice knows which 'chunks' of the Merkle Tree she needs to 'get' from the NFTokenShield contract in order to calculate a path.
 */
async function mint(
  tokenId,
  zkpPublicKey,
  salt,
  blockchainOptions,
  zokratesOptions,
  signingMethod = undefined,
) {
  const erc721Address = new GN(blockchainOptions.erc721Address);
  const account = ensure0x(blockchainOptions.account);

  const {
    codePath,
    outputDirectory,
    witnessName = 'witness',
    pkPath,
    provingScheme = 'gm17',
    createProofJson = true,
    proofName = 'proof.json',
  } = zokratesOptions;

  logger.debug('\nIN MINT...');

  const nfTokenShieldInstance = await getWeb3ContractInstance(
    'NFTokenShield',
    blockchainOptions.nfTokenShieldAddress,
  );

  // Calculate new arguments for the proof:
  const commitment = shaHash(
    erc721Address.hex(32),
    strip0x(tokenId).slice(-(config.LEAF_HASHLENGTH * 2)),
    zkpPublicKey,
    salt,
  );

  // Summarize values in the console:
  logger.debug('contractAddress:', erc721Address.hex(32));
  logger.debug('tokenId:', tokenId);
  logger.debug('ownerPublicKey:', zkpPublicKey);
  logger.debug('salt:', salt);

  logger.debug('New Proof Variables:');
  logger.debug('commitment:', commitment);

  const publicInputHash = shaHash(erc721Address.hex(32), tokenId, commitment);
  logger.debug('publicInputHash:', publicInputHash);

  const allInputs = utils.formatInputsForZkSnark([
    new Element(publicInputHash, 'field', 248, 1),
    new Element(erc721Address.hex(32), 'field', 248, 1),
    new Element(tokenId, 'field'),
    new Element(zkpPublicKey, 'field'),
    new Element(salt, 'field'),
    new Element(commitment, 'field'),
  ]);

  await zokrates.computeWitness(codePath, outputDirectory, witnessName, allInputs);

  await zokrates.generateProof(pkPath, codePath, `${outputDirectory}/witness`, provingScheme, {
    createFile: createProofJson,
    directory: outputDirectory,
    fileName: proofName,
  });

  let { proof } = JSON.parse(fs.readFileSync(`${outputDirectory}/${proofName}`));

  proof = Object.values(proof);
  // convert to flattened array:
  proof = utils.flattenDeep(proof);
  // convert to decimal, as the solidity functions expect uints
  proof = proof.map(el => hexToDec(el));

  logger.debug('Getting ERC721 contract instance');
  // Getting the ERC721 contract instance.
  const nfTokenInstance = await getWeb3ContractInstance('ERC721Interface', erc721Address.hex());
  const nfTokenInstanceTx = nfTokenInstance.methods.approve(
    blockchainOptions.nfTokenShieldAddress,
    tokenId,
  );

  if (signingMethod) {
    await sendSignedTransaction(
      await signingMethod(nfTokenInstanceTx.encodeABI(), nfTokenInstance._address),
    );
  } else {
    await nfTokenInstanceTx.send({
      from: account,
      gas: 4000000,
    });
  }

  logger.debug('Minting within the Shield contract');

  const publicInputs = utils.formatInputsForZkSnark([
    new Element(publicInputHash, 'field', 248, 1),
  ]);

  logger.debug('proof:');
  logger.debug(proof);
  logger.debug('public inputs:');
  logger.debug(publicInputs);

  // Mint the commitment
  const encodedRawTransaction = nfTokenShieldInstance.methods.mint(
    erc721Address.hex(32),
    proof,
    publicInputs,
    tokenId,
    commitment,
  );

  let txReceipt;
  if (signingMethod) {
    txReceipt = await sendSignedTransaction(
      await signingMethod(encodedRawTransaction.encodeABI(), nfTokenShieldInstance._address),
    );
  } else {
    txReceipt = await encodedRawTransaction.send({
      from: account,
      gas: 6500000,
      gasPrice: config.GASPRICE,
    });
  }

  const newLeafEvents = await nfTokenShieldInstance.getPastEvents('NewLeaf', {
    filter: { transactionHash: txReceipt.transactionHash },
  });
  logger.debug('root in solidity:', newLeafEvents[0].returnValues.root);
  const commitmentIndex = newLeafEvents[0].returnValues.leafIndex;

  logger.debug('Mint output: [z_A, z_A_index]:', commitment, commitmentIndex.toString());
  logger.debug('MINT COMPLETE\n');

  return { commitment, commitmentIndex };
}

/**
 * This function actually transfers a token, assuming that we have a proof.
 * @param {String} tokenId - the token's unique id (this is a full 256 bits)
 * @param {String} receiverZkpPublicKey
 * @param {String} originalCommitmentSalt
 * @param {String} newCommitmentSalt
 * @param {String} senderZkpPrivateKey
 * @param {String} commitment - Commitment of token being sent
 * @param {Integer} commitmentIndex - the position of commitment in the on-chain Merkle Tree
 * @param {Object} blockchainOptions
 * @param {String} blockchainOptions.erc721Address - Address of ERC721 contract
 * @param {String} blockchainOptions.nfTokenShieldAddress - Address of deployed nfTokenShieldContract
 * @param {String} blockchainOptions.account - Account that is sending these transactions
 * @returns {String} outputCommitment - New commitment
 * @returns {Number} outputCommitmentIndex - the index of the token within the Merkle Tree.  This is required for later transfers/joins so that Alice knows which 'chunks' of the Merkle Tree she needs to 'get' from the NFTokenShield contract in order to calculate a path.
 * @returns {Object} txReceipt - a promise of a blockchain transaction
 */
async function transfer(
  tokenId,
  receiverZkpPublicKey,
  originalCommitmentSalt,
  newCommitmentSalt,
  senderZkpPrivateKey,
  commitment,
  commitmentIndex,
  blockchainOptions,
  zokratesOptions,
  signingMethod = undefined,
) {
  const erc721Address = new GN(blockchainOptions.erc721Address);
  const account = ensure0x(blockchainOptions.account);

  const {
    codePath,
    outputDirectory,
    witnessName = 'witness',
    pkPath,
    provingScheme = 'gm17',
    createProofJson = true,
    proofName = 'proof.json',
  } = zokratesOptions;

  logger.debug('\nIN TRANSFER...');

  const nfTokenShieldInstance = await getWeb3ContractInstance(
    'NFTokenShield',
    blockchainOptions.nfTokenShieldAddress,
  );

  // Calculate new arguments for the proof:
  const nullifier = shaHash(originalCommitmentSalt, senderZkpPrivateKey);
  const outputCommitment = shaHash(
    erc721Address.hex(32),
    strip0x(tokenId).slice(-config.LEAF_HASHLENGTH * 2),
    receiverZkpPublicKey,
    newCommitmentSalt,
  );

  // Get the sibling-path from the token commitment (leaf) to the root. Express each node as an Element class.
  const siblingPath = await merkleTree.getSiblingPath(
    {
      contractName: 'NFTokenShield',
      instance: nfTokenShieldInstance,
    },
    commitment,
    commitmentIndex,
  );

  const root = siblingPath[0];
  // TODO: checkRoot() is not essential. It's only useful for debugging as we make iterative improvements to nightfall's zokrates files. Possibly delete in future.
  merkleTree.checkRoot(commitment, commitmentIndex, siblingPath, root);

  const siblingPathElements = siblingPath.map(
    nodeValue => new Element(nodeValue, 'field', config.NODE_HASHLENGTH * 8, 1),
  ); // we truncate to 216 bits - sending the whole 256 bits will overflow the prime field

  // Summarise values in the console:
  logger.debug('contractAddress:', erc721Address.hex(32));
  logger.debug('tokenId: ', tokenId);
  logger.debug('originalCommitmentSalt:', originalCommitmentSalt);
  logger.debug('newCommitmentSalt:', newCommitmentSalt);
  logger.debug('senderSecretKey:', senderZkpPrivateKey);
  logger.debug('receiverPublicKey:', receiverZkpPublicKey);
  logger.debug('inputCommitment:', commitment);

  logger.debug('New Proof Variables:');
  logger.debug('nullifier:', nullifier);
  logger.debug('outputCommitment:', outputCommitment);
  logger.debug('root:', root);
  logger.debug(`siblingPath:`, siblingPath);
  logger.debug(`commitmentIndex:`, commitmentIndex);

  const publicInputHash = shaHash(root, nullifier, outputCommitment);
  logger.debug('publicInputHash:', publicInputHash);

  const rootElement =
    process.env.HASH_TYPE === 'mimc'
      ? new Element(root, 'field', 256, 1)
      : new Element(root, 'field', 128, 2);

  const allInputs = utils.formatInputsForZkSnark([
    new Element(publicInputHash, 'field', 248, 1),
    new Element(erc721Address.hex(32), 'field', 248, 1),
    new Element(tokenId, 'field'),
    ...siblingPathElements.slice(1),
    new Element(commitmentIndex, 'field', 128, 1), // the binary decomposition of a leafIndex gives its path's 'left-right' positions up the tree. The decomposition is done inside the circuit.
    new Element(nullifier, 'field'),
    new Element(receiverZkpPublicKey, 'field'),
    new Element(originalCommitmentSalt, 'field'),
    new Element(newCommitmentSalt, 'field'),
    new Element(senderZkpPrivateKey, 'field'),
    rootElement,
    new Element(outputCommitment, 'field'),
  ]);

  await zokrates.computeWitness(
    codePath,
    outputDirectory,
    `${commitment}-${witnessName}`,
    allInputs,
  );

  await zokrates.generateProof(
    pkPath,
    codePath,
    `${outputDirectory}/${commitment}-witness`,
    provingScheme,
    {
      createFile: createProofJson,
      directory: outputDirectory,
      fileName: `${commitment}-${proofName}`,
    },
  );

  let { proof } = JSON.parse(fs.readFileSync(`${outputDirectory}/${commitment}-${proofName}`));

  proof = Object.values(proof);
  // convert to flattened array:
  proof = utils.flattenDeep(proof);
  // convert to decimal, as the solidity functions expect uints
  proof = proof.map(el => hexToDec(el));

  logger.debug('Transferring within the Shield contract');

  const publicInputs = utils.formatInputsForZkSnark([
    new Element(publicInputHash, 'field', 248, 1),
  ]);

  logger.debug('proof:');
  logger.debug(proof);
  logger.debug('publicInputs:');
  logger.debug(publicInputs);

  const encodedRawTransaction = nfTokenShieldInstance.methods.transfer(
    proof,
    publicInputs,
    root,
    nullifier,
    outputCommitment,
  );

  let txReceipt;
  if (signingMethod) {
    txReceipt = await sendSignedTransaction(
      await signingMethod(encodedRawTransaction.encodeABI(), nfTokenShieldInstance._address, true),
    );
  } else {
    txReceipt = await encodedRawTransaction.send({
      from: account,
      gas: 6500000,
      gasPrice: config.GASPRICE,
    });
  }

  const newLeafEvents = await nfTokenShieldInstance.getPastEvents('NewLeaf', {
    filter: { transactionHash: txReceipt.transactionHash },
  });
  const outputCommitmentIndex = newLeafEvents[0].returnValues.leafIndex;

  if (fs.existsSync(`${outputDirectory}/${commitment}-${proofName}`))
    fs.unlinkSync(`${outputDirectory}/${commitment}-${proofName}`);

  if (fs.existsSync(`${outputDirectory}/${commitment}-witness`))
    fs.unlinkSync(`${outputDirectory}/${commitment}-witness`);

  logger.debug(`Deleted File ${outputDirectory}/${commitment}-${proofName}`);

  logger.debug('TRANSFER COMPLETE\n');

  return {
    outputCommitment,
    outputCommitmentIndex,
    txReceipt,
  };
}

/**
 * Burns a commitment and returns the token balance to blockchainOptions.tokenReceiver
 * @param {String} tokenId - ID of token
 * @param {String} receiverZkpPrivateKey
 * @param {String} salt - salt of token
 * @param {String} commitment
 * @param {String} commitmentIndex
 * @param {Object} blockchainOptions
 * @param {String} blockchainOptions.erc721Address - Address of ERC721 contract
 * @param {String} blockchainOptions.nfTokenShieldAddress - Address of deployed nfTokenShieldContract
 * @param {String} blockchainOptions.account - Account that is sending these transactions
 */
async function burn(
  tokenId,
  receiverZkpPrivateKey,
  salt,
  commitment,
  commitmentIndex,
  blockchainOptions,
  zokratesOptions,
  signingMethod = undefined,
) {
  const { tokenReceiver: payTo, nfTokenShieldAddress } = blockchainOptions;
  const erc721Address = new GN(blockchainOptions.erc721Address);
  const account = ensure0x(blockchainOptions.account);

  const {
    codePath,
    outputDirectory,
    witnessName = 'witness',
    pkPath,
    provingScheme = 'gm17',
    createProofJson = true,
    proofName = 'proof.json',
  } = zokratesOptions;

  const nfTokenShieldInstance = await getWeb3ContractInstance(
    'NFTokenShield',
    nfTokenShieldAddress,
  );

  const payToOrDefault = payTo || account; // have the option to pay out to another address
  logger.debug('\nIN BURN...');

  // Calculate new arguments for the proof:
  const nullifier = shaHash(salt, receiverZkpPrivateKey);

  // Get the sibling-path from the token commitment (leaf) to the root. Express each node as an Element class.
  const siblingPath = await merkleTree.getSiblingPath(
    {
      contractName: 'NFTokenShield',
      instance: nfTokenShieldInstance,
    },
    commitment,
    commitmentIndex,
  );

  const root = siblingPath[0];
  merkleTree.checkRoot(commitment, commitmentIndex, siblingPath, root);

  const siblingPathElements = siblingPath.map(
    nodeValue => new Element(nodeValue, 'field', config.NODE_HASHLENGTH * 8, 1),
  ); // we truncate to 216 bits - sending the whole 256 bits will overflow the prime field
  const commitmentIndexElement = new Element(commitmentIndex, 'field', 128, 1); // the binary decomposition of a leafIndex gives its path's 'left-right' positions up the tree. The decomposition is done inside the circuit.

  // Summarise values in the console:
  logger.debug('erc721Address:', erc721Address.hex(32));
  logger.debug(`tokenId: ${tokenId}`);
  logger.debug(`secretKey: ${receiverZkpPrivateKey}`);
  logger.debug(`salt: ${salt}`);
  logger.debug(`commitment: ${commitment}`);
  logger.debug(`payTo: ${payToOrDefault}`);
  // left-pad the payToAddress with 0's to fill all 256 bits (64 octets) (so the sha256 function is hashing the same thing as inside the zokrates proof)
  const payToLeftPadded = leftPadHex(payToOrDefault, config.LEAF_HASHLENGTH * 2);
  logger.debug(`payToLeftPadded: ${payToLeftPadded}`);

  logger.debug('New Proof Variables:');
  logger.debug(`nullifier: ${nullifier}`);
  logger.debug(`root: ${root}`);
  logger.debug(`siblingPath:`, siblingPath);
  logger.debug(`commitmentIndexElement:`, commitmentIndexElement);

  // Using padded version of erc721 and payTo to match the publicInputHash
  const publicInputHash = shaHash(erc721Address.hex(32), root, nullifier, tokenId, payToLeftPadded);
  logger.debug('publicInputHash:', publicInputHash);

  const rootElement =
    process.env.HASH_TYPE === 'mimc'
      ? new Element(root, 'field', 256, 1)
      : new Element(root, 'field', 128, 2);

  const allInputs = utils.formatInputsForZkSnark([
    new Element(publicInputHash, 'field', 248, 1),
    new Element(erc721Address.hex(32), 'field', 248, 1),
    new Element(payTo, 'field'),
    new Element(tokenId, 'field'),
    new Element(receiverZkpPrivateKey, 'field'),
    new Element(salt, 'field'),
    ...siblingPathElements.slice(1),
    commitmentIndexElement,
    new Element(nullifier, 'field'),
    rootElement,
  ]);

  await zokrates.computeWitness(
    codePath,
    outputDirectory,
    `${commitment}-${witnessName}`,
    allInputs,
  );

  await zokrates.generateProof(
    pkPath,
    codePath,
    `${outputDirectory}/${commitment}-witness`,
    provingScheme,
    {
      createFile: createProofJson,
      directory: outputDirectory,
      fileName: `${commitment}-${proofName}`,
    },
  );

  let { proof } = JSON.parse(fs.readFileSync(`${outputDirectory}/${commitment}-${proofName}`));

  proof = Object.values(proof);
  // convert to flattened array:
  proof = utils.flattenDeep(proof);
  // convert to decimal, as the solidity functions expect uints
  proof = proof.map(el => hexToDec(el));

  logger.debug('Burning within the Shield contract');

  const publicInputs = utils.formatInputsForZkSnark([
    new Element(publicInputHash, 'field', 248, 1),
  ]);

  logger.debug('proof:');
  logger.debug(proof);
  logger.debug('publicInputs:');
  logger.debug(publicInputs);

  const encodedRawTransaction = nfTokenShieldInstance.methods.burn(
    erc721Address.hex(32),
    proof,
    publicInputs,
    root,
    nullifier,
    tokenId,
    payTo,
  );

  // Burns commitment and returns token to payTo
  let txReceipt;
  if (signingMethod) {
    txReceipt = await sendSignedTransaction(
      await signingMethod(encodedRawTransaction.encodeABI(), nfTokenShieldInstance._address),
    );
  } else {
    txReceipt = await encodedRawTransaction.send({
      from: account,
      gas: 6500000,
      gasPrice: config.GASPRICE,
    });
  }

  utils.gasUsedStats(txReceipt, 'burn');

  if (fs.existsSync(`${outputDirectory}/${commitment}-${proofName}`))
    fs.unlinkSync(`${outputDirectory}/${commitment}-${proofName}`);

  if (fs.existsSync(`${outputDirectory}/${commitment}-witness`))
    fs.unlinkSync(`${outputDirectory}/${commitment}-witness`);

  logger.debug(`Deleted File ${outputDirectory}/${commitment}-${proofName} \n`);

  logger.debug('BURN COMPLETE\n');

  return { txReceipt };
}

module.exports = {
  mint,
  transfer,
  burn,
};
