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

// Split a customer's appointment rows (ordered ascending by startTime) into
// what personalization needs: future booked visits, and the 3 most recent
// completed ones (most recent first).
export function splitProfileAppointments<A extends { status: string; startTime: Date }>(
  appointments: A[],
): { upcoming: A[]; past: A[] } {
  const now = new Date();
  const upcoming = appointments.filter((a) => a.status === 'BOOKED' && a.startTime >= now);
  const past = appointments
    .filter((a) => a.status === 'COMPLETED')
    .slice(-3)
    .reverse();
  return { upcoming, past };
}

// One-round-trip profile for call personalization. buildAssistant runs inside
// Vapi's hard assistant-request deadline, so every round trip shaved here is
// margin against a failed call pickup.
export async function customerProfile(phone: string) {
  const customer = await prisma.customer.findUnique({
    where: { phone },
    include: {
      appointments: {
        where: { OR: [{ status: 'BOOKED', startTime: { gte: new Date() } }, { status: 'COMPLETED' }] },
        include: { service: true, staff: true },
        orderBy: { startTime: 'asc' },
      },
    },
  });
  if (!customer) return null;
  return { customer, ...splitProfileAppointments(customer.appointments) };
}
