/**
 * This module contains the logic needed to interact with the FTokenShield contract,
 * specifically handling the mint, transfer, simpleBatchTransfer, and burn functions for fungible commitments.
 *
 * @module erc20.js
 * @author westlad, Chaitanya-Konda, iAmMichaelConnor
 */

const contract = require('truffle-contract');
const zokrates = require('@eyblockchain/zokrates.js');
const fs = require('fs');
const config = require('./config');
const merkleTree = require('./merkleTree');
const utils = require('./utils');
const logger = require('./logger');
const Element = require('./Element');
const Web3 = require('./provider');
const erc20Interface = require('./contracts/ERC20Interface.json');
const {
  enc,
  AUTHORITY_PUBLIC_KEYS,
  dec,
  bruteForce,
  edwardsCompress,
  edwardsDecompress,
} = require('./elgamal');
const { getPublicKeyTreeData } = require('./public-key-tree');

/**
Blacklist an address to prevent zkp operations.  Note that this can only be called
by the owner of TokenShield.sol, otherwise it will throw
*/
async function blacklist(malfeasantAddress, blockchainOptions) {
  const { fTokenShieldJson, fTokenShieldAddress } = blockchainOptions;
  const account = utils.ensure0x(blockchainOptions.account);
  const fTokenShield = contract(fTokenShieldJson);
  fTokenShield.setProvider(Web3.connect());
  const fTokenShieldInstance = await fTokenShield.at(fTokenShieldAddress);
  fTokenShieldInstance.blacklistAddress(malfeasantAddress, {
    from: account,
    gas: 6500000,
    gasPrice: config.GASPRICE,
  });
}
/**
Un-blacklist a previously blacklisted address to enable zkp operations.
Note that this can only be called by the owner of TokenShield.sol, otherwise it will throw
*/
async function unblacklist(blacklistedAddress, blockchainOptions) {
  const { fTokenShieldJson, fTokenShieldAddress } = blockchainOptions;
  const account = utils.ensure0x(blockchainOptions.account);
  const fTokenShield = contract(fTokenShieldJson);
  fTokenShield.setProvider(Web3.connect());
  const fTokenShieldInstance = await fTokenShield.at(fTokenShieldAddress);
  fTokenShieldInstance.unBlacklistAddress(blacklistedAddress, {
    from: account,
    gas: 6500000,
    gasPrice: config.GASPRICE,
  });
}
/**
Decrypts the El-Gamal encrypted data from zkp transaction.  The private keys
must be set within the el-gamal module first and the txReceipt must have resolved
to a full object, not just a transaction hash i.e. it must have been mined.
When a curve point has been decrypted (and the total number of points depends on the type)
we need to map that curve point back to the original message.
That's tricky because it will have been created by scalar multiplying the message to generate
the curve point, and thus to recover the message we need to invert a discrete logarithm. That's
doable because, fortunately, the number of possible messages isn't too big but we need a way
to guess the messages.  That's where our array of guessers come in.  There's one guesser for each
curve point and it must implement the iterable interface so that we can call it in a standard
way to get the next guess (a simple guesser could be just an array of possible solutions, therefore,
because the array object implements the iterable interface; a generator function is another good
choice where we have a known sequence of guesses to make such as all the numbers between 0 and 1 million)
@param {object} txReceipt - the transaction receipt from the transaction of interest
@param {string} type - the type of transaction we are trying to decrypt ('Burn', 'Transfer')
@param {array} guessers - an array of generators that generate guesses for possible values of each messag
*/
function decryptTransaction(txReceipt, { type, guessers }) {
  if (!config.ALLOWED_DECRYPTION_TYPES[type])
    throw new Error('Unknown transaction type for decryption');
  const publicInputLog = txReceipt.logs.filter(log => {
    return log.event === type;
  });
  const { publicInputs } = publicInputLog[0].args;
  const c = [];
  for (
    let i = config.ALLOWED_DECRYPTION_TYPES[type].PUBLIC_INPUTS_START_POSITION;
    i < config.ALLOWED_DECRYPTION_TYPES[type].PUBLIC_INPUTS_END_POSITION;
    i++
  ) {
    logger.debug('recovered public input', i, publicInputs[i]);
    c.push(edwardsDecompress(publicInputs[i]));
  }
  const m = dec(c);
  const decrypt = [];
  for (let i = 0; i < m.length; i++) {
    decrypt.push(bruteForce(m[i], guessers[i]));
  }
  return decrypt;
}

/**
 * Mint a coin under compliance conditions
 * @param {String} amount - the value of the coin
 * @param {String} zkpPublicKey - Alice's public key
 * @param {String} salt - Alice's token serial number as a hex string
 * @param {Object} blockchainOptions
 * @param {String} blockchainOptions.erc20Address - Address of ERC20 contract
 * @param {String} blockchainOptions.fTokenShieldJson - ABI of fTokenShieldInstance
 * @param {String} blockchainOptions.fTokenShieldAddress - Address of deployed fTokenShieldContract
 * @param {String} blockchainOptions.account - Account that is sending these transactions
 * @returns {String} commitment - Commitment of the minted coins
 * @returns {Number} commitmentIndex
 */
async function mint(amount, zkpPublicKey, salt, blockchainOptions, zokratesOptions) {
  const { fTokenShieldJson, fTokenShieldAddress, erc20Address } = blockchainOptions;
  const erc20AddressPadded = `0x${utils.strip0x(erc20Address).padStart(64, '0')}`;
  const account = utils.ensure0x(blockchainOptions.account);
  logger.debug('erc20Address', erc20Address);
  logger.debug('zokratesOptions', zokratesOptions);
  const {
    codePath,
    outputDirectory,
    witnessName = 'witness',
    pkPath,
    provingScheme = 'gm17',
    createProofJson = true,
    proofName = 'proof.json',
  } = zokratesOptions;

  const fTokenShield = contract(fTokenShieldJson);
  fTokenShield.setProvider(Web3.connect());
  const fTokenShieldInstance = await fTokenShield.at(fTokenShieldAddress);

  logger.debug('\nIN MINT...');

  logger.debug('Finding the relevant Shield and Verifier contracts');

  // Calculate new arguments for the proof:
  const commitment = utils.concatenateThenHash(erc20AddressPadded, amount, zkpPublicKey, salt);

  logger.debug('Existing Proof Variables:');
  const p = config.ZOKRATES_PACKING_SIZE;
  const pt = Math.ceil((config.LEAF_HASHLENGTH * 8) / config.ZOKRATES_PACKING_SIZE); // packets in bits
  logger.debug(
    'erc20AddressPadded',
    erc20AddressPadded,
    ' : ',
    utils.hexToFieldPreserve(erc20AddressPadded, 248, 1),
  );
  logger.debug('amount: ', `${amount} : `, utils.hexToFieldPreserve(amount, p, 1));
  logger.debug('publicKey: ', zkpPublicKey, ' : ', utils.hexToFieldPreserve(zkpPublicKey, p, pt));
  logger.debug('salt: ', salt, ' : ', utils.hexToFieldPreserve(salt, p, pt));

  logger.debug('New Proof Variables:');
  logger.debug('commitment: ', commitment, ' : ', utils.hexToFieldPreserve(commitment, p, pt));

  const publicInputHash = utils.concatenateThenHash(
    erc20AddressPadded,
    amount,
    commitment,
    zkpPublicKey,
  );
  logger.debug(
    'publicInputHash:',
    publicInputHash,
    ' : ',
    utils.hexToFieldPreserve(publicInputHash, 248, 1, 1),
  );

  // compute the proof
  logger.debug('Computing witness...');

  const allInputs = utils.formatInputsForZkSnark([
    new Element(publicInputHash, 'field', 248, 1),
    new Element(erc20AddressPadded, 'field', 248, 1),
    new Element(amount, 'field', 128, 1),
    new Element(zkpPublicKey, 'field'),
    new Element(salt, 'field'),
    new Element(commitment, 'field'),
  ]);

  logger.debug(
    'To debug witness computation, use ./zok to run up a zokrates container then paste these arguments into the terminal:',
  );
  logger.debug(`./zokrates compute-witness -a ${allInputs.join(' ')} -i gm17/ft-mint/out`);

  await zokrates.computeWitness(codePath, outputDirectory, witnessName, allInputs);

  logger.debug('Computing proof...');
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
  proof = proof.map(el => utils.hexToDec(el));

  // Approve fTokenShieldInstance to take tokens from minter's account.
  const fToken = contract(erc20Interface);
  fToken.setProvider(Web3.connect());
  const fTokenInstance = await fToken.at(erc20Address);

  await fTokenInstance.approve(fTokenShieldInstance.address, parseInt(amount, 16), {
    from: account,
    gas: 4000000,
    gasPrice: config.GASPRICE,
  });

  logger.debug('Minting within the Shield contract');

  const publicInputs = utils.formatInputsForZkSnark([
    new Element(publicInputHash, 'field', 248, 1),
  ]);

  logger.debug('proof:');
  logger.debug(proof);
  logger.debug('publicInputs:');
  logger.debug(publicInputs);

  // Mint the commitment
  logger.debug('Approving ERC-20 spend from: ', fTokenShieldInstance.address);
  const txReceipt = await fTokenShieldInstance.mintRC(
    erc20AddressPadded,
    proof,
    publicInputs,
    amount,
    commitment,
    zkpPublicKey,
    {
      from: account,
      gas: 6500000,
      gasPrice: config.GASPRICE,
    },
  );
  utils.gasUsedStats(txReceipt, 'mint');

  const newLeafLog = txReceipt.logs.filter(log => {
    return log.event === 'NewLeaf';
  });
  const commitmentIndex = newLeafLog[0].args.leafIndex;

  logger.debug('ERC-20 spend approved!', parseInt(amount, 16));
  logger.debug(
    'Balance of account',
    account,
    (await fTokenInstance.balanceOf.call(account)).toNumber(),
  );
  logger.debug('Mint output: [zA, zAIndex]:', commitment, commitmentIndex.toString());
  logger.debug('MINT COMPLETE\n');

  return { commitment, commitmentIndex };
}

/**
 * This function actually transfers a coin with compliance features
 * @param {Array} inputCommitments - Array of two commitments owned by the sender.
 * @param {Array} outputCommitments - Array of two commitments.
 * Currently the first is sent to the receiverPublicKey, and the second is sent to the sender.
 * @param {String} receiverPublicKey - Public key of the first outputCommitment
 * @param {String} senderSecretKey
 * @param {Object} blockchainOptions
 * @param {String} blockchainOptions.erc20Address - ABI of fTokenShieldInstance
 * @param {String} blockchainOptions.fTokenShieldJson - ABI of fTokenShieldInstance
 * @param {String} blockchainOptions.fTokenShieldAddress - Address of deployed fTokenShieldContract
 * @param {String} blockchainOptions.account - Account that is sending these transactions
 * @returns {Object[]} outputCommitments - Updated outputCommitments with their commitments and indexes.
 * @returns {Object} Transaction object
 */
async function transfer(
  _inputCommitments,
  _outputCommitments,
  receiverPublicKey,
  senderSecretKey,
  blockchainOptions,
  zokratesOptions,
) {
  const { fTokenShieldJson, fTokenShieldAddress, erc20Address } = blockchainOptions;
  const erc20AddressPadded = `0x${utils.strip0x(erc20Address).padStart(64, '0')}`;
  const account = utils.ensure0x(blockchainOptions.account);

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

  logger.debug('Finding the relevant Shield and Verifier contracts');
  const fTokenShield = contract(fTokenShieldJson);
  fTokenShield.setProvider(Web3.connect());
  const fTokenShieldInstance = await fTokenShield.at(fTokenShieldAddress);

  const inputCommitments = _inputCommitments;
  const outputCommitments = _outputCommitments;

  // due to limitations in the size of the adder implemented in the proof dsl, we need C+D and E+F to easily fit in <128 bits (16 bytes). They could of course be bigger than we allow here.
  const inputSum =
    parseInt(inputCommitments[0].value, 16) + parseInt(inputCommitments[1].value, 16);
  const outputSum =
    parseInt(outputCommitments[0].value, 16) + parseInt(outputCommitments[1].value, 16);
  if (inputSum > 0xffffffff || outputSum > 0xffffffff)
    throw new Error(`Input commitments' values are too large`);

  // Calculate new arguments for the proof:
  const senderPublicKey = utils.hash(senderSecretKey);
  inputCommitments[0].nullifier = utils.concatenateThenHash(
    inputCommitments[0].salt,
    senderSecretKey,
  );
  inputCommitments[1].nullifier = utils.concatenateThenHash(
    inputCommitments[1].salt,
    senderSecretKey,
  );

  outputCommitments[0].commitment = utils.concatenateThenHash(
    erc20AddressPadded,
    outputCommitments[0].value,
    receiverPublicKey,
    outputCommitments[0].salt,
  );
  outputCommitments[1].commitment = utils.concatenateThenHash(
    erc20AddressPadded,
    outputCommitments[1].value,
    senderPublicKey,
    outputCommitments[1].salt,
  );

  // compute the encryption of the transfer values
  const randomSecret = BigInt(await utils.randomHex(27)); // ideally needs to be smaller than Fq TODO - try 32 bytes when it works
  const encryption = enc(randomSecret, [
    outputCommitments[0].value,
    senderPublicKey,
    receiverPublicKey,
  ]);

  // compute the sibling path for the zkp public key Merkle tree used for whitelisting
  const publicKeyTreeData = await getPublicKeyTreeData(fTokenShieldInstance, senderPublicKey);
  logger.debug('Public key sibling path', publicKeyTreeData.siblingPath);

  // Get the sibling-path from the token commitments (leaves) to the root. Express each node as an Element class.
  inputCommitments[0].siblingPath = await merkleTree.getSiblingPath(
    account,
    fTokenShieldInstance,
    inputCommitments[0].commitment,
    inputCommitments[0].commitmentIndex,
  );
  inputCommitments[1].siblingPath = await merkleTree.getSiblingPath(
    account,
    fTokenShieldInstance,
    inputCommitments[1].commitment,
    inputCommitments[1].commitmentIndex,
  );

  // TODO: edit merkle-tree microservice API to accept 2 path requests at once, to avoid the possibility of the merkle-tree DB's root being updated between the 2 GET requests. Until then, we need to check that both paths share the same root with the below check:
  if (inputCommitments[0].siblingPath[0] !== inputCommitments[1].siblingPath[0])
    throw new Error("The sibling paths don't share a common root.");

  const root = inputCommitments[0].siblingPath[0];
  // TODO: checkRoot() is not essential. It's only useful for debugging as we make iterative improvements to nightfall's zokrates files. Possibly delete in future.
  merkleTree.checkRoot(
    inputCommitments[0].commitment,
    inputCommitments[0].commitmentIndex,
    inputCommitments[0].siblingPath,
    root,
  );
  merkleTree.checkRoot(
    inputCommitments[1].commitment,
    inputCommitments[1].commitmentIndex,
    inputCommitments[1].siblingPath,
    root,
  );

  inputCommitments[0].siblingPathElements = inputCommitments[0].siblingPath.map(
    nodeValue => new Element(nodeValue, 'field', config.NODE_HASHLENGTH * 8, 1),
  ); // we truncate to 216 bits - sending the whole 256 bits will overflow the prime field

  inputCommitments[1].siblingPathElements = inputCommitments[1].siblingPath.map(
    element => new Element(element, 'field', config.NODE_HASHLENGTH * 8, 1),
  ); // we truncate to 216 bits - sending the whole 256 bits will overflow the prime field

  logger.debug('Existing Proof Variables:');
  const p = config.ZOKRATES_PACKING_SIZE;
  logger.debug(
    `inputCommitments[0].value: ${inputCommitments[0].value} : ${utils.hexToFieldPreserve(
      inputCommitments[0].value,
      p,
    )}`,
  );
  logger.debug(
    `inputCommitments[1].value: ${inputCommitments[1].value} : ${utils.hexToFieldPreserve(
      inputCommitments[1].value,
      p,
    )}`,
  );
  logger.debug(
    `outputCommitments[0].value: ${outputCommitments[0].value} : ${utils.hexToFieldPreserve(
      outputCommitments[0].value,
      p,
    )}`,
  );
  logger.debug(
    `outputCommitments[1].value: ${outputCommitments[1].value} : ${utils.hexToFieldPreserve(
      outputCommitments[1].value,
      p,
    )}`,
  );
  logger.debug(
    `receiverPublicKey: ${receiverPublicKey} : ${utils.hexToFieldPreserve(receiverPublicKey, p)}`,
  );
  logger.debug(
    `inputCommitments[0].salt: ${inputCommitments[0].salt} : ${utils.hexToFieldPreserve(
      inputCommitments[0].salt,
      p,
    )}`,
  );
  logger.debug(
    `inputCommitments[1].salt: ${inputCommitments[1].salt} : ${utils.hexToFieldPreserve(
      inputCommitments[1].salt,
      p,
    )}`,
  );
  logger.debug(
    `outputCommitments[0].salt: ${outputCommitments[0].salt} : ${utils.hexToFieldPreserve(
      outputCommitments[0].salt,
      p,
    )}`,
  );
  logger.debug(
    `outputCommitments[1].salt: ${outputCommitments[1].salt} : ${utils.hexToFieldPreserve(
      outputCommitments[1].salt,
      p,
    )}`,
  );
  logger.debug(
    `senderSecretKey: ${senderSecretKey} : ${utils.hexToFieldPreserve(senderSecretKey, p)}`,
  );
  logger.debug(
    `inputCommitments[0].commitment: ${inputCommitments[0].commitment} : ${utils.hexToFieldPreserve(
      inputCommitments[0].commitment,
      p,
    )}`,
  );
  logger.debug(
    `inputCommitments[1].commitment: ${inputCommitments[1].commitment} : ${utils.hexToFieldPreserve(
      inputCommitments[1].commitment,
      p,
    )}`,
  );

  logger.debug('New Proof Variables:');
  logger.debug(`pkA: ${senderPublicKey} : ${utils.hexToFieldPreserve(senderPublicKey, p)}`);
  logger.debug(
    `inputCommitments[0].nullifier: ${inputCommitments[0].nullifier} : ${utils.hexToFieldPreserve(
      inputCommitments[0].nullifier,
      p,
    )}`,
  );
  logger.debug(
    `inputCommitments[1].nullifier: ${inputCommitments[1].nullifier} : ${utils.hexToFieldPreserve(
      inputCommitments[1].nullifier,
      p,
    )}`,
  );
  logger.debug(
    `outputCommitments[0].commitment: ${
      outputCommitments[0].commitment
    } : ${utils.hexToFieldPreserve(outputCommitments[0].commitment, p)}`,
  );
  logger.debug(
    `outputCommitments[1].commitment: ${
      outputCommitments[1].commitment
    } : ${utils.hexToFieldPreserve(outputCommitments[1].commitment, p)}`,
  );
  logger.debug(`root: ${root} : ${utils.hexToFieldPreserve(root, p)}`);
  logger.debug(`inputCommitments[0].siblingPath:`, inputCommitments[0].siblingPath);
  logger.debug(`inputCommitments[1].siblingPath:`, inputCommitments[1].siblingPath);
  logger.debug(`inputCommitments[0].commitmentIndex:`, inputCommitments[0].commitmentIndex);
  logger.debug(`inputCommitments[1].commitmentIndex:`, inputCommitments[1].commitmentIndex);
  logger.debug(`public key tree leaf index:`, publicKeyTreeData.leafIndex);
  logger.debug(`sender public key`, senderPublicKey);

  const compressedPublicInputsArray = [
    root,
    inputCommitments[0].nullifier,
    inputCommitments[1].nullifier,
    outputCommitments[0].commitment,
    outputCommitments[1].commitment,
    publicKeyTreeData.siblingPath[0],
    ...encryption.map(pt => edwardsCompress(pt)),
    ...AUTHORITY_PUBLIC_KEYS.map(pt => edwardsCompress(pt)),
  ];

  logger.debug('array of compressed public inputs', compressedPublicInputsArray);

  const publicInputHash = utils.concatenateThenHash(...compressedPublicInputsArray);
  logger.debug(
    'publicInputHash:',
    publicInputHash,
    ' : ',
    utils.hexToFieldPreserve(publicInputHash, 248, 1, 1),
  );

  // compute the proof
  logger.debug('Computing witness...');

  logger.debug('encryption', encryption);

  const allInputs = utils.formatInputsForZkSnark([
    new Element(publicInputHash, 'field', 248, 1),
    new Element(erc20AddressPadded, 'field', 248, 1),
    new Element(inputCommitments[0].value, 'field', 128, 1),
    new Element(senderSecretKey, 'field'),
    new Element(inputCommitments[0].salt, 'field'),
    ...inputCommitments[0].siblingPathElements.slice(1),
    new Element(inputCommitments[0].commitmentIndex, 'field', 128, 1), // the binary decomposition of a leafIndex gives its path's 'left-right' positions up the tree. The decomposition is done inside the circuit.,
    new Element(inputCommitments[1].value, 'field', 128, 1),
    new Element(inputCommitments[1].salt, 'field'),
    ...inputCommitments[1].siblingPathElements.slice(1),
    new Element(inputCommitments[1].commitmentIndex, 'field', 128, 1), // the binary decomposition of a leafIndex gives its path's 'left-right' positions up the tree. The decomposition is done inside the circuit.,
    new Element(inputCommitments[0].nullifier, 'field'),
    new Element(inputCommitments[1].nullifier, 'field'),
    new Element(outputCommitments[0].value, 'field', 128, 1),
    new Element(receiverPublicKey, 'field'),
    new Element(outputCommitments[0].salt, 'field'),
    new Element(outputCommitments[0].commitment, 'field'),
    new Element(outputCommitments[1].value, 'field', 128, 1),
    new Element(outputCommitments[1].salt, 'field'),
    new Element(outputCommitments[1].commitment, 'field'),
    new Element(root, 'field'),
    new Element(BigInt(publicKeyTreeData.siblingPath[0]), 'scalar'),
    ...publicKeyTreeData.siblingPath.slice(1).map(f => new Element(BigInt(f), 'scalar')),
    new Element(BigInt(publicKeyTreeData.leafIndex), 'scalar'),
    ...encryption.flat().map(f => new Element(f, 'scalar')),
    ...AUTHORITY_PUBLIC_KEYS.flat().map(f => new Element(f, 'scalar')), // the double mapping is because each element of the key array is an array (representing an (x,y) curve point)
    new Element(randomSecret, 'scalar'),
  ]);

  logger.debug(
    'To debug witness computation, use ./zok to run up a zokrates container then paste these arguments into the terminal:',
  );
  logger.debug(`./zokrates compute-witness -a ${allInputs.join(' ')} -i gm17/ft-transfer/out`);

  await zokrates.computeWitness(codePath, outputDirectory, witnessName, allInputs);

  logger.debug('Computing proof...');
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
  proof = proof.map(el => utils.hexToDec(el));

  logger.debug('Transferring within the Shield contract');

  logger.debug('proof:');
  logger.debug(proof);

  // Transfers commitment
  const txReceipt = await fTokenShieldInstance.transferRC(
    proof,
    utils.formatInputsForZkSnark([new Element(publicInputHash, 'field', 248, 1)]),
    compressedPublicInputsArray,
    {
      from: account,
      gas: 6500000,
      gasPrice: config.GASPRICE,
    },
  );
  utils.gasUsedStats(txReceipt, 'transfer');

  const newLeavesLog = txReceipt.logs.filter(log => {
    return log.event === 'NewLeaves';
  });
  // eslint-disable-next-line no-param-reassign
  outputCommitments[0].commitmentIndex = parseInt(newLeavesLog[0].args.minLeafIndex, 10);
  // eslint-disable-next-line no-param-reassign
  outputCommitments[1].commitmentIndex = outputCommitments[0].commitmentIndex + 1;

  logger.debug('TRANSFER COMPLETE\n');

  return {
    outputCommitments,
    txReceipt,
  };
}

/**
This function is the simple batch equivalent of fungible transfer.  It takes a single
input coin and splits it between 20 recipients (some of which could be the original owner)
It's really the 'split' of a join-split.  It's no use for non-fungibles because, for them,
there's no concept of joining and splitting (yet).
@param {string} C - The value of the input coin C
@param {array} E - The values of the output coins (including the change coin)
@param {array} pkB - Bobs' public keys (must include at least one of pkA for change)
@param {string} S_C - Alice's salt
@param {array} S_E - Bobs' salts
@param {string} skA - Alice's private ('s'ecret) key
@param {string} zC - Alice's token commitment
@param {integer} zCIndex - the position of zC in the on-chain Merkle Tree
@param {string} account - the account that is paying for this
@returns {array} zE - The output token commitments
@returns {array} z_E_index - the indexes of the commitments within the Merkle Tree.  This is required for later transfers/joins so that Alice knows which leaf of the Merkle Tree she needs to get from the fTokenShieldInstance contract in order to calculate a path.
@returns {object} txReceipt - a promise of a blockchain transaction
*/
async function simpleFungibleBatchTransfer() {
  throw new Error('The compliance version does not support batch payments');
}
async function consolidationTransfer() {
  throw new Error('The compliance version does not support batch consolidation');
}

/**
 * This function burns a commitment, i.e. it recovers ERC-20 into your
 * account. All values are hex strings.
 * @param {string} amount - the value of the commitment in hex (i.e. the amount you are burning)
 * @param {string} receiverZkpPrivateKey - the private key of the person doing the burning (in hex)
 * @param {string} salt - the random nonce used in the commitment
 * @param {string} commitment - the value of the commitment being burned
 * @param {string} commitmentIndex - the index of the commitment in the Merkle Tree
 * @param {Object} blockchainOptions
 * @param {String} blockchainOptions.erc20Address - ABI of fTokenShieldInstance
 * @param {String} blockchainOptions.fTokenShieldJson - ABI of fTokenShieldInstance
 * @param {String} blockchainOptions.fTokenShieldAddress - Address of deployed fTokenShieldContract
 * @param {String} blockchainOptions.account - Account that is sending these transactions
 * @param {String} blockchainOptions.tokenReceiver - Account that will receive the tokens
 */
async function burn(
  amount,
  receiverZkpPrivateKey,
  salt,
  commitment,
  commitmentIndex,
  blockchainOptions,
  zokratesOptions,
) {
  const {
    fTokenShieldJson,
    fTokenShieldAddress,
    erc20Address,
    tokenReceiver: _payTo,
  } = blockchainOptions;
  const erc20AddressPadded = `0x${utils.strip0x(erc20Address).padStart(64, '0')}`;
  const account = utils.ensure0x(blockchainOptions.account);

  const {
    codePath,
    outputDirectory,
    witnessName = 'witness',
    pkPath,
    provingScheme = 'gm17',
    createProofJson = true,
    proofName = 'proof.json',
  } = zokratesOptions;

  let payTo = _payTo;
  if (payTo === undefined) payTo = account; // have the option to pay out to another address
  // before we can burn, we need to deploy a verifying key to mintVerifier (reusing mint for this)
  logger.debug('\nIN BURN...');

  logger.debug('Finding the relevant Shield and Verifier contracts');
  const fTokenShield = contract(fTokenShieldJson);
  fTokenShield.setProvider(Web3.connect());
  const fTokenShieldInstance = await fTokenShield.at(fTokenShieldAddress);

  // Calculate new arguments for the proof:
  const nullifier = utils.concatenateThenHash(salt, receiverZkpPrivateKey);
  // compute the encryption of the transfer values
  const receiverPublicKey = utils.hash(receiverZkpPrivateKey); // TODO this is really the sender - rename
  const randomSecret = BigInt(await utils.randomHex(27)); // ideally needs to be smaller than Fq TODO - try 32 bytes when it works
  const encryption = enc(randomSecret, [receiverPublicKey]);

  // compute the sibling path for the zkp public key Merkle tree used for whitelisting
  const publicKeyTreeData = await getPublicKeyTreeData(fTokenShieldInstance, receiverPublicKey);
  logger.debug('Public key sibling path', publicKeyTreeData.siblingPath);

  // Get the sibling-path from the token commitments (leaves) to the root. Express each node as an Element class.
  const siblingPath = await merkleTree.getSiblingPath(
    account,
    fTokenShieldInstance,
    commitment,
    commitmentIndex,
  );

  const root = siblingPath[0];
  // TODO: checkRoot() is not essential. It's only useful for debugging as we make iterative improvements to nightfall's zokrates files. Possibly delete in future.
  merkleTree.checkRoot(commitment, commitmentIndex, siblingPath, root);

  const siblingPathElements = siblingPath.map(
    nodeValue => new Element(nodeValue, 'field', config.NODE_HASHLENGTH * 8, 1),
  ); // we truncate to 216 bits - sending the whole 256 bits will overflow the prime field

  // Summarise values in the logger:
  logger.debug('Existing Proof Variables:');
  const p = config.ZOKRATES_PACKING_SIZE;
  logger.debug(`amount: ${amount} : ${utils.hexToFieldPreserve(amount, p)}`);
  logger.debug(
    `receiverZkpPrivateKey: ${receiverZkpPrivateKey} : ${utils.hexToFieldPreserve(
      receiverZkpPrivateKey,
      p,
    )}`,
  );
  logger.debug(`salt: ${salt} : ${utils.hexToFieldPreserve(salt, p)}`);
  logger.debug(`payTo: ${payTo} : ${utils.hexToFieldPreserve(payTo, p)}`);
  const payToLeftPadded = utils.leftPadHex(payTo, config.LEAF_HASHLENGTH * 2); // left-pad the payToAddress with 0's to fill all 256 bits (64 octets) (so the sha256 function is hashing the same thing as inside the zokrates proof)
  logger.debug(`payToLeftPadded: ${payToLeftPadded}`);

  logger.debug('New Proof Variables:');
  logger.debug(`nullifier: ${nullifier} : ${utils.hexToFieldPreserve(nullifier, p)}`);
  logger.debug(`commitment: ${commitment} : ${utils.hexToFieldPreserve(commitment, p)}`);
  logger.debug(`root: ${root} : ${utils.hexToFieldPreserve(root, p)}`);
  logger.debug(`siblingPath:`, siblingPath);
  logger.debug(`commitmentIndex:`, commitmentIndex);
  logger.debug(`public key tree leaf index:`, publicKeyTreeData.leafIndex);
  logger.debug(`receiver public key:`, receiverPublicKey);
  logger.debug(`public key root:`, publicKeyTreeData.siblingPath[0]);

  const amountLeftPadded = utils.ensure0x(utils.strip0x(amount).padStart(64, '0'));

  // we need to compress the number of public inputs passed to solidity because of its limited stack space.
  const compressedPublicInputsArray = [
    erc20AddressPadded,
    root,
    nullifier,
    amountLeftPadded,
    payToLeftPadded,
    publicKeyTreeData.siblingPath[0],
    ...encryption.map(pt => edwardsCompress(pt)),
    ...AUTHORITY_PUBLIC_KEYS.slice(0, 1).map(pt => edwardsCompress(pt)),
  ];
  const publicInputHash = utils.concatenateThenHash(...compressedPublicInputsArray); // notice we're using the version of payTo which has been padded to 256-bits; to match our derivation of publicInputHash within our zokrates proof.
  logger.debug(
    'publicInputHash:',
    publicInputHash,
    ' : ',
    utils.hexToFieldPreserve(publicInputHash, 248, 1, 1),
  );

  // compute the proof
  logger.debug('Computing witness...');

  const allInputs = utils.formatInputsForZkSnark([
    new Element(publicInputHash, 'field', 248, 1),
    new Element(erc20AddressPadded, 'field', 248, 1),
    new Element(payTo, 'field'),
    new Element(amount, 'field', 128, 1),
    new Element(receiverZkpPrivateKey, 'field'),
    new Element(salt, 'field'),
    ...siblingPathElements.slice(1),
    new Element(commitmentIndex, 'field', 128, 1), // the binary decomposition of a leafIndex gives its path's 'left-right' positions up the tree. The decomposition is done inside the circuit.,
    new Element(nullifier, 'field'),
    new Element(root, 'field'),
    new Element(BigInt(publicKeyTreeData.siblingPath[0]), 'scalar'),
    ...publicKeyTreeData.siblingPath.slice(1).map(f => new Element(BigInt(f), 'scalar')),
    new Element(BigInt(publicKeyTreeData.leafIndex), 'scalar'),
    ...encryption.flat().map(f => new Element(f, 'scalar')),
    ...AUTHORITY_PUBLIC_KEYS.slice(0, 1)
      .flat()
      .map(f => new Element(f, 'scalar')), // the double mapping is because each element of the key array is an array (representing an (x,y) curve point)
    new Element(randomSecret, 'scalar'),
  ]);

  logger.debug(
    'To debug witness computation, use ./zok to run up a zokrates container then paste these arguments into the terminal:',
  );
  logger.debug(`./zokrates compute-witness -a ${allInputs.join(' ')} -i gm17/ft-burn/out`);

  await zokrates.computeWitness(codePath, outputDirectory, witnessName, allInputs);

  logger.debug('Computing proof...');
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
  proof = proof.map(el => utils.hexToDec(el));

  logger.debug('Burning within the Shield contract');

  const publicInputs = utils.formatInputsForZkSnark([
    new Element(publicInputHash, 'field', 248, 1),
  ]);

  logger.debug('proof:');
  logger.debug(proof);
  logger.debug('publicInputs:');
  logger.debug(publicInputs);

  // Burn the commitment and return tokens to the payTo account.
  const txReceipt = await fTokenShieldInstance.burnRC(
    proof,
    publicInputs,
    compressedPublicInputsArray,
    {
      from: account,
      gas: 6500000,
      gasPrice: config.GASPRICE,
    },
  );
  utils.gasUsedStats(txReceipt, 'burn');

  const newRoot = await fTokenShieldInstance.latestRoot();
  logger.debug(`Merkle Root after burn: ${newRoot}`);
  logger.debug('BURN COMPLETE\n');
  return { z_C: commitment, z_C_index: commitmentIndex, txReceipt };
}

module.exports = {
  mint,
  transfer,
  simpleFungibleBatchTransfer,
  burn,
  blacklist,
  unblacklist,
  decryptTransaction,
  consolidationTransfer,
};
