// Builds the single payload the dashboard frontend renders. One aggregate read
// so the UI does one fetch and stays simple. Everything here is read-only.

import { Prisma } from '@prisma/client';
import { prisma } from './db.js';
import { nextDayStart, startOfDay } from './time.js';

export async function getDashboardData() {
  const now = new Date();
  const todayStart = startOfDay(now);
  const tomorrowStart = nextDayStart(now);
  const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60_000);

  const [todays, upcoming, waitlist, customers, services, weekBooked] = await Promise.all([
    prisma.appointment.findMany({
      where: { status: 'BOOKED', startTime: { gte: todayStart, lt: tomorrowStart } },
      orderBy: { startTime: 'asc' },
      include: { customer: true, service: true, staff: true },
    }),
    prisma.appointment.findMany({
      where: { status: 'BOOKED', startTime: { gte: tomorrowStart } },
      orderBy: { startTime: 'asc' },
      take: 8,
      include: { customer: true, service: true, staff: true },
    }),
    prisma.waitlistEntry.findMany({
      where: { status: { in: ['WAITING', 'NOTIFIED'] } },
      orderBy: { createdAt: 'asc' },
      include: { customer: true, service: true },
    }),
    prisma.customer.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        appointments: { orderBy: { startTime: 'desc' }, include: { service: true } },
      },
    }),
    prisma.service.findMany({ orderBy: { priceCents: 'desc' } }),
    prisma.appointment.findMany({
      where: { status: 'BOOKED', startTime: { gte: now, lt: weekEnd } },
      include: { service: true },
    }),
  ]);

  const waitlistSaves = waitlist.filter((w) => w.status === 'NOTIFIED').length;
  const revenueWeekCents = weekBooked.reduce((sum, a) => sum + a.service.priceCents, 0);

  return {
    spaName: 'Lumière Med Spa',
    generatedAt: now.toISOString(),
    stats: {
      todayCount: todays.length,
      weekCount: weekBooked.length,
      waitlistWaiting: waitlist.filter((w) => w.status === 'WAITING').length,
      waitlistSaves,
      revenueWeekCents,
    },
    schedule: todays.map(toAppointmentView),
    upcoming: upcoming.map(toAppointmentView),
    waitlist: waitlist.map((w) => ({
      id: w.id,
      customerName: w.customer.fullName,
      serviceName: w.service.name,
      earliestDate: w.earliestDate.toISOString(),
      latestDate: w.latestDate.toISOString(),
      status: w.status,
      notifiedAt: w.notifiedAt?.toISOString() ?? null,
    })),
    clients: customers.map((c) => {
      const completed = c.appointments.filter((a) => a.status === 'COMPLETED');
      const lastVisit = completed[0];
      return {
        id: c.id,
        fullName: c.fullName,
        phone: c.phone,
        notes: c.notes,
        visitCount: completed.length,
        lastVisitService: lastVisit?.service.name ?? null,
        lastVisitDate: lastVisit?.startTime.toISOString() ?? null,
      };
    }),
    services: services.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      durationMinutes: s.durationMinutes,
      priceCents: s.priceCents,
    })),
  };
}

type AppointmentWithRelations = Prisma.AppointmentGetPayload<{
  include: { customer: true; service: true; staff: true };
}>;

function toAppointmentView(a: AppointmentWithRelations) {
  return {
    id: a.id,
    startTime: a.startTime.toISOString(),
    customerName: a.customer.fullName,
    serviceName: a.service.name,
    staffName: a.staff.name,
    durationMinutes: a.service.durationMinutes,
    priceCents: a.service.priceCents,
  };
}
