import pRetry from 'p-retry';
import delay from 'delay';
import { Commons } from '../src/Commons';
import { Config } from '../src/Config';
import { LoggerFactory } from '../src/LoggerFactory';
import { HealthCheck } from '../src/HealthCheck';
import { DataSource } from '../src/DataSource';
import { Nullable } from 'tsdef';

let dataSource: DataSource;

beforeAll(async () => {
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
    dataSource: {
      mongoose: {
        commons: {
          uri: process.env.MONGO_URL,
          bufferCommands: true,
        },
      },
    },
  };

  const config = Config.create(plainConfig);

  const loggerFactory = LoggerFactory.create({ config });

  const healthCheck = HealthCheck.create();

  dataSource = DataSource.create({
    healthCheck,
    config,
    loggerFactory,
  });

  const run = async (): Promise<void> => {
    if (!healthCheck.isReady()) {
      await delay(200);

      throw new Error('not ready');
    }
  };

  await pRetry(run, { retries: 5 });
});

afterAll(async () => {
  await dataSource.mongoose.commons.close();
});

test('Commons', async () => {
  const commons = Commons.create({ dataSource });

  await commons.insertMany('foo', [
    { alias: 'a', slug: 'g1' },
    { alias: 'b', slug: 'g1' },
  ]);
  await commons.insertOne('foo', { alias: 'c', slug: 'g2' });

  const many = await commons.find('foo', { slug: 'g1' });

  expect(many).toHaveLength(2);

  const only = (await commons.findOne('foo', { alias: 'c' })) as Nullable<{
    alias: string;
    slug: string;
  }>;

  expect(only?.slug).toBe('g2');
});
