/**
 * @module
 * @author iAmMichaelConnor
 * @desc Run from within nightfall/zkp/code
 */

// eslint-disable-next-line import/extensions
const { compile, setup, exportVerifier } = require('@eyblockchain/zokrates.js');
const util = require('util');
const os = require('os');
const fs = require('fs');
const path = require('path');
const logger = require('../logger');

const readdirAsync = util.promisify(fs.readdir);
const mkdir = util.promisify(fs.mkdir);

/**
 * @param {string} solFilePath
 */
function keyExtractor(solFilePath) {
  const solData = fs
    .readFileSync(solFilePath)
    .toString('UTF8')
    .split(os.EOL);
  const jsonTxt = [];
  jsonTxt.push('{');
  solData.forEach(el => {
    let m;
    // eslint-disable-next-line no-cond-assign
    if ((m = el.trim().match(/^vk\..*/)) && !m[0].includes('new')) {
      jsonTxt.push(
        m[0]
          .replace(/Pairing\.G.Point/, '')
          .replace(/\);/, ']')
          .replace(/\(/, '[')
          .replace(/(0x[0-9a-f]*?)([,\]])/g, '"$1"$2')
          .replace(/^(vk\..*?) = /, '"$1": ')
          .replace(/$/, ',')
          .replace(/vk\./, '')
          .replace(/"IC\[0\]":/, '"IC": [')
          .replace(/"IC\[\d*?\]":/, '')
          .replace(/"query\[0\]":/, '"query": [') // added for GM17
          .replace(/"query\[\d*?\]":/, '') // added for GM17
          .replace(/uint256/g, '') // added for ZoKrates 0.4.10
          .replace(/\(/g, '"') // added for ZoKrates 0.4.10
          .replace(/\)/g, '"') // added for ZoKrates 0.4.10
          .replace('"h"', '"H"')
          .replace('g_alpha', 'Galpha')
          .replace('h_beta', 'Hbeta')
          .replace('g_gamma', 'Ggamma')
          .replace('h_gamma', 'Hgamma'),
      );
    }
  });
  const l = jsonTxt.length - 1;
  jsonTxt[l] = `${jsonTxt[l].substring(0, jsonTxt[l].length - 1)}]`; // remove last comma
  jsonTxt.push('}');
  logger.debug(jsonTxt.join('\n'));
  return jsonTxt.join('\n');
}

/**
 * Given an output directory, generates all the files needed for a trusted setup.
 *
 * @param {String} outputDirectory - Directory to output all the files necessary
 * @param {String} [codeName] - Optional parameter to compile a specific file (like ft-mint)
 */
async function generateZokratesFiles(outputDirectory, codeName) {
  logger.info(`Setting up in directory ${outputDirectory}`);

  try {
    await mkdir(outputDirectory);
  } catch (err) {
    // Directory already exists, don't worry.
  }

  const outputDirWithSlash = outputDirectory.endsWith('/')
    ? outputDirectory
    : `${outputDirectory}/`;

  let hashDir = process.env.COMPLIANCE === 'true' ? '/rc' : '';
  hashDir = process.env.HASH_TYPE === 'mimc' ? '/mimc' : hashDir;

  // Path to code files within this module.
  const gm17Path = path.join(__dirname, `./gm17`, hashDir);

  // If there's a codeName, only compile that. Otherwise, compile everything.
  const codeFiles = codeName ? [codeName] : await readdirAsync(gm17Path);

  // Generate all code files. This function is non-concurrent on purpose.
  // Running these functions concurrently is too much for most computers.
  for (let i = 0; i < codeFiles.length; i += 1) {
    const codeFile = codeFiles[i];

    // Strip .zok from code file name.
    const codeFileName = codeFile.split('.')[0];
    const codeFileDirectory = `${outputDirWithSlash}${codeFileName}`;
    if (codeFileName === 'common' || codeFileName === 'mimc' || codeFileName === 'rc') {
      // eslint-disable-next-line
      continue
    }
    // Create a directory
    try {
      await mkdir(codeFileDirectory);
    } catch (err) {
      logger.warn('Directory already exists, skipping creation');
    }

    // Create files
    logger.info('Compiling', `${outputDirWithSlash}${codeFile}`);

    // // Generate out.ztf and out in the same directory.
    const compileOutput = await compile(
      `${gm17Path}/${codeFileName}.zok`,
      codeFileDirectory,
      'out',
      {
        verbose: true,
      },
    );
    logger.debug('Compile output:', compileOutput);
    logger.info(`Finished compiling ${codeFileName}`);

    logger.info(`Running setup on ${codeFileName}`);
    // Generate verification.key and proving.key
    const setupOutput = await setup(
      `${codeFileDirectory}/out`,
      codeFileDirectory,
      'gm17',
      'verification.key',
      'proving.key',
      { verbose: true },
    );
    logger.debug('Setup output:', setupOutput);
    logger.info(`Finished setup for ${codeFileName}`);

    logger.info(`Running export-verifier on ${codeFileName}`);
    const exportVerifierOutput = await exportVerifier(
      `${codeFileDirectory}/verification.key`,
      codeFileDirectory,
      'verifier.sol',
      'gm17',
      { verbose: true },
    );
    logger.debug('Export-verifier output:', exportVerifierOutput);
    logger.info(`Finished export-verifier for ${codeFileName}`);

    logger.verbose(`Extracting key from ${codeFileDirectory}/verifier.sol`);
    const vkJson = await keyExtractor(`${codeFileDirectory}/verifier.sol`, true);

    logger.info(`Writing ${codeFileDirectory}/${codeFile.split('.')[0]}-vk.json`);
    // Create a JSON with the file name but without .zok
    fs.writeFileSync(`${codeFileDirectory}/${codeFile.split('.')[0]}-vk.json`, vkJson, err => {
      if (err) {
        logger.error(err);
      }
    });
    logger.info(outputDirectory, 'is done setting up.');
  }
}

module.exports = generateZokratesFiles;
