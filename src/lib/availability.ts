// Works out which appointment start times are actually free on a given day.
//
// The rule: a slot is bookable if it sits inside opening hours, the whole
// service duration fits before close, and the provider has no other booked
// appointment overlapping it. We check one provider at a time, then report
// any provider who can take the slot.

import { prisma } from './db.js';
import { getServices, getStaff } from './catalog.js';
import { SPA } from '../config.js';
import { addMinutes, nextDayStart, openingWindow, rangesOverlap, startOfDay } from './time.js';

export type OpenSlot = {
  startTime: Date;
  endTime: Date;
  staffId: string;
  staffName: string;
};

export async function findOpenSlots(serviceId: string, day: Date): Promise<OpenSlot[]> {
  const service = (await getServices()).find((s) => s.id === serviceId);
  if (!service) throw new Error('Unknown service.');

  const window = openingWindow(day);
  if (!window) return []; // spa is closed that day

  const staff = await getStaff();

  // All booked appointments that day, so we can rule out conflicts.
  const dayStart = startOfDay(day);
  const dayEnd = nextDayStart(day); // exclusive upper bound, DST-safe
  const booked = await prisma.appointment.findMany({
    where: { status: 'BOOKED', startTime: { gte: dayStart, lt: dayEnd } },
  });

  const slots: OpenSlot[] = [];
  for (
    let start = new Date(window.open);
    addMinutes(start, service.durationMinutes) <= window.close;
    start = addMinutes(start, SPA.slotStepMinutes)
  ) {
    const end = addMinutes(start, service.durationMinutes);
    if (start < new Date()) continue; // never offer a time in the past

    for (const member of staff) {
      const conflict = booked.some(
        (appt) => appt.staffId === member.id && rangesOverlap(start, end, appt.startTime, appt.endTime),
      );
      if (!conflict) {
        slots.push({ startTime: new Date(start), endTime: end, staffId: member.id, staffName: member.name });
        break; // one free provider is enough to offer the slot
      }
    }
  }

  return slots;
}

// Is one specific provider free for [start, end)? Used when booking a slot we
// already offered, to guard against a double-book between offer and confirm.
export async function isStaffFree(staffId: string, start: Date, end: Date): Promise<boolean> {
  const overlapping = await prisma.appointment.findMany({
    where: { staffId, status: 'BOOKED', startTime: { lt: end }, endTime: { gt: start } },
  });
  return overlapping.length === 0;
}
