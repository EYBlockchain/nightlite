const Web3 = require('web3');
const logger = require('./logger');

module.exports = {
  connection() {
    return this.web3;
  },

  /**
   * Connects to web3 and then sets proper handlers for events
   */
  connect() {
    logger.info('Blockchain Connecting ...');
    const provider = new Web3.providers.WebsocketProvider(
      `${process.env.BLOCKCHAIN_HOST}:${process.env.BLOCKCHAIN_PORT}`,
    );

    provider.on('error', logger.error);
    provider.on('connect', () => logger.info('Blockchain Connected ...'));
    provider.on('end', logger.error);

    this.web3 = new Web3(provider);
  },

  /**
   * Checks the status of connection
   *
   * @return {Boolean} - Resolves to true or false
   */
  isConnected() {
    if (this.web3) {
      return this.web3.eth.net.isListening();
    }
    return false;
  },
};
