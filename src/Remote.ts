import { SharedIniFileCredentials, SecretsManager } from 'aws-sdk';
import { parallel } from 'items-promise';
import defaults from 'defaults';
import debugLib from 'debug';
import { readSecrets } from './rc';
import { RemoteModuleOptions, KeyValue } from './types';

const debug = debugLib('nodestack:remote');

type Info = KeyValue;

export class Remote {
  private constructor() {
    // empty
  }

  static async loadSecrets(options?: RemoteModuleOptions): Promise<KeyValue | never> {
    const optionsWithDefaultValues: Required<RemoteModuleOptions> = defaults(options, {
      name: 'nodestack',
      env: process.env.NODE_ENV,
    });

    debug('loadSecrets/options: %j', optionsWithDefaultValues);

    const secrets = readSecrets({
      name: optionsWithDefaultValues.name,
    });

    debug('loadSecrets/secrets: %j', secrets);

    if (!secrets) return {};

    const keys = Object.keys(secrets);

    debug('loadSecrets/keys: %j', keys);

    const secretsOptions: SecretsManager.Types.ClientConfiguration = {
      region: process.env.NODE_REG,
    };

    if (optionsWithDefaultValues.env === 'local') {
      secretsOptions.region = 'us-east-1';
      secretsOptions.credentials = new SharedIniFileCredentials({ profile: 'local' });
      secretsOptions.endpoint = 'http://localhost:4566';
    }

    debug('loadSecrets/secretsOptions: %j', secretsOptions);

    const secretsManager = new SecretsManager(secretsOptions);

    const obj: KeyValue = {};

    await parallel(keys, async (key) => {
      const value = await secretsManager.getSecretValue({ SecretId: key }).promise();

      debug('loadSecrets/key %s: %j', key, value);

      const data = JSON.parse(value.SecretString || '{}') as Info;

      debug('loadSecrets/key %s: %j', key, data);

      const module = secrets[key];

      if (module.namespaced) {
        obj[key] = data;
      } else {
        Object.entries(data).forEach(([key, value]) => (obj[key] = value));
      }
    });

    debug('loadSecrets/value: %j', obj);

    return obj;
  }
}
