// HTTP server. Vapi points at POST /vapi/webhook. The health check is handy
// for confirming a deploy is live.

import { PORT, REMINDER_HOUR, SPA } from './config.js';
import { createApp } from './app.js';
import { startDailyReminderJob } from './lib/reminders.js';
import { startDbKeepWarm } from './lib/db.js';

createApp().listen(PORT, () => {
  console.log(`${SPA.name} receptionist backend listening on http://localhost:${PORT}`);
  console.log(`Vapi webhook: POST http://localhost:${PORT}/vapi/webhook`);
  if (process.env.WEB_TEST === '1' && process.env.NODE_ENV !== 'production') {
    console.log(`Web test page: http://localhost:${PORT}/web-test.html`);
  } else {
    console.log('Web test harness off (set WEB_TEST=1 in .env to enable it in dev).');
  }
  // Daily appointment-reminder texts, run in-process while the server is up.
  startDailyReminderJob(REMINDER_HOUR);
  // Keep the Neon compute awake so call pickup never pays a cold start.
  startDbKeepWarm();
  console.log('[db] keep-warm ping every 4 minutes');
});
