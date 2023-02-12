import request from 'supertest';
import { nanoid } from 'nanoid';
import { DateTime } from 'luxon';
import Joi from 'joi';
import { StatusCodes } from 'http-status-codes';
import { MetaData } from '../src/types';
import { Config } from '../src/Config';
import { LoggerFactory } from '../src/LoggerFactory';
import { Controller } from '../src/Controller';
import { App } from '../src/App';
import { BusinessError } from '../src/Errors';
import { CustomError } from '../src/types';

const config = Config.create();

const loggerFactory = LoggerFactory.create({ config });

type Plus = {
  number1: number;
  number2: number;
};

const controller = Controller.on<Plus>('/plus', ({ data }) => {
  const { number1, number2 } = data;

  return {
    result: number1 + number2,
  };
}).validator({
  number1: Joi.number().required(),
  number2: Joi.number().required(),
});

test('Ok', async () => {
  const app = App.create({
    config,
    loggerFactory,
    controllers: [controller],
  });

  const { body } = await request(app.instance())
    .post('/plus')
    .send({
      meta: {
        serviceId: 'ms-test',
        timestamp: DateTime.local().toISO(),
        request: {
          traceId: nanoid(),
          ipAddress: '127.0.0.1',
          userId: nanoid(),
        },
      },
      data: {
        number1: 1,
        number2: 2,
      },
    });

  const { meta, data } = <MetaData>body;

  expect(meta.serviceId).toBe('unknown');
  expect((data as any).result).toBe(3);
});

test('InternalError', async () => {
  const app = App.create({
    config,
    loggerFactory,
    controllers: [controller],
  });

  const { body } = await request(app.instance())
    .post('/plus')
    .send({
      meta: {
        serviceId: 'ms-in',
        timestamp: DateTime.local().toISO(),
        request: {
          traceId: nanoid(),
          ipAddress: '127.0.0.1',
          userId: nanoid(),
        },
      },
      data: {
        number1: 1,
      },
    });

  const { error } = body as { error: CustomError };

  expect(error.message).toBe('"number2" es obligatorio');
  expect(error.status).toBe(StatusCodes.BAD_REQUEST);
  expect(error.type).toBe('internal');
});

test('BusinessError', async () => {
  const controller = Controller.on('/plus', () => {
    throw new BusinessError('dummy', StatusCodes.BAD_REQUEST, {
      translate: false,
    });
  });

  const app = App.create({
    config,
    loggerFactory,
    controllers: [controller],
  });

  const { body } = await request(app.instance())
    .post('/plus')
    .send({
      meta: {
        serviceId: 'ms-in',
        timestamp: DateTime.local().toISO(),
        request: {
          traceId: nanoid(),
          ipAddress: '127.0.0.1',
          userId: nanoid(),
        },
      },
      data: {},
    });

  const { error } = body as { error: CustomError };

  expect(error.message).toBe('dummy');
  expect(error.status).toBe(StatusCodes.BAD_REQUEST);
  expect(error.type).toBe('business');
});

test('Meta', async () => {
  const app = App.create({
    config,
    loggerFactory,
    controllers: [controller],
  });

  const { body } = await request(app.instance()).post('/plus').send({
    meta: {},
    data: {},
  });

  const { error } = body as { error: CustomError };

  expect(error.message).toBe('"meta.serviceId" es obligatorio');
  expect(error.status).toBe(StatusCodes.BAD_REQUEST);
  expect(error.type).toBe('internal');
});

test('404', async () => {
  const app = App.create({
    config,
    loggerFactory,
    controllers: [],
  });

  const { body } = await request(app.instance()).post('/plus').send();

  const { error } = body as { error: CustomError };

  expect(error.message).toBe('Ruta "&#x2F;plus" no encontrada');
  expect(error.status).toBe(StatusCodes.NOT_FOUND);
  expect(error.type).toBe('internal');
});
