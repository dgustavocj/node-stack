import dotProp from 'dot-prop';
import merge from 'deepmerge';
import defaults from 'defaults';
import path from 'path';
import fs from 'fs';
import ejs from 'ejs';
import YAML from 'yaml';
import debugLib from 'debug';
import { ConfigCreateFromTemplateOptions } from './types';

const debug = debugLib('nodestack:config');

export class Config {
  #object: Record<string, unknown>;

  private constructor(object: Record<string, unknown>) {
    this.#object = object;
  }

  static create(object: Record<string, unknown> = {}): Config {
    const clone = JSON.parse(JSON.stringify(object));

    debug('value: %j', clone);

    return new Config(clone);
  }

  static createFromTemplate(
    data: Record<string, unknown>,
    options?: ConfigCreateFromTemplateOptions,
  ): Config {
    const config = Config.create();

    return config.fillFromTemplate(data, options);
  }

  fillFromTemplate(data: Record<string, unknown>, options?: ConfigCreateFromTemplateOptions): this {
    const optionsWithDefaultValues: Required<ConfigCreateFromTemplateOptions> = defaults(options, {
      folder: 'config',
      name: 'template',
    });

    const folder = path.resolve(optionsWithDefaultValues.folder);

    const template = fs.readFileSync(path.join(folder, `${optionsWithDefaultValues.name}.ejs`), {
      encoding: 'utf-8',
    });

    const compiled = ejs.render(template, data, { async: false });

    return this.merge(YAML.parse(compiled));
  }

  get<T>(path: string, defaultValue?: T): T {
    //return dotProp.get(this.#object, path, defaultValue) as T;
    return dotProp.getProperty(this.#object, path, defaultValue) as T;
  }

  set(path: string, value: unknown): void {
    dotProp.setProperty(this.#object, path, value);
  }

  has(path: string): boolean {
    return dotProp.hasProperty(this.#object, path);
  }

  delete(path: string): boolean {
    return dotProp.deleteProperty(this.#object, path);
  }

  merge(object: Record<string, unknown> | Config): this {
    this.#object = merge(this.#object, this.#isConfig(object) ? object.#object : object);
    return this;
  }

  #isConfig(object: Record<string, unknown> | Config): object is Config {
    return object instanceof Config;
  }
}
