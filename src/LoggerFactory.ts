import log4js, { Configuration, Logger } from 'log4js';
import Joi from 'joi';
import debugLib from 'debug';
import { LoggerFactoryOptions } from './types';

const debug = debugLib('nodestack:loggerFactory');

function proxyLogger(logger: Logger): {
  trace: (message: any, ...args: any[]) => void;
  debug: (message: any, ...args: any[]) => void;
  info: (message: any, ...args: any[]) => void;
  warn: (message: any, ...args: any[]) => void;
  error: (message: any, ...args: any[]) => void;
  fatal: (message: any, ...args: any[]) => void;
} {
  return {
    trace(message: any, ...args: any[]): void {
      logger.trace.apply(logger, [message, ...args]);
    },
    debug(message: any, ...args: any[]): void {
      logger.debug.apply(logger, [message, ...args]);
    },
    info(message: any, ...args: any[]): void {
      logger.info.apply(logger, [message, ...args]);
    },
    warn(message: any, ...args: any[]): void {
      logger.warn.apply(logger, [message, ...args]);
    },
    error(message: any, ...args: any[]): void {
      logger.error.apply(logger, [message, ...args]);
    },
    fatal(message: any, ...args: any[]): void {
      logger.fatal.apply(logger, [message, ...args]);
    },
  };
}

type Config = {
  appenders: {
    [name: string]: {
      type: string;
      layout?: {
        type: string;
        [rest: string]: unknown;
      };
      [rest: string]: unknown;
    };
  };
  categories: {
    [name: string]: {
      appenders: string[];
      level: string;
    };
  };
};

const schema = Joi.object<Config>({
  appenders: Joi.object()
    .pattern(
      /^/,
      Joi.object({
        type: Joi.string().required(),
      }).min(1),
    )
    .required()
    .min(1),
  categories: Joi.object()
    .pattern(
      /^/,
      Joi.object({
        appenders: Joi.array().items(Joi.string()),
        level: Joi.string().valid('trace', 'debug', 'info', 'warn', 'error', 'fatal'),
      }).min(1),
    )
    .required()
    .min(1),
});

const defaultConfig = {
  appenders: {
    out: {
      type: 'stdout',
    },
  },
  categories: {
    default: {
      appenders: ['out'],
      level: 'trace',
    },
  },
};

export class LoggerFactory {
  private constructor(config: Configuration) {
    log4js.configure(config);
  }

  static create(options: LoggerFactoryOptions): LoggerFactory | never {
    const plainConfig = options.config.get('loggerFactory', defaultConfig);

    const { value, error } = schema.validate(plainConfig, { abortEarly: false });

    if (error) {
      throw new Error(`LoggerFactory: ${error.message}`);
    }

    const config = value as Config;

    debug('config: %j', value);

    return new LoggerFactory({
      appenders: config.appenders,
      categories: config.categories,
    });
  }

  getLogger(category?: string): ReturnType<typeof proxyLogger> {
    const logger = log4js.getLogger(category);

    return proxyLogger(logger);
  }
}
