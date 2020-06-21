const axios = require('axios');

// eslint-disable-next-line import/prefer-default-export
export const signTransaction = async (authorization, tx, to = '') => {
  const urlValue = `${authorization.url}/transactions/sign`;
  try {
    const data = {
      data: tx,
      to,
      gasPrice: 1,
      gasLimit: '0x4c4b40',
      secretName: authorization.secretName,
      newAccount: authorization.newAccount,
    };
    const options = {
      headers: { Authorization: authorization.token },
    };
    const response = await axios.post(urlValue, data, options);
    return response.data;
  } catch (err) {
    console.log(`SignTransaction Failed: ${err}`);
    throw err;
  }
};
