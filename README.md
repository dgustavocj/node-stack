# Node-Stack

Obtener node-stack con NPM:

```bash
npm install node-stack
```
Crear el archivo `server.ts` y agregar el siguiente contenido:

```typescript
import { Controller, Config, LoggerFactory, App } from 'Nodejs-Stack';

const controller = Controller.on('/', () => {
  return { hello: 'world' };
});

const config = Config.create();

const loggerFactory = LoggerFactory.create({ config });

const app = App.create({
  config,
  loggerFactory,
  controllers: [controller],
});

void app.start();