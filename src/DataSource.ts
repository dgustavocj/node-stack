import mongoose from 'mongoose';
import Redis from 'ioredis';
import  knex  from 'knex';
import Joi from 'joi';
import { nanoid } from 'nanoid';
import fs from 'fs';
import path from 'path';
import { Undefinable } from 'tsdef';
import debugLib from 'debug';
import { DataSourceOptions } from './types';
import { LoggerFactory } from './LoggerFactory';
import { HealthCheck } from './HealthCheck';

const debug = debugLib('nodestack:dataSource');

type ConfigMongoose = {
  [name: string]: {
    uri: string;
    useFindAndModify?: boolean;
    useCreateIndex?: boolean;
    useNewUrlParser?: boolean;
    useUnifiedTopology?: boolean;
    bufferCommands?: boolean;
    keepAlive?: boolean;
    keepAliveInitialDelay?: number;
    ssl?: boolean;
    sslValidate?: boolean;
    sslCA?: string[];
  };
};

type ConfigIoRedis = {
  [name: string]: {
    host: string;
    port: number;
  };
};

type ConfigKnex = {
  [name: string]: {
    client: string;
    connection: Record<string, unknown> | string;
    [others: string]: unknown;
  };
};

type Config = Partial<{
  mongoose: ConfigMongoose;
  ioredis: ConfigIoRedis;
  knex: ConfigKnex;
}>;

const schema = Joi.object<Config>({
  mongoose: Joi.object()
    .pattern(
      /^/,
      Joi.object({
        uri: Joi.string().required(),
        useFindAndModify: Joi.boolean(),
        useCreateIndex: Joi.boolean(),
        useNewUrlParser: Joi.boolean(),
        useUnifiedTopology: Joi.boolean(),
        bufferCommands: Joi.boolean(),
        keepAlive: Joi.boolean(),
        keepAliveInitialDelay: Joi.number(),
        ssl: Joi.boolean(),
        sslValidate: Joi.boolean(),
        sslCA: Joi.array().items(Joi.string()),
      }),
    )
    .min(1),
  ioredis: Joi.object()
    .pattern(
      /^/,
      Joi.object({
        host: Joi.string().required(),
        port: Joi.number().required(),
      }),
    )
    .min(1),
  knex: Joi.object()
    .pattern(
      /^/,
      Joi.object({
        client: Joi.string().required(),
        connection: Joi.alternatives().try(Joi.object(), Joi.string()).required(),
      }).concat(Joi.object().pattern(/^/, Joi.any())),
    )
    .min(1),
});

export class DataSource {
  readonly #id: string = nanoid();
  readonly #loggerFactory: LoggerFactory;
  readonly #healthCheck: Undefinable<HealthCheck>;
  readonly mongoose: Record<string, mongoose.Connection> = {};
  readonly ioredis: Record<string, Redis.Redis> = {};
  readonly knex: Record<string, knex<any, unknown[]>> = {};

  private constructor(config: Config, options: DataSourceOptions) {
    this.#loggerFactory = options.loggerFactory;
    this.#healthCheck = options.healthCheck;

    if (config.mongoose) {
      this.#buildMongooseConnections(config.mongoose);
    }

    if (config.ioredis) {
      this.#buildIoredisConnections(config.ioredis);
    }

    if (config.knex) {
      this.#buildKnexConnections(config.knex);
    }
  }

  static create(options: DataSourceOptions): DataSource {
    const plainConfig = options.config.get('dataSource', {});

    const { value, error } = schema.validate(plainConfig, { abortEarly: false });

    if (error) {
      throw new Error(`DataSource: ${error.message}`);
    }

    const config = value as Config;

    debug('config: %j', value);

    return new DataSource(config, options);
  }

  #buildMongooseConnections(config: ConfigMongoose): void {
    const logger = this.#loggerFactory.getLogger();

    Object.entries(config).reduce((acc, [k, v]) => {
      const name = `${this.#id}:mongoose:${k}`;

      const { uri, ...rest } = v;

      const connectOptions: mongoose.ConnectionOptions = {
        useFindAndModify: false,
        useCreateIndex: true,
        useNewUrlParser: true,
        useUnifiedTopology: true,
        bufferCommands: false,
        keepAlive: true,
        keepAliveInitialDelay: 5000,
        ssl: false,
        sslValidate: false,
        ...rest,
      };

      if (v.sslCA) {
        connectOptions.sslCA = v.sslCA.map((item) => fs.readFileSync(path.resolve(item), 'utf8'));
      }

      debug('connecting/mongoose: %s', name);

      const connection = mongoose.createConnection(uri, connectOptions);

      debug('conected/mongoose: %s', name);

      if (this.#healthCheck) {
        debug('healthCheck/mongoose: %s', name);

        const healthCheck = this.#healthCheck;
        healthCheck.registerService(name);
        healthCheck.registerShutdown(() => {
          logger.info(`shutdown connection: ${name}`);
          return connection.close();
        });

        void connection.on('open', () => healthCheck.emit(name, true));
        void connection.on('disconnected', () => healthCheck.emit(name, false));
        void connection.on('close', () => healthCheck.emit(name, false));
        void connection.on('reconnected', () => healthCheck.emit(name, true));
        void connection.on('error', (err: Error) => {
          logger.error(err);
          healthCheck.emit(name, false);
        });
        void connection.on('reconnectFailed', () => healthCheck.emit(name, false));
      }

      acc[k] = connection;

      return acc;
    }, this.mongoose);
  }

  #buildIoredisConnections(config: ConfigIoRedis): void {
    const logger = this.#loggerFactory.getLogger();

    Object.entries(config).reduce((acc, [k, v]) => {
      const name = `${this.#id}:ioredis:${k}`;

      const { host, port, ...rest } = v;

      const connectOptions: Redis.RedisOptions = {
        host,
        port,
        ...rest,
      };

      debug('connecting/ioredis: %s', name);

      const connection = new Redis(connectOptions);

      debug('conected/ioredis: %s', name);

      if (this.#healthCheck) {
        debug('healthCheck/ioredis: %s', name);

        const healthCheck = this.#healthCheck;
        healthCheck.registerService(name);
        healthCheck.registerShutdown(() => {
          logger.info(`shutdown connection: ${name}`);
          return connection.quit();
        });

        connection.on('ready', () => healthCheck.emit(name, true));
        connection.on('error', (err: Error) => {
          logger.error(err);
          healthCheck.emit(name, false);
        });
        connection.on('close', () => healthCheck.emit(name, false));
      }

      acc[k] = connection;

      return acc;
    }, this.ioredis);
  }

  #buildKnexConnections(config: ConfigKnex): void {
    const logger = this.#loggerFactory.getLogger();

    Object.entries(config).reduce((acc, [k, v]) => {
      const name = `${this.#id}:knex:${k}`;

      const { client, connection: conn, ...rest } = v;

      debug('connecting/knex: %s', name);

      const connection = knex({
        client,
        connection: conn,
        ...rest,
      });

      debug('conected/knex: %s', name);

      if (this.#healthCheck) {
        debug('healthCheck/knex: %s', name);

        const healthCheck = this.#healthCheck;
        healthCheck.registerService(name);
        healthCheck.registerShutdown(() => {
          logger.info(`shutdown connection: ${name}`);
          return connection.destroy();
        });
        healthCheck.emit(name, true);
      }

      acc[k] = connection;

      return acc;
    }, this.knex);
  }
}
