// The waitlist is the money feature: when a booked appointment is cancelled,
// the freed slot is immediately offered (by text) to the next client waiting
// for that service — so a cancellation becomes a re-booking instead of a hole
// in the calendar.

import { prisma } from './db.js';
import { SPA } from '../config.js';
import { sendSms } from './sms.js';
import { humanTime } from './time.js';

export function addToWaitlist(input: {
  customerId: string;
  serviceId: string;
  earliestDate: Date;
  latestDate: Date;
}) {
  return prisma.waitlistEntry.create({ data: input });
}

// Called whenever a slot opens up (a cancel or a reschedule-away). Finds the
// longest-waiting client whose accepted window covers the freed time, texts
// them, and marks them NOTIFIED. Returns the notified customer, or null if
// nobody was waiting for that window.
export async function notifyWaitlistForFreedSlot(serviceId: string, freedStart: Date) {
  const entry = await prisma.waitlistEntry.findFirst({
    where: {
      serviceId,
      status: 'WAITING',
      earliestDate: { lte: freedStart },
      latestDate: { gte: freedStart },
    },
    orderBy: { createdAt: 'asc' }, // first in line goes first
    include: { customer: true, service: true },
  });
  if (!entry) return null;

  await prisma.waitlistEntry.update({
    where: { id: entry.id },
    data: { status: 'NOTIFIED', notifiedAt: new Date() },
  });

  await sendSms(
    entry.customer.phone,
    `${SPA.name}: a ${entry.service.name} slot just opened on ${humanTime(freedStart)}. ` +
      `Reply or call to grab it — first come, first served.`,
  );

  return { customerName: entry.customer.fullName, phone: entry.customer.phone };
}
