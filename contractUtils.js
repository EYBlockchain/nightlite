const contract = require('truffle-contract');
const jsonfile = require('jsonfile');
const Web3 = require('./provider');

let web3 = Web3.connect();

const contractMapping = {
  NFTokenShield: `${process.cwd()}/build/contracts/NFTokenShield.json`,
  ERC721Interface: `${process.cwd()}/build/contracts/ERC721Interface.json`,
  FTokenShield: `${process.cwd()}/build/contracts/FTokenShield.json`,
  ERC20Interface: `${process.cwd()}/build/contracts/ERC20Interface.json`,
};

/**
 * get contract instance
 * @param {String} contractName contract name
 * @param {String} contractAddress [optional] address of contract
 */
function getTruffleContractInstance(contractName, contractAddress) {
  web3 = Web3.connect();
  if (!contractMapping[contractName]) {
    throw new Error('Unknown contract type in getTruffleContractInstance');
  }
  const contractJson = jsonfile.readFileSync(contractMapping[contractName]);
  const contractInstance = contract(contractJson);
  contractInstance.setProvider(web3);

  if (contractAddress) {
    return contractInstance.at(contractAddress);
  }
  return contractInstance.deployed();
}

/**
 * get contract instance
 * @param {String} contractNam:e contract name
 * @param {String} contractAddress: address of contract
 */
function getWeb3ContractInstance(contractName, contractAddress) {
  web3 = Web3.connection();
  if (!contractMapping[contractName]) {
    throw new Error('Unknown contract type in getWeb3ContractInstance');
  }
  const contractJson = jsonfile.readFileSync(contractMapping[contractName]);
  return new web3.eth.Contract(contractJson.abi, contractAddress);
}

function sendSignedTransaction(signedTransaction) {
  web3 = Web3.connection();
  return web3.eth.sendSignedTransaction(signedTransaction);
}

module.exports = {
  getTruffleContractInstance,
  getWeb3ContractInstance,
  sendSignedTransaction,
};
