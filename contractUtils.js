const fs = require('fs');
const Web3 = require('./provider');

const contractMapping = {
  NFTokenShield: `${process.cwd()}/build/contracts/NFTokenShield.json`,
  ERC721Interface: `${process.cwd()}/build/contracts/ERC721Interface.json`,
  FTokenShield: `${process.cwd()}/build/contracts/FTokenShield.json`,
  ERC20Interface: `${process.cwd()}/build/contracts/ERC20Interface.json`,
};

/**
 * get contract instance
 * @param {String} contractNam:e contract name
 * @param {String} contractAddress: address of contract
 */
function getWeb3ContractInstance(contractName, contractAddress) {
  const web3 = Web3.connection();
  if (!contractMapping[contractName]) {
    throw new Error('Unknown contract type in getWeb3ContractInstance');
  }
  const contractJson = JSON.parse(fs.readFileSync(contractMapping[contractName], 'utf8'));
  return new web3.eth.Contract(contractJson.abi, contractAddress);
}

function sendSignedTransaction(signedTransaction) {
  const web3 = Web3.connection();
  return web3.eth.sendSignedTransaction(signedTransaction);
}

module.exports = {
  getWeb3ContractInstance,
  sendSignedTransaction,
};
