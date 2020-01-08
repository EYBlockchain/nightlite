const generateZokratesFiles = require('./setup/generateZokratesFiles');
const merkleTree = require('./merkleTree');
const provider = require('./provider');
const vks = require('./vks');
const erc20 = require('./erc20');
const erc721 = require('./erc721');

module.exports = {
  generateZokratesFiles,
  merkleTree,
  provider,
  vks,
  erc20,
  erc721,
};
