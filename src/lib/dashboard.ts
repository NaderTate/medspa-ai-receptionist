// Builds the single payload the dashboard frontend renders. The dashboard is
// focused on two things: the booked appointments and the waitlist queue.
// One aggregate read so the UI does one fetch. Everything here is read-only.

import { prisma } from './db.js';
import { nextDayStart, startOfDay } from './time.js';

export async function getDashboardData() {
  const now = new Date();
  const todayStart = startOfDay(now);
  const tomorrowStart = nextDayStart(now);
  const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60_000);

  const [appointments, queue] = await Promise.all([
    // Every booked appointment from the start of today onward, oldest first.
    // The frontend groups these by day; capped so one runaway query can't
    // return thousands of rows.
    prisma.appointment.findMany({
      where: { status: 'BOOKED', startTime: { gte: todayStart } },
      orderBy: { startTime: 'asc' },
      take: 200,
      include: { customer: true, service: true, staff: true },
    }),
    prisma.waitlistEntry.findMany({
      where: { status: { in: ['WAITING', 'NOTIFIED'] } },
      orderBy: { createdAt: 'asc' },
      include: { customer: true, service: true },
    }),
  ]);

  const todayCount = appointments.filter((a) => a.startTime < tomorrowStart).length;
  const weekCount = appointments.filter((a) => a.startTime < weekEnd).length;

  return {
    spaName: 'Lumière Med Spa',
    generatedAt: now.toISOString(),
    stats: {
      todayCount,
      weekCount,
      queueWaiting: queue.filter((w) => w.status === 'WAITING').length,
      waitlistSaves: queue.filter((w) => w.status === 'NOTIFIED').length,
    },
    appointments: appointments.map((a) => ({
      id: a.id,
      startTime: a.startTime.toISOString(),
      customerName: a.customer.fullName,
      serviceName: a.service.name,
      staffName: a.staff.name,
      durationMinutes: a.service.durationMinutes,
    })),
    queue: queue.map((w) => ({
      id: w.id,
      customerName: w.customer.fullName,
      serviceName: w.service.name,
      earliestDate: w.earliestDate.toISOString(),
      latestDate: w.latestDate.toISOString(),
      status: w.status,
      notifiedAt: w.notifiedAt?.toISOString() ?? null,
    })),
  };
}
