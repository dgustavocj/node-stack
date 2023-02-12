import pRetry from 'p-retry';
import delay from 'delay';
import { Config } from '../src/Config';
import { LoggerFactory } from '../src/LoggerFactory';
import { HealthCheck } from '../src/HealthCheck';
import { DataSource } from '../src/DataSource';
import CatModel from './__helpers__/models/cat';

let dataSource: DataSource;

beforeAll(async () => {
  const plainConfig = {
    dataSource: {
      mongoose: {
        test: {
          uri: process.env.MONGO_URL,
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
  await dataSource.mongoose.test.close();
});

test('DataSource', async () => {
  const Cat = CatModel(dataSource.mongoose.test);

  await Cat.findByIdAndDelete('123456');

  await Cat.create({
    _id: '123456',
    name: 'Michi',
  });

  const found = await Cat.findById('123456');

  expect(found?.name).toBe('Michi');

  const michis = await Cat.find({});

  expect(michis.length).toBe(1);
});
