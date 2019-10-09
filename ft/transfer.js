const ethersUtils = require('@eyblockchain/dapp-utils/ethers');
const zokrates = require('@eyblockchain/zokrates.js');
const fs = require('fs');
const config = require('../config/config');
const utils = require('../zkp/utils');
const { recursiveHashConcat } = require('../index');
const { hexToDecimal } = require('../zkp/utils/conversions');
const computeVectors = require('../zkp/computeVectors');
const Element = require('../zkp/Element');


/**
 * Transfer a commitment
* @param {string} tokenId - the asset token

*/


async function transfer() {



}

module.exports = transfer;