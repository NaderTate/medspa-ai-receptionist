// Looking customers up by phone number is what makes the agent feel like it
// "remembers" the caller. Vapi passes us the caller's number on every call.

import { prisma } from './db.js';

export function findCustomerByPhone(phone: string) {
  return prisma.customer.findUnique({ where: { phone } });
}

export function registerCustomer(input: { fullName: string; phone: string; email?: string }) {
  return prisma.customer.create({ data: input });
}

// The caller's upcoming (still-booked) appointments, soonest first, with the
// service + provider names attached so we can speak about them naturally.
export function upcomingAppointments(customerId: string) {
  return prisma.appointment.findMany({
    where: { customerId, status: 'BOOKED', startTime: { gte: new Date() } },
    orderBy: { startTime: 'asc' },
    include: { service: true, staff: true },
  });
}

// A short history summary (last few completed visits) for personalization.
export function pastVisits(customerId: string) {
  return prisma.appointment.findMany({
    where: { customerId, status: 'COMPLETED' },
    orderBy: { startTime: 'desc' },
    take: 3,
    include: { service: true },
  });
}
