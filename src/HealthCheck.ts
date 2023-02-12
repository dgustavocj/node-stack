import { createTerminus } from '@godaddy/terminus';
import { Server } from 'http';
import { EventEmitter } from 'events';
import debugLib from 'debug';

const debug = debugLib('nodestack:healthCheck');

export class HealthCheck {
  readonly #services = new Map<string, boolean>();
  readonly #events = new EventEmitter();
  readonly #shutdowns: { (): Promise<unknown> }[] = [];

  private constructor() {
    // empty
  }

  static create(): HealthCheck {
    return new HealthCheck();
  }

  registerService(name: string): void {
    if (!this.#services.has(name)) {
      debug('registering: %s', name);

      this.#services.set(name, false);

      this.#events.on(name, (status: boolean) => this.#services.set(name, status));
    }
  }

  registerShutdown(fn: { (): Promise<unknown> }): void {
    this.#shutdowns.push(fn);
  }

  emit(name: string, status: boolean): void {
    debug('status: %j', { name, status });
    this.#events.emit(name, status);
  }

  isReady(): boolean {
    return Array.from(this.#services.values()).every(Boolean);
  }

  listen(server: Server): void {
    createTerminus(server, {
      signal: 'SIGINT',
      timeout: 3000,
      healthChecks: {
        '/_health/liveness': () => Promise.resolve(),
        '/_health/readiness': () => {
          if (this.isReady()) return Promise.resolve();
          return Promise.reject(new Error('not ready'));
        },
      },
      onSignal: () => Promise.all(this.#shutdowns),
    });
  }
}
