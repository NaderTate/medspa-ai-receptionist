// Book, reschedule, and cancel — the core calendar actions. Each one keeps the
// database correct AND fires the right side effect (confirmation text, or the
// waitlist alert when a slot frees up).

import { prisma } from './db.js';
import { SPA } from '../config.js';
import { isStaffFree } from './availability.js';
import { notifyWaitlistForFreedSlot } from './waitlist.js';
import { sendSmsSafe } from './sms.js';
import { addMinutes, humanTime } from './time.js';

export async function bookAppointment(input: {
  customerId: string;
  serviceId: string;
  staffId: string;
  startTime: Date;
}) {
  const service = await prisma.service.findUnique({ where: { id: input.serviceId } });
  if (!service) throw new Error('Unknown service.');

  const endTime = addMinutes(input.startTime, service.durationMinutes);

  if (!(await isStaffFree(input.staffId, input.startTime, endTime))) {
    throw new Error('That provider is no longer free at that time. Offer another slot.');
  }

  const appointment = await prisma.appointment.create({
    data: {
      customerId: input.customerId,
      serviceId: input.serviceId,
      staffId: input.staffId,
      startTime: input.startTime,
      endTime,
    },
    include: { customer: true, service: true, staff: true },
  });

  void sendSmsSafe(
    appointment.customer.phone,
    `${SPA.name}: you're booked for ${service.name} with ${appointment.staff.name} on ${humanTime(input.startTime)}. See you then!`,
  );

  return appointment;
}

export async function rescheduleAppointment(input: { appointmentId: string; newStartTime: Date; staffId?: string }) {
  const appointment = await prisma.appointment.findUnique({
    where: { id: input.appointmentId },
    include: { service: true, customer: true },
  });
  if (!appointment || appointment.status !== 'BOOKED') {
    throw new Error('No active appointment found to reschedule.');
  }

  const staffId = input.staffId ?? appointment.staffId;
  const newEnd = addMinutes(input.newStartTime, appointment.service.durationMinutes);

  if (!(await isStaffFree(staffId, input.newStartTime, newEnd))) {
    throw new Error('That new time is not free. Offer another slot.');
  }

  const oldStart = appointment.startTime;

  const updated = await prisma.appointment.update({
    where: { id: appointment.id },
    data: { startTime: input.newStartTime, endTime: newEnd, staffId },
    include: { service: true, staff: true, customer: true },
  });

  void sendSmsSafe(
    updated.customer.phone,
    `${SPA.name}: your ${updated.service.name} is moved to ${humanTime(input.newStartTime)} with ${updated.staff.name}.`,
  );

  // The old time is now open — let the waitlist know.
  const notified = await notifyWaitlistForFreedSlot(appointment.serviceId, oldStart);

  return { appointment: updated, waitlistNotified: notified };
}

export async function cancelAppointment(appointmentId: string) {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { service: true, customer: true },
  });
  if (!appointment || appointment.status !== 'BOOKED') {
    throw new Error('No active appointment found to cancel.');
  }

  await prisma.appointment.update({ where: { id: appointmentId }, data: { status: 'CANCELLED' } });

  void sendSmsSafe(
    appointment.customer.phone,
    `${SPA.name}: your ${appointment.service.name} on ${humanTime(appointment.startTime)} is cancelled. Hope to see you soon!`,
  );

  // Turn the hole in the calendar into a re-booking opportunity.
  const notified = await notifyWaitlistForFreedSlot(appointment.serviceId, appointment.startTime);

  return { cancelled: true, freedSlot: appointment.startTime, waitlistNotified: notified };
}
