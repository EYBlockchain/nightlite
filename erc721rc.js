async function mint() {
  throw new Error('The compliance version does not support non-fungible mints');
}

async function transfer() {
  throw new Error('The compliance version does not support non-fungible transfers');
}

async function burn() {
  throw new Error('The compliance version does not support non-fungible burns');
}

module.exports = { mint, transfer, burn };
