// One-off: text a reminder to every client with an appointment ~24h out, right now.
// Handy for demoing on demand. The same logic also runs automatically as a daily
// in-process job once the server is started (see src/lib/reminders.ts).
//
// Run with: bun run reminders

import { sendDueReminders } from '../src/lib/reminders.js';

sendDueReminders()
  .then((count) => {
    console.log(`Reminders sent: ${count}.`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
