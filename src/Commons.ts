import { Connection, Model, Schema } from 'mongoose';
import { CommonsOptions } from './types';

interface ICommon {
  [key: string]: unknown;
}

const CommonSchemaFields: Record<keyof ICommon, any> = {};

interface ICommonDoc extends ICommon, Document {}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface ICommonModel extends Model<ICommonDoc> {}

export class Commons {
  static #CONNECTION = 'commons';

  readonly #connection: Connection;
  #models = new Map<string, ICommonModel>();

  private constructor(connection: Connection) {
    this.#connection = connection;
  }

  static create(options: CommonsOptions): Commons {
    const connection = options.dataSource.mongoose[Commons.#CONNECTION];

    if (!connection) {
      throw new Error(`Commons: The <${Commons.#CONNECTION}> connection does not exist.`);
    }

    return new Commons(connection);
  }

  getModel(collection: string): ICommonModel {
    if (!this.#models.has(collection)) {
      const CommonSchema = new Schema<ICommonDoc, ICommonModel>(CommonSchemaFields, {
        strict: false,
        collection,
      });

      this.#models.set(
        collection,
        this.#connection.model<ICommonDoc, ICommonModel>(collection, CommonSchema),
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return this.#models.get(collection)!;
  }

  async insertOne(collection: string, doc: Record<string, unknown>): Promise<void> {
    await this.getModel(collection).create(doc);
  }

  async insertMany(collection: string, docs: Record<string, unknown>[]): Promise<void> {
    await this.getModel(collection).create(docs);
  }

  async find(collection: string, filter: Record<string, unknown>): Promise<unknown[]> {
    const documents = await this.getModel(collection).find(filter).exec();

    return documents.map((document) => document.toJSON());
  }

  async findOne(collection: string, filter: Record<string, unknown>): Promise<unknown | null> {
    const document = await this.getModel(collection).findOne(filter);

    return document?.toJSON() ?? null;
  }
}
