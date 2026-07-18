// HTTP server. Vapi points at POST /vapi/webhook. The health check is handy
// for confirming a deploy is live.

import cors from 'cors';
import express from 'express';
import { PORT, REMINDER_HOUR, SPA } from './config.js';
import { vapiRouter } from './routes/vapi.js';
import { apiRouter } from './routes/api.js';
import { webtestRouter } from './routes/webtest.js';
import { startDailyReminderJob } from './lib/reminders.js';

const app = express();
app.use(cors()); // the dashboard runs on a different port in dev, so allow cross-origin reads
app.use(express.json());
app.use(express.static('public')); // serves the dev web-test page at /web-test.html

app.get('/', (_req, res) => {
  res.json({ service: `${SPA.name} AI receptionist`, status: 'ok' });
});

app.use('/vapi', vapiRouter);
app.use('/api', apiRouter);

// Dev-only browser test harness (talk to the assistant from a web page, no phone).
// Off in production so it never exposes the assistant config or secret publicly.
if (process.env.NODE_ENV !== 'production') {
  app.use('/web-test', webtestRouter);
}

app.listen(PORT, () => {
  console.log(`${SPA.name} receptionist backend listening on http://localhost:${PORT}`);
  console.log(`Vapi webhook: POST http://localhost:${PORT}/vapi/webhook`);
  if (process.env.NODE_ENV !== 'production') {
    console.log(`Web test page: http://localhost:${PORT}/web-test.html`);
  }
  // Daily appointment-reminder texts, run in-process while the server is up.
  startDailyReminderJob(REMINDER_HOUR);
});
