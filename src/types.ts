import { Config } from './Config';
import { HealthCheck } from './HealthCheck';
import { LoggerFactory } from './LoggerFactory';
import { DataSource } from './DataSource';
import { Queue } from './Queue';
import { Controller } from './Controller';
import express from 'express';

export type KeyValue = Record<string, unknown>;

export interface LoggerFactoryOptions {
  config: Config;
}

export interface DataSourceOptions {
  healthCheck?: HealthCheck;
  loggerFactory: LoggerFactory;
  config: Config;
}

export interface CommonsOptions {
  dataSource: DataSource;
}

export interface QueueOptions {
  healthCheck?: HealthCheck;
  loggerFactory: LoggerFactory;
  config: Config;
}

export type RemoteModuleOptions = Partial<{
  name: string;
  env: string;
}>;

export type ConfigCreateFromTemplateOptions = Partial<{
  folder: string;
  name: string;
}>;

export type Request = {
  traceId: string;
  ipAddress: string;
  userId?: string;
  publicKey?: string;
  secretKey?: string;
  ticketId?: string;
  host?: string;
  userAgent?: string;
  source?: string;
  method?: string;
};

export type Meta = {
  serviceId: string;
  timestamp: string;
  request: Request;
  sessionId?: string;
  originId?: string;
};

export type Call = <T = unknown>(
  event: EventRoute,
  data: unknown,
) => Promise<MetaData<T> | MetaError | never>;

export type Emit = (event: EventQueue, data: unknown) => void | never;

export type CustomError = {
  message: unknown;
  status: number;
  type: 'business' | 'internal' | 'expose' | 'invalidArgument';
};

export interface MetaData<T = unknown> {
  meta: Meta;
  data: T;
}

export type MetaError = {
  meta?: Meta;
  error: CustomError;
};

export type EventRoute = `/${string}`;

export type EventQueue = `${string}:${string}:${string}`;

export type ControllerEvent = EventRoute | `@${EventQueue}`;

export type Params<T> = {
  data: T;
  meta: Meta;
  call: Call;
  emit: Emit;
  request?: express.Request;
};

export interface ControllerHandler<T = unknown, R = unknown> {
  (params: Params<T>): Promise<R> | R;
}

export interface AppOptions {
  healthCheck?: HealthCheck;
  queue?: Queue;
  loggerFactory: LoggerFactory;
  config: Config;
  controllers: Controller<any, any>[];
}
