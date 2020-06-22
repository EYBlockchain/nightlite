/*
  Pulled from https://github.com/winstonjs/winston/issues/1427 with some edits.
*/

const { createLogger, format, transports } = require('winston');
const { inspect } = require('util');

function formatWithInspect(val) {
  return `${val instanceof Object ? '\n' : ''} ${inspect(val, { depth: null, colors: true })}`;
}

const logLevel = process.env.NIGHTLITE_LOG_LEVEL ? process.env.NIGHTLITE_LOG_LEVEL : 'info';

module.exports = createLogger({
  level: logLevel,
  format: format.combine(
    format.errors({ stack: true }),
    format.colorize(),
    format.printf(info => {
      const splatArgs = info[Symbol.for('splat')];
      let log = `${info.level}: ${info.message}`;

      // append splat messages to log
      if (splatArgs) {
        const rest = splatArgs.map(data => formatWithInspect(data)).join();
        log += ` ${rest}`;
      }

      // check if error log, if so append error stack
      if (info.stack) {
        log += ` ${info.stack}`;
      }
      return log;
    }),
  ),
  transports: [new transports.Console()],
});
