// Texts a reminder to every client with a booked appointment ~24 hours out.
// Run it on a schedule (cron, Task Scheduler, or a hosting platform's cron) once
// a day. Kept as a plain script — no queue or extra infrastructure to learn.
//
// Run with: bun run reminders

import { prisma } from '../src/lib/db.js';
import { SPA } from '../src/config.js';
import { sendSms } from '../src/lib/sms.js';
import { humanTime } from '../src/lib/time.js';

async function main() {
  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 60 * 60_000);
  const in48h = new Date(now.getTime() + 48 * 60 * 60_000);

  // Appointments starting between 24h and 48h from now — tomorrow's, roughly.
  const due = await prisma.appointment.findMany({
    where: { status: 'BOOKED', startTime: { gte: in24h, lt: in48h } },
    include: { customer: true, service: true, staff: true },
  });

  console.log(`Found ${due.length} appointment(s) to remind.`);
  for (const appt of due) {
    await sendSms(
      appt.customer.phone,
      `${SPA.name} reminder: your ${appt.service.name} with ${appt.staff.name} is on ${humanTime(appt.startTime)}. ` +
        `Reply to reschedule or cancel.`,
    );
  }
  console.log('Reminders sent.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
