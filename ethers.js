import { ethers } from 'ethers';
import { BigNumber } from 'ethers/utils';
import { removeNumericKeys } from 'dapp-utils';
import jsonfile from 'jsonfile';
import path from 'path';
import retry from 'retry';
import config from './config';

let etherjsProvider;
/**
 * Connects to Blockchain and then sets proper handlers for events
 */
export const connect = () => {
  console.log('Blockchain Connecting ...');
  try {
    const connectionInfo = { url: config.RPC_PROVIDER, timeout: 3000000 };
    etherjsProvider = new ethers.providers.JsonRpcProvider(connectionInfo, 'unspecified');
  } catch (e) {
    logger.log({
      level: 'error',
      message: 'Error while connecting to the provider: '.concat(e),
    });
  }

  const handleError = err => {
    console.error('Blockchain Error ...', err);
    console.log('Reconnecting to RPC ...');
    connect();
    // throw err;
  };

  etherjsProvider.on('error', handleError);
  etherjsProvider.getBlockNumber().then(blockNumber => {
    console.log(`Blockchain connected to geth node. Current block number: ${blockNumber}`);
  });
  etherjsProvider.listAccounts().then(accounts => {
    console.log('Accounts list', accounts);
  });
};

/**
 * Returns the default provider.
 */
export const getProvider = () => {
  const promise = new Promise(resolve => {
    if (etherjsProvider !== undefined) {
      etherjsProvider
        .getBlockNumber()
        .then(blockNumber => {
          console.log(`Blockchain connected to geth node. Current block number: ${blockNumber}`);
          resolve(etherjsProvider);
        })
        .catch(error => {
          console.log('Error while connecting to geth node: ', error);
          try {
            connect();
          } catch (err) {
            console.log('Error while creating new provider: ', err);
          }
          resolve(etherjsProvider);
        });
    }
  });
  return promise;
};

const faultToleranceGetProvider = cb => {
  const operation = retry.operation(config.RETRY_OPTIONS);
  operation.attempt(currentAttempt => {
    logger.log({
      level: 'info',
      message: `Get Ethers.js Provider | Attempt: ${currentAttempt}`,
    });
    return new Promise((resolve, reject) => {
      try {
        const provider = getProvider();
        resolve(cb(provider.error ? operation.mainError() : null, provider));
      } catch (error) {
        logger.log({
          level: 'error',
          message: 'Error while getting Ethers.js Provider: '.concat(error),
        });
        operation.retry(error);
        reject(error);
      }
    });
  });
};

export const getProviderResolver = async () => {
  return new Promise((resolve, reject) => {
    faultToleranceGetProvider(async (err, provider) => {
      if (err) {
        console.log('Error in Get Provider Resolver:', err);
        reject(err);
      }
      resolve(provider);
    });
  });
};

/**
 * Returns a wallet using the given private key. The default key is privatekey using the default ganache seed.
 * @param {*} privateKey
 */
export const getWallet = async privateKey => {
  const provider = await getProviderResolver();
  let wallet = null;
  try {
    wallet = new ethers.Wallet(privateKey, provider);
  } catch (e) {
    console.log('Failed to initialize Wallet', e);
  }
  return wallet;
};

/**
 * Returns a signer using the given address.
 * @param {String} address
 */
export const getSigner = address => {
  const provider = getProvider();
  return provider.getSigner(address);
};

/**
 * Gets the existing contract of a given type on the network.
 *
 * @param {String} contractName - name of contract
 * @param {String} contractAddress - address of the contract
 * @throws {ReferenceError} If contract doesn't exist, throws an exception.
 * @return {ethers.Contract} Returns contract object.
 */
export const getContract = async (contractName, contractAddress) => {
  try {
    const contractJson = jsonfile.readFileSync(
      path.join(__dirname, './contracts/', `${contractName}.json`),
    );
    const provider = getProvider();
    return new ethers.Contract(contractAddress, contractJson.abi, provider);
  } catch (e) {
    throw new Error(`Failed to instantiate compiled contract ${contractName}`);
  }
};

/**
 * Gets the existing contract of a given type on the network.
 * @param {String} contractName - name of contract
 * @param contractAddress
 * @param {String} privateKey - signer address
 * @returns {Promise<Contract>}
 * @throws {ReferenceError} If contract doesn't exist, throws an exception.
 */

export const getContractWithSigner = async (contractName, contractAddress, privateKey) => {
  try {
    const contractJson = jsonfile.readFileSync(
      path.join(__dirname, './contracts/', `${contractName}.json`),
    );

    const provider = getProvider();
    const contract = new ethers.Contract(contractAddress, contractJson.abi, provider);
    const wallet = await getWallet(privateKey);
    return contract.connect(wallet);
  } catch (e) {
    throw new Error(`Failed to instantiate compiled contract ${contractName}`);
  }
};

const faultTolerantGetInstance = (contractAddress, contractABI, provider, cb) => {
  const operation = retry.operation(config.RETRY_OPTIONS);
  operation.attempt(currentAttempt => {
    logger.log({
      level: 'info',
      message: `Get instance attempt: ${currentAttempt}`,
    });
    return new Promise((resolve, reject) => {
      try {
        const instance = new ethers.Contract(contractAddress, contractABI, provider);
        resolve(cb(instance.error ? operation.mainError() : null, instance));
      } catch (error) {
        logger.log({
          level: 'error',
          message: 'Error while getting the instance: '.concat(error),
        });
        operation.retry(error);
        reject(error);
      }
    });
  });
};

export const getContractInstance = async (contractABI, contractAddress) => {
  try {
    const provider = await getProviderResolver();
    return new Promise((resolve, reject) => {
      faultTolerantGetInstance(contractAddress, contractABI, provider, async (err, instance) => {
        if (err) {
          console.log('Error in faultTolerantGetInstance:', err);
          reject(err);
        }
        resolve(instance);
      });
    });
  } catch (e) {
    throw new Error('Failed to instantiate');
  }
};

export const getContractInstanceWithSigner = async (contractABI, contractAddress, privateKey) => {
  try {
    const provider = await getProviderResolver();
    const contract = new ethers.Contract(contractAddress, contractABI, provider);
    const wallet = await getWallet(privateKey);
    return contract.connect(wallet);
  } catch (e) {
    throw new Error(`Failed to instantiate compiled contract ${contractAddress}`);
  }
};

/**
 * Removes numeric keys and parses data to be human readable.
 * TODO: I'm trying to keep to the interface for the UI. Future apps shouldn't
 * be beholden to this interface.
 * @param {Object} event - Event object from ethers.js
 */
export const parseEvent = event => {
  const removedNumericKeys = removeNumericKeys(event.values);
  const newEventValues = { ...removedNumericKeys };
  const entries = Object.entries(event.values);
  entries.forEach(([key, value]) => {
    if (value instanceof BigNumber) {
      newEventValues[key] = value.toNumber();
    }
  });
  const newEvent = {
    ...event,
    ...newEventValues,
    event: event.name,
  };
  return newEvent;
};

/**
 * Abstraction for getting events from ethers. Returns human readable events.
 * @param {Object} options
 * from: block to query from
 * to: block to query to
 * topics: name of event as it appears in the contract (i.e., 'Transfer')
 */
export const getEvents = async options => {
  const { fromBlock = 0, toBlock = 'latest', topics, contract } = options;

  const provider = getProvider();

  const parsedTopic = topics ? ethers.utils.id(contract.interface.events[topics].signature) : null;

  let events = await provider.getLogs({
    fromBlock,
    toBlock,
    address: contract.address,
    topics: [parsedTopic],
  });

  events = events.map(log => contract.interface.parseLog(log));
  events = events.map(parseEvent);

  return events;
};

/**
 * Get transaction count for the provided ethereum account address
 *
 * @param {*} address - Account address to get transaction count
 * @return {ethers.Provider.getTransactionCount} - transaction count for the provided address
 */
export const getTransactionCount = async address => {
  const provider = await getProvider();
  const transactionCount = await provider.getTransactionCount(address);
  return transactionCount;
};

/**
 * Sign the transaction with the privateKey
 *
 * @see {@link https://docs.ethers.io/ethers.js/html/api-wallet.html#signing}
 * @param {Object} transaction - transaction object. Refer to ether.js documentation for allowed values
 * @param {String} privateKey - Eth wallet privateKey
 * @return {ethers.Wallet.sign} - signed transaction hex string
 */
export const getSignedTransaction = async (transaction, privateKey) => {
  const wallet = await getWallet(privateKey);
  return wallet.sign(transaction);
};

export const signTransaction = async (transactionObject, privateKey) => {
  const wallet = await getWallet(privateKey);
  let transactionCount;
  try {
    transactionCount = await wallet.getTransactionCount();
  } catch (e) {
    logger.log({
      level: 'error',
      message: 'Error while signing the transaction: '.concat(e),
    });
  }
  const tx = {
    ...transactionObject,
    gasLimit: transactionObject.gasLimit || '90000',
    nonce: transactionObject.nonce || transactionCount,
  };
  const signed = await wallet.sign(tx);
  return signed;
};

/**
 * Create account
 *
 * @return {Object} - blockchain address, private key
 */
export const createUser = () => {
  return new Promise(async (resolve, reject) => {
    try {
      const user = await ethers.Wallet.createRandom();
      resolve(user);
    } catch (e) {
      reject(e);
    }
  });
};

export const sendInitialFunds = async address => {
  try {
    // Send initial funds for testing
    const provider = await getProviderResolver();
    const amount = config.INITIAL_ETHERS_FUNDING; // willing to send 5 ethers
    const amountToSend = ethers.utils.parseEther(amount.toString());
    // when moved to ethereum default account would be coinbase and the private key would be the private key of the coinbase
    // let mnemonic = keys.mnemonic;
    // let mnemonicWallet = ethers.Wallet.fromMnemonic(mnemonic);
    // let privateKey = mnemonicWallet.signingKey.privateKey;
    const privateKey = config.PREFUNDED_ETH_ADDR_PRIVATE_KEY;

    // All properties are optional
    const tx = {
      to: address,
      value: amountToSend,
      data: '0x',
    };
    const estimate = await provider.estimateGas(tx);
    tx.gasLimit = estimate;
    const signedTransaction = await signTransaction(tx, privateKey);
    const transaction = await provider.sendTransaction(signedTransaction);
    await provider.getTransactionReceipt(transaction.hash);
  } catch (e) {
    throw e;
  }
};

export const createFreshAddressForTransactions = async () => {
  const ethUser = await createUser();
  await sendInitialFunds(ethUser.address);
  return ethUser.address;
};

export const getBalance = async address => {
  const provider = await getProviderResolver();
  return provider.getBalance(address).then(balance => {
    // balance is a BigNumber (in wei); format is as a string (in ether)
    return ethers.utils.commify(Number(ethers.utils.formatEther(balance)).toFixed(2));
  });
};

export const listAccounts = async () => {
  const provider = await getProviderResolver();
  return provider.listAccounts();
};

/**
 * Create an unsigned transaction to deploy a contract.
 *
 * @param {Object} contractJson - Compiled contract JSON.
 * @param {Array} args - Arguments for the contract constructor.
 * @returns {Object} Unsigned transaction.
 */
export const getUnsignedContractDeployment = (contractJson, args = []) => {
  const factory = new ethers.ContractFactory(contractJson.abi, contractJson.bytecode);

  const transaction = factory.getDeployTransaction(...args);
  return transaction.data;
};

const faultTolerantResolve = async (signedTransaction, cb) => {
  const operation = retry.operation(config.RETRY_OPTIONS);
  const provider = await getProviderResolver();
  operation.attempt(currentAttempt => {
    logger.log({
      level: 'info',
      message: `Connection Attempt: ${currentAttempt}`,
    });

    provider
      .sendTransaction(signedTransaction)
      .then(sendingResponse => {
        return cb(sendingResponse.error ? operation.mainError() : null, sendingResponse);
      })
      .catch(error => {
        logger.log({
          level: 'error',
          message: 'Connection error while sending transaction: '.concat(error),
        });
        operation.retry(error);
        return error;
      });
  });
};

/**
 * Sends a signed transaction.
 *
 * @param {Object} signedTransaction - Signed, unsent transaction.
 * @returns {Object} - Receipt
 */
export const sendSignedTransaction = async signedTransaction => {
  const provider = await getProviderResolver();
  return new Promise((resolve, reject) => {
    faultTolerantResolve(signedTransaction, async (err, transaction) => {
      if (err) {
        console.log('error in sendSignedTransaction:', err);
        reject(err);
      }
      const receipt = await provider.getTransactionReceipt(transaction.hash);
      resolve(receipt);
    });
  });
};

export const getContractFactory = (abi, bytecode, signerWallet) => {
  return new ethers.ContractFactory(abi, bytecode, signerWallet);
};
