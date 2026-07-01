import express from 'express';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { createReceiveImageHandler } from './controllers/receive-image.ts';
import { loadEnv } from './lib/load-env.mjs';
import { validateStartupRequirements } from './lib/validate-startup.mjs';
import {
  csrfErrorHandler,
  csrfProtection,
  csrfTokenHandler,
  parseCookies,
} from './middleware/csrf.ts';

loadEnv();

try {
  validateStartupRequirements();
} catch (error) {
  console.error('Fitting Room cannot start:\n');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const app = express();

  app.use(parseCookies);
  app.use(express.urlencoded());
  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));
  app.use('/components', express.static(path.join(__dirname, 'components')));

  app.get('/', (req, res) => {
    res.sendFile(path.resolve(__dirname, './views/index.html'));
  });

  app.get('/csrf-token', csrfProtection, csrfTokenHandler);
  app.post('/capture', csrfProtection, createReceiveImageHandler());

  app.use(csrfErrorHandler);

  const server = createServer(app);

  const port = process.env.PORT || 3001;
  server.listen(port, () => {
    console.log('Fitting Room server listening on port ' + port);
  });
}
