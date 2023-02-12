import { DateTime } from 'luxon';
import path from 'path';
import fs from 'fs';
import { Meta } from '../types';

const packageJsonAsSring = fs.readFileSync(path.resolve('package.json'), {
  encoding: 'utf-8',
});

export const packageJson = JSON.parse(packageJsonAsSring);

export class Format {
  static meta(meta: Meta): Meta {
    return {
      serviceId: packageJson.serviceId || 'unknown',
      timestamp: DateTime.local()
        .setZone('America/Lima')
        .toFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'ZZZ"),
      request: meta.request,
      sessionId: meta.sessionId,
    };
  }
}
