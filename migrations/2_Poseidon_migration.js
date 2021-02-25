const Artifactor = require('truffle-artifactor');
const {abi, byteCode} = require('../contracts/poseidon/poseidonT3.json');

const buildPoseidon = async () => {
  const artifactor = new Artifactor('./build/contracts')
  await artifactor.save({
    contractName: 'PoseidonT3',
    abi,
    unlinked_binary: byteCode,
  });
};

const Poseidon = artifacts.require('Poseidon');
// const NFTokenShield = artifacts.require('NFTokenShield.sol');
// const FTokenShield = artifacts.require('FTokenShield.sol');


module.exports = function(deployer) {
  deployer.then(async () => {
    await buildPoseidon();

    const PoseidonT3 = artifacts.require('PoseidonT3');
    await deployer.deploy(PoseidonT3);
    // await deployer.link(PoseidonT3, [Poseidon, NFTokenShield, FTokenShield]);
    await deployer.deploy(Poseidon);
  });
};