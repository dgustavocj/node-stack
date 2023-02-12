import express from 'express';
import 'express-async-errors';
import http from 'http';
import i18next from 'i18next';
import i18nextMiddleware from 'i18next-http-middleware';
import Backend from 'i18next-fs-backend';
import path from 'path';
import { StatusCodes } from 'http-status-codes';
import debugLib from 'debug';
import { Undefinable } from 'tsdef';
import axios from 'axios';
import _ from 'lodash';
import helmet from 'helmet';
import cors from 'cors';
import { nanoid } from 'nanoid';
import { metaData } from './schemas';
import { Format } from '../plugins/Format';
import { nestedReplacements } from './utils';
import { AppOptions, EventQueue, EventRoute, Call, MetaData, MetaError, Emit } from '../types';
import { BaseError, InternalError, ExposeError, InvalidArgumentError } from '../Errors';
import { Controller } from '../Controller';
import { Queue } from '../Queue';
import { LoggerFactory } from '../LoggerFactory';
import { HealthCheck } from '../HealthCheck';
import { readServices, readApp } from '../rc';
import messages from './messages';

const debug = debugLib('nodestack:app');

export class App {
  readonly #id: string = nanoid();
  readonly #app: express.Application;
  readonly #loggerFactory: LoggerFactory;
  readonly #queue: Undefinable<Queue>;
  readonly #healthCheck: Undefinable<HealthCheck>;

  private constructor(options: AppOptions) {
    this.#loggerFactory = options.loggerFactory;
    this.#queue = options.queue;
    this.#healthCheck = options.healthCheck;

    const logger = this.#loggerFactory.getLogger();

    const app = express();
    app.use(express.json());
    app.use(cors());
    app.use(helmet());

    void i18next
      .use(Backend)
      .use(i18nextMiddleware.LanguageDetector)
      .init({
        debug: false,
        initImmediate: false,
        backend: {
          loadPath: path.resolve('locales') + '/{{lng}}/{{ns}}.json',
          addPath: path.resolve('locales') + '/{{lng}}/{{ns}}.missing.json',
        },
        fallbackLng: 'es',
        preload: ['es'],
        saveMissing: true,
      });

    app.use(i18nextMiddleware.handle(i18next));

    const services = readServices();

    const handler = (event: string, controller: Controller<any, any>): void => {
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      app.post(event, async (req, res) => {
        logger.trace(req.body);

        let { value, error } = metaData.validate(req.body, {
          abortEarly: true,
        });

        if (error) {
          throw new InternalError(error.message, StatusCodes.BAD_REQUEST, {
            translate: true,
            replacements: error.details
              ? {
                  ...(error.details[0]?.context ?? {}),
                }
              : {},
          });
        }

        req.body = value;

        const { meta, data } = req.body as MetaData;

        const schema = controller.getSchema().messages(messages);

        ({ value, error } = schema.validate(data, { abortEarly: true }));

        if (error) {
          throw new InternalError(error.message, StatusCodes.BAD_REQUEST, {
            translate: true,
            replacements: error.details
              ? {
                  ...(error.details[0]?.context ?? {}),
                }
              : {},
          });
        }

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

          const response = await axios.post(`http://${hostname}:${port}/${rest.join('/')}`, {
            meta,
            data,
          });

          return response.data;
        };
        // call >
        // emit <
        const emit: Emit = (event, data) =>
          this.#queue?.emit(event, {
            meta,
            data,
          });
        // emit >

        const response = await controller.getHandler()({
          data: value,
          meta,
          call,
          emit,
          request: req,
        });

        const out: MetaData = {
          meta: Format.meta(meta),
          data: response || {},
        };

        logger.trace(out);

        res
          .set({
            'x-status-code': StatusCodes.OK,
            'x-trace-id': out.meta.request.traceId,
          })
          .json(out);
      });
    };

    options.controllers.forEach((ctrl) => {
      ctrl.getRouteEvents().forEach((e) => {
        const event = e as EventRoute;

        debug('route', event);

        handler(event, ctrl);
      });
      ctrl.getQueueEvents().forEach((e) => {
        const event = e.substring(1) as EventQueue;

        const queue = this.#queue;

        if (queue) {
          const handler = ctrl.getHandler();

          queue.on(event, handler);
        }
      });
    });

    app.use((req, _res) => {
      throw new InternalError('generic.errors.pathNotFound', StatusCodes.NOT_FOUND, {
        translate: true,
        replacements: {
          path: req.path,
        },
      });
    });

    app.use(
      (err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
        const { meta } = <Partial<MetaData>>req.body;

        const out: MetaError = {
          meta: meta ? Format.meta(meta) : undefined,
          error: {
            message: req.t('generic.errors.internalServerError'),
            status: StatusCodes.INTERNAL_SERVER_ERROR,
            type: 'internal',
          },
        };

        if (err instanceof BaseError) {
          const message = err.options.translate
            ? err instanceof ExposeError
              ? nestedReplacements(err.phrase, err.options.replacements)
              : err instanceof InvalidArgumentError
              ? nestedReplacements(
                 req.t(err.message, err.options.replacements),
                 err.options.replacements,
                )
              : req.t(err.message, err.options.replacements)
            : err.message;

          out.error.message = message;
          out.error.status = err.status;
          out.error.type = err.type;
        } else {
          logger.error(err);
        }

        logger.trace(out);

        res
          .set({
            'x-status-code': out.error.status,
            'x-trace-id': out.meta?.request?.traceId ?? 'unknown',
          })
          .json(out);
      },
    );

    this.#app = app;
  }

  static create(options: AppOptions): App {
    return new App(options);
  }

  async start(): Promise<void> {
    try {
      debug('booting %s', this.#id);

      await this.#listen();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      process.exit(1);
    }
  }

  #listen(): Promise<void> {
    const logger = this.#loggerFactory.getLogger();

    const server = http.createServer(this.#app);

    this.#healthCheck?.listen(server);

    const app = readApp();

    const port: number = _.get(app, ['env', process.env.NODE_ENV || '', 'port'], 3000);

    return new Promise((resolve, reject) =>
      server
        .listen(port)
        .once('listening', () => {
          logger.info(`🚀 server running on port ${port}`);
          resolve();
        })
        .once('error', reject),
    );
  }

  instance(): express.Application {
    return this.#app;
  }
}
