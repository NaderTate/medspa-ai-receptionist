// Appointment reminders. The core query + send lives here so it can run two ways:
//   - as a one-off CLI (scripts/send-reminders.ts), handy for demoing on demand
//   - as a daily in-process job the server starts on boot (startDailyReminderJob)
// The in-process job runs only while the server is up — all we need for a local demo.

import { prisma } from './db.js';
import { SPA } from '../config.js';
import { sendSms } from './sms.js';
import { humanTime } from './time.js';

const DAY_MS = 24 * 60 * 60 * 1000;

// Text every client with a BOOKED appointment starting 24–48h from now. Meant to
// run once a day, so each appointment is caught exactly once. Returns the count sent.
export async function sendDueReminders(): Promise<number> {
  const now = new Date();
  const in24h = new Date(now.getTime() + DAY_MS);
  const in48h = new Date(now.getTime() + 2 * DAY_MS);

  const due = await prisma.appointment.findMany({
    where: { status: 'BOOKED', startTime: { gte: in24h, lt: in48h } },
    include: { customer: true, service: true, staff: true },
  });

  for (const appt of due) {
    await sendSms(
      appt.customer.phone,
      `${SPA.name} reminder: your ${appt.service.name} with ${appt.staff.name} is on ${humanTime(appt.startTime)}. ` +
        `Reply to reschedule or cancel.`,
    );
  }
  return due.length;
}

// Milliseconds from now until the next occurrence of `hour`:00 local time.
function msUntilHour(hour: number): number {
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

// Start the daily reminder job inside the running server: fire at the next
// `hour`:00, then every 24h. A failed run is logged, never crashes the server.
export function startDailyReminderJob(hour: number): void {
  const run = async () => {
    try {
      const count = await sendDueReminders();
      console.log(`[reminders] sent ${count} reminder(s) at ${new Date().toLocaleString()}`);
    } catch (err) {
      console.error('[reminders] run failed:', err);
    }
  };

  const delay = msUntilHour(hour);
  setTimeout(() => {
    void run();
    setInterval(() => void run(), DAY_MS);
  }, delay);

  const nextRun = new Date(Date.now() + delay);
  console.log(`[reminders] daily job scheduled for ${hour}:00 local time — next run ${nextRun.toLocaleString()}`);
}
