import Joi from 'joi';
import { rcFile } from 'rc-config-loader';
import defaults from 'defaults';
import debugLib from 'debug';
import { Nullable } from 'tsdef';

const debug = debugLib('nodestack:rc');

type App = {
  env: {
    [name: string]: {
      port: number;
    };
  };
};

type Secret = {
  namespaced: boolean;
};

type Secrets = {
  [name: string]: Secret;
};

type Service = {
  id: string;
  env: {
    [name: string]: {
      port: number;
    };
  };
};

type Services = {
  [name: string]: Service;
};

type RC = Partial<{
  app: App;
  secrets: Secrets;
  services: Services;
}>;

type RCOptions = Partial<{
  name: string;
}>;

const schemas = {
  app: Joi.object({
    env: Joi.object()
      .pattern(
        /^/,
        Joi.object({
          port: Joi.number().default(3000),
        }),
      )
      .required()
      .min(1),
  }),
  secrets: Joi.object()
    .pattern(
      /^/,
      Joi.object({
        namespaced: Joi.boolean().default(true),
      }),
    )
    .min(1),
  services: Joi.object()
    .pattern(
      /^/,
      Joi.object({
        id: Joi.string().required(),
        env: Joi.object()
          .pattern(
            /^/,
            Joi.object({
              port: Joi.number().default(3000),
            }),
          )
          .required()
          .min(1),
      }),
    )
    .min(1),
};

type Key = 'app' | 'secrets' | 'services';

function read<T>(key: Key, options?: RCOptions): Nullable<T> | never {
  const optionsWithDefaultValues: Required<RCOptions> = defaults(options, {
    name: 'nodestack',
  });

  debug('key: %s', key);

  const rc = rcFile<RC>(optionsWithDefaultValues.name);

  debug('rc: %j', rc);

  if (!rc || !rc.config[key]) return null;

  const { value, error } = schemas[key].validate(rc.config[key], { abortEarly: false });

  if (error) throw new Error(`rc: ${error.message}`);

  debug('value: %j', value);

  return value as T;
}

export function readApp(options?: RCOptions): Nullable<App> | never {
  return read<App>('app', options);
}

export function readSecrets(options?: RCOptions): Nullable<Secrets> | never {
  return read<Secrets>('secrets', options);
}

export function readServices(options?: RCOptions): Nullable<Services> | never {
  return read<Services>('services', options);
}
