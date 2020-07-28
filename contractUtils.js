const contract = require('truffle-contract');
const jsonfile = require('jsonfile');
const Web3 = require('./provider');

const web3 = Web3.connect();

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

module.exports = {
  getTruffleContractInstance,
};
