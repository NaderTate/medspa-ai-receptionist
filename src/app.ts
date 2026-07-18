// Express app assembly, separated from the listener so tests can mount the
// real app on an ephemeral port.

import cors from 'cors';
import express from 'express';
import { SPA } from './config.js';
import { vapiRouter } from './routes/vapi.js';
import { apiRouter } from './routes/api.js';
import { webtestRouter } from './routes/webtest.js';

export function createApp() {
  // The web-test harness exposes the assistant config (including the webhook
  // secret and caller lookups) to the browser. It must be explicitly opted
  // into — never on by default, and never in production.
  const webTestEnabled = process.env.WEB_TEST === '1' && process.env.NODE_ENV !== 'production';

  const app = express();
  app.use(cors()); // the dashboard runs on a different port in dev, so allow cross-origin reads
  app.use(express.json({ limit: '2mb' })); // Vapi tool-call payloads grow with call context; a 413 would be silently discarded
  if (webTestEnabled) {
    app.use(express.static('public')); // serves the dev web-test page at /web-test.html
  }

  app.get('/', (_req, res) => {
    res.json({ service: `${SPA.name} AI receptionist`, status: 'ok' });
  });

  app.use('/vapi', vapiRouter);
  app.use('/api', apiRouter);

  // Dev-only browser test harness (talk to the assistant from a web page, no phone).
  // Off in production so it never exposes the assistant config or secret publicly.
  if (webTestEnabled) {
    app.use('/web-test', webtestRouter);
  }

  return app;
}
