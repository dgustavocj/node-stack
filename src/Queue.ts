import { Kafka, KafkaConfig, CompressionTypes } from 'kafkajs';
import mitt from 'mitt';
import Joi from 'joi';
import debugLib from 'debug';
import { parallel } from 'items-promise';
import { Undefinable } from 'tsdef';
import axios from 'axios';
import _ from 'lodash';
import { Format } from './plugins/Format';
import { LoggerFactory } from './LoggerFactory';
import { HealthCheck } from './HealthCheck';
import { QueueOptions, EventQueue, ControllerHandler, MetaData, Call, Emit } from './types';
import { readServices } from './rc';
import { packageJson } from './plugins';
const debug = debugLib('nodestack:queue');

type Config = {
  [key: string]: {
    brokers: string[];
    ssl: boolean;
    producers: {
      topic: string;
      timeout: number;
    }[];
    consumers: {
      topic: string;
      fromBeginning: boolean;
    }[];
  };
};

const schema = Joi.object<Config>()
  .pattern(
    /^/,
    Joi.object({
      brokers: Joi.array().items(Joi.string()).min(1).required(),
      ssl: Joi.boolean().default(false),
      producers: Joi.array()
        .items(
          Joi.object({
            topic: Joi.string().required(),
            timeout: Joi.number().default(30000),
          }),
        )
        .default([]),
      consumers: Joi.array()
        .items(
          Joi.object({
            topic: Joi.string().required(),
            fromBeginning: Joi.boolean().default(false),
          }),
        )
        .default([]),
    }),
  )
  .min(1);

export class Queue {
  readonly #id: string = packageJson.serviceId;
  readonly #emitter = mitt();
  readonly #events = new Map<EventQueue, ControllerHandler<any, any>[]>();
  readonly #config: Config;
  readonly #loggerFactory: LoggerFactory;
  readonly #healthCheck: Undefinable<HealthCheck>;

  static readonly #WILDCARD = '*';
  static readonly #SEPARATOR = ':';

  private constructor(config: Config, options: QueueOptions) {
    this.#config = config;
    this.#loggerFactory = options.loggerFactory;
    this.#healthCheck = options.healthCheck;

    this.#buildConnections();
  }

  static create(options: QueueOptions): Queue {
    const plainConfig = options.config.get('queue', {});

    const { value, error } = schema.validate(plainConfig, { abortEarly: false });

    if (error) {
      throw new Error(`Queue: ${error.message}`);
    }

    const config = value as Config;

    debug('config: %j', value);

    return new Queue(config, options);
  }

  #buildConnections(): void {
    Object.entries(this.#config).reduce((acc, [k, v]) => {
      const name = `${this.#id}:queue:${k}`;

      const { brokers, ssl, producers, consumers } = v;

      const connectOptions: KafkaConfig = {
        clientId: `${name}:client`,
        brokers,
        ssl,
      };

      debug('connectOptions: %j', connectOptions);

      const connection = new Kafka(connectOptions);

      this.#buildProducer(k, `${name}:producer`, connection, producers);
      this.#buildConsumer(k, `${name}:consumer`, connection, consumers);

      acc[k] = connection;

      return acc;
    }, {} as Record<string, Kafka>);
  }

  #buildProducer(
    queueName: string,
    producerName: string,
    connection: Kafka,
    config: Config['*']['producers'],
  ): void {
    const logger = this.#loggerFactory.getLogger();

    debug('booting/producer: %s', producerName);

    const producer = connection.producer();

    if (this.#healthCheck) {
      debug('healthCheck/producer: %s', producerName);

      const healthCheck = this.#healthCheck;
      healthCheck.registerService(producerName);
      healthCheck.registerShutdown(() => {
        logger.info(`shutdown connection: ${producerName}`);
        return producer.disconnect();
      });

      producer.on(producer.events.CONNECT, () => healthCheck.emit(producerName, true));
      producer.on(producer.events.DISCONNECT, () => healthCheck.emit(producerName, false));
    }

    debug('connecting/producer: %s', producerName);

    void producer.connect().then(() => {
      debug('conected/producer: %s', producerName);

      this.#emitter.on('*', (type, e) => {
        const [queue, topic, ...allEvent] = type.toString().split(Queue.#SEPARATOR);
        const event = allEvent.join(Queue.#SEPARATOR);

        const traceId: string = _.get(e, 'meta.request.traceId', 'unknown');

        debug('sending/producer> %s: %j', producerName, { queue, topic, event, traceId });

        if (
          (queue === Queue.#WILDCARD || queue === queueName) &&
          (topic === Queue.#WILDCARD || config.some((c) => c.topic === topic))
        ) {
          const body = e as MetaData;

          const content: MetaData = {
            meta: Format.meta(body.meta),
            data: body.data,
          };

          const configs =
            topic === Queue.#WILDCARD ? config : config.filter((c) => c.topic === topic);

          debug('send> traceId: %s, topics: %s', traceId, config.map((c) => c.topic).join(','));
          debug('send> traceId: %s, content: %j', traceId, content);

          configs.forEach((config) => {
            producer
              .send({
                acks: -1,
                timeout: config.timeout,
                compression: CompressionTypes.None,
                topic: config.topic,
                messages: [
                  {
                    value: JSON.stringify({
                      event,
                      content,
                    }),
                  },
                ],
              })
              .catch((error) => logger.error(error));
          });
        } else {
          debug('Bad Request[traceId]: %s', traceId);
        }
      });
    });
  }

  #buildConsumer(
    queueName: string,
    consumerName: string,
    connection: Kafka,
    configs: Config['*']['consumers'],
  ): void {
    const logger = this.#loggerFactory.getLogger();

    debug('booting/consumer: %s', consumerName);

    const consumer = connection.consumer({
      groupId: `${consumerName}:group`,
    });

    if (this.#healthCheck) {
      debug('healthCheck/consumer: %s', consumerName);

      const healthCheck = this.#healthCheck;
      healthCheck.registerService(consumerName);
      healthCheck.registerShutdown(() => {
        logger.info(`shutdown connection: ${consumerName}`);
        return consumer.disconnect();
      });
      consumer.on(consumer.events.CONNECT, () => healthCheck.emit(consumerName, true));
      consumer.on(consumer.events.DISCONNECT, () => healthCheck.emit(consumerName, false));
      consumer.on(consumer.events.HEARTBEAT, () => healthCheck.emit(consumerName, true));
      consumer.on(consumer.events.CRASH, (err: any) => {
        logger.error(err);
        healthCheck.emit(consumerName, false);
        setTimeout(() => process.exit(1), 1000);
      });

      consumer.on(consumer.events.STOP, () => healthCheck.emit(consumerName, false));
      consumer.on(consumer.events.REQUEST_TIMEOUT, () => healthCheck.emit(consumerName, false));
    }

    const services = readServices();

    debug('connecting/consumer: %s', consumerName);

    void consumer.connect().then(async () => {
      debug('conected/consumer: %s', consumerName);

      await parallel(configs, async ({ topic, fromBeginning }) => {
        debug('subscribing/consumer: %j', { topic, fromBeginning });

        await consumer.subscribe({
          fromBeginning,
          topic,
        });

        debug('subscribed/consumer: %j', { topic, fromBeginning });

        await consumer.run({
          autoCommit: true,
          eachMessage: async ({ topic: incomingTopic, message }) => {
            try {
              const { event: incomingEvent, content } = JSON.parse(
                message.value?.toString() ?? '{}',
              ) as {
                event: string;
                content: MetaData;
              };

              debug('incomingEvent/content: %j', { incomingEvent, content });

              await parallel(Array.from(this.#events.keys()), async (type) => {
                const [queue, topic, ...allEvent] = type.split(Queue.#SEPARATOR);
                const event = allEvent.join(Queue.#SEPARATOR);

                try {
                  if (
                    (queue === Queue.#WILDCARD || queue === queueName) &&
                    (topic === Queue.#WILDCARD || topic === incomingTopic) &&
                    (event === Queue.#WILDCARD || event === incomingEvent)
                  ) {
                    const handlers = this.#events.get(type);

                    if (handlers) {
                      // call <
                      const call: Call = async (event, data) => {
                        const [, service, ...rest] = event.split('/');

                        if (!services?.[service]) {
                          throw new Error(`call: The <${service}> service does not exist.`);
                        }

                        const { id, env } = services[service];

                        const hostname = process.env.NODE_ENV === 'local' ? 'localhost' : id;

                        // TODO: puerto por defecto para todos los servicios
                        const port: number = _.get(env, [process.env.NODE_ENV || '', 'port'], 3000);

                        const response = await axios.post(
                          `http://${hostname}:${port}/${rest.join('/')}`,
                          {
                            meta: content.meta,
                            data,
                          },
                        );

                        return response.data;
                      };
                      // call >
                      // emit <
                      const emit: Emit = (event, data) => {
                        this.emit(event, {
                          meta: content.meta,
                          data,
                        });
                      };
                      // emit >

                      await parallel(handlers, async (handler) => {
                        const traceId: string = _.get(content, 'meta.request.traceId', 'unknown');

                        debug('receiving> traceId: %s, topic: %s', traceId, topic);
                        debug('receiving> traceId: %s, content: %j', traceId, content);

                        await handler.call(null, {
                          data: content.data,
                          meta: content.meta,
                          call,
                          emit,
                        });
                      });
                    } else {
                      debug('No handler registered for: %j', { incomingEvent, content });
                    }
                  }
                } catch (error) {
                  logger.error(error);
                }
              });
            } catch (error) {
              logger.error(error);
            }
          },
        });
      });
    });
  }

  // - queue:topic:event1
  // - queue:audit:event2
  // - queue:topic:*
  // - queue:*:*
  // - *:*:*
  emit(event: EventQueue, metaData: MetaData): void {
    debug('emit', event);
    this.#emitter.emit(event, metaData);
  }

  // - queue:topic:event1
  // - queue:audit:event2
  // - queue:topic:*
  // - queue:*:*
  // - *:*:*
  on(event: EventQueue, handler: ControllerHandler): void {
    debug('on', event);
    if (this.#events.has(event)) {
      this.#events.get(event)?.push(handler);
    } else {
      this.#events.set(event, [handler]);
    }
  }
}
