import { MetaError, MetaData } from './types';

export function isMetaError(object: MetaData | MetaError): object is MetaError {
  return (object as MetaError).error !== undefined;
}
