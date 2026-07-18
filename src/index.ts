// HTTP server. Vapi points at POST /vapi/webhook. The health check is handy
// for confirming a deploy is live.

import { PORT, REMINDER_HOUR, SPA } from './config.js';
import { createApp } from './app.js';
import { startDailyReminderJob } from './lib/reminders.js';

createApp().listen(PORT, () => {
  console.log(`${SPA.name} receptionist backend listening on http://localhost:${PORT}`);
  console.log(`Vapi webhook: POST http://localhost:${PORT}/vapi/webhook`);
  if (process.env.NODE_ENV !== 'production') {
    console.log(`Web test page: http://localhost:${PORT}/web-test.html`);
  }
  // Daily appointment-reminder texts, run in-process while the server is up.
  startDailyReminderJob(REMINDER_HOUR);
});
