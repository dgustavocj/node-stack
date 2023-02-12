import { CustomError } from 'ts-custom-error';

type Options = Readonly<
  Partial<{
    replacements: Readonly<Record<string, unknown>>;
    translate: boolean;
  }>
>;

export class BaseError extends CustomError {
  constructor(
    public readonly type: 'business' | 'internal' | 'expose' | 'invalidArgument',
    public readonly message: string,
    public readonly status: number,
    public readonly options: Options = {},
  ) {
    super(message);
    this.options = {
      replacements: {},
      translate: true,
      ...options,
    };
  }
}

export class BusinessError extends BaseError {
  constructor(
    public readonly phrase: string,
    public readonly status: number,
    public readonly options: Options = {},
  ) {
    super('business', phrase, status, options);
  }
}

export class InternalError extends BaseError {
  constructor(
    public readonly phrase: string,
    public readonly status: number,
    public readonly options: Options = {},
  ) {
    super('internal', phrase, status, options);
  }
}

export class ExposeError extends BaseError {
  constructor(
    public readonly phrase: Readonly<Record<string, unknown>>,
    public readonly status: number,
    public readonly options: Options = {},
  ) {
    super('expose', JSON.stringify(phrase), status, options);
  }
}

export class InvalidArgumentError extends BaseError {
  constructor(
    public readonly phrase: string,
    public readonly status: number,
    public readonly options: Options = {},
  ) {
    super('invalidArgument', phrase, status, options);
  }
}
