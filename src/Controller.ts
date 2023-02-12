import Joi, { SchemaMap, ObjectSchema } from 'joi';
import { ControllerEvent, ControllerHandler } from './types';

function isObjectSchema(param: SchemaMap | ObjectSchema): param is ObjectSchema {
  return (param as ObjectSchema).type === 'object';
}

export class Controller<T = unknown, R = unknown> {
  readonly #events: ControllerEvent[];
  readonly #handler: ControllerHandler<T, R>;
  readonly #schemas: (SchemaMap | ObjectSchema<T>)[] = [];

  static readonly #ROUTE_SEPARATOR = '/';
  static readonly #QUEUE_SEPARATOR = '@';

  private constructor(events: ControllerEvent[], handler: ControllerHandler<T, R>) {
    this.#events = events;
    this.#handler = handler;
  }

  static on<T = unknown, R = unknown>(
    event: ControllerEvent | ControllerEvent[],
    handler: ControllerHandler<T, R>,
  ): Controller<T, R> {
    const events = typeof event === 'string' ? [event] : event;

    return new Controller(events, handler);
  }

  validator(schema: SchemaMap<T> | ObjectSchema<T>): this {
    this.#schemas.push(schema);

    return this;
  }

  getRouteEvents(): Readonly<ControllerEvent[]> {
    return this.#events.filter((e) => e.startsWith(Controller.#ROUTE_SEPARATOR));
  }

  getQueueEvents(): Readonly<ControllerEvent[]> {
    return this.#events.filter((e) => e.startsWith(Controller.#QUEUE_SEPARATOR));
  }

  getHandler(): ControllerHandler<T, R> {
    return this.#handler;
  }

  getSchema(): ObjectSchema {
    let schema = Joi.object();

    this.#schemas.forEach((s) => {
      schema = schema.concat(isObjectSchema(s) ? s : Joi.object(s));
    });

    return schema;
  }
}
