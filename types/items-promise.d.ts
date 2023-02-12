declare module 'items-promise' {
  export function parallel<T, R = unknown>(tasks: T[], fn: (task: T) => Promise<R>): Promise<R[]>;

  export function serial<T, R = unknown>(tasks: T[], fn: (task: T) => Promise<R>): Promise<R>;
}


