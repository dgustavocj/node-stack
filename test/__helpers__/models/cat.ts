import { Connection, Document, Model, Schema } from 'mongoose';

interface ICat {
  _id: string;
  name: string;
}

const CatSchemaFields: Record<keyof ICat, any> = {
  _id: String,
  name: String,
};

interface ICatDoc extends ICat, Document {
  _id: string;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface ICatModel extends Model<ICatDoc> {}

const CatSchema = new Schema<ICatDoc, ICatModel>(CatSchemaFields, {});

export default (connection: Connection): ICatModel =>
  connection.model<ICatDoc, ICatModel>('Cat', CatSchema);
