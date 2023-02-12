import { Config } from '../src/Config';
import { LoggerFactory } from '../src/LoggerFactory';

const plainConfig = {
  loggerFactory: {
    appenders: {
      cheese: {
        type: 'stdout',
      },
    },
    categories: {
      default: {
        appenders: ['cheese'],
        level: 'trace',
      },
    },
  },
};

const config = Config.create(plainConfig);

test('configure', () => {
  const loggerFactory = LoggerFactory.create({ config });

  const logger = loggerFactory.getLogger('cheese');

  logger.trace('trace');
  logger.debug('debug');
  logger.info('info');
  logger.warn('warn');
  logger.error('error');
  logger.fatal('fatal');

  expect(1).toBe(1);
});
