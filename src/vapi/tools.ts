// The actions the voice agent can take mid-call. Each handler receives the
// arguments the agent extracted from the conversation plus the caller's phone
// number, does the work, and returns a short, speech-friendly result the agent
// reads back to the caller.

import { prisma } from '../lib/db.js';
import { findCustomerByPhone, registerCustomer, upcomingAppointments } from '../lib/customers.js';
import { findOpenSlots } from '../lib/availability.js';
import { bookAppointment, cancelAppointment, rescheduleAppointment } from '../lib/booking.js';
import { addToWaitlist } from '../lib/waitlist.js';
import { endOfDay, humanTime, parseDateTime, startOfDay } from '../lib/time.js';

export type ToolContext = { callerPhone: string };

// Look up a service by the name the caller said (case-insensitive). Returns a
// helpful error listing real services if there's no match, so the agent can
// recover instead of guessing.
async function resolveService(serviceName: string) {
  const services = await prisma.service.findMany();
  const match = services.find((s) => s.name.toLowerCase() === serviceName.trim().toLowerCase());
  if (!match) {
    const names = services.map((s) => s.name).join(', ');
    throw new Error(`We don't offer "${serviceName}". Our services are: ${names}.`);
  }
  return match;
}

// Find the caller's one active appointment to act on. If they have several,
// we use the service name to disambiguate, or ask the agent to clarify.
async function resolveCallerAppointment(callerPhone: string, serviceName?: string) {
  const customer = await findCustomerByPhone(callerPhone);
  if (!customer) throw new Error('I could not find your details. Can I take your name to set you up?');

  const upcoming = await upcomingAppointments(customer.id);
  if (upcoming.length === 0) throw new Error('You have no upcoming appointments on file.');

  if (upcoming.length === 1) return upcoming[0]!;

  if (serviceName) {
    const match = upcoming.find((a) => a.service.name.toLowerCase() === serviceName.trim().toLowerCase());
    if (match) return match;
  }
  const list = upcoming.map((a) => `${a.service.name} on ${humanTime(a.startTime)}`).join('; ');
  throw new Error(`You have a few upcoming visits: ${list}. Which one?`);
}

export const tools = {
  // What does the spa know about this caller? Used by the agent to confirm identity.
  async get_my_details(_args: unknown, ctx: ToolContext) {
    const customer = await findCustomerByPhone(ctx.callerPhone);
    if (!customer) return { known: false, message: 'No record found for this number — treat as a new client.' };
    const upcoming = await upcomingAppointments(customer.id);
    return {
      known: true,
      name: customer.fullName,
      upcoming: upcoming.map((a) => `${a.service.name} with ${a.staff.name} on ${humanTime(a.startTime)}`),
    };
  },

  async check_availability(args: { serviceName: string; date: string }) {
    const service = await resolveService(args.serviceName);
    const day = startOfDay(parseDateTime(args.date));
    const slots = await findOpenSlots(service.id, day);
    if (slots.length === 0) {
      return { available: false, message: `No ${service.name} openings that day. Try another date or join the waitlist.` };
    }
    // Offer a readable handful, not all of them.
    return {
      available: true,
      service: service.name,
      options: slots.slice(0, 6).map((s) => ({ time: humanTime(s.startTime), with: s.staffName, staffId: s.staffId, startTime: s.startTime.toISOString() })),
    };
  },

  async book_appointment(args: { serviceName: string; startTime: string; staffId?: string }, ctx: ToolContext) {
    const customer = await findCustomerByPhone(ctx.callerPhone);
    if (!customer) throw new Error('I need to register you first — can I take your name?');
    const service = await resolveService(args.serviceName);

    const start = parseDateTime(args.startTime);
    // If the agent didn't carry a provider id, pick any provider free then.
    // Match within a minute rather than exact milliseconds — the time makes a
    // round trip through the agent as a string, so it can drift by a few ms.
    let staffId = args.staffId;
    if (!staffId) {
      const slots = await findOpenSlots(service.id, startOfDay(start));
      const match = slots.find((s) => Math.abs(s.startTime.getTime() - start.getTime()) < 60_000);
      if (!match) throw new Error('That exact time is not open. Check availability again.');
      staffId = match.staffId;
    }

    const appt = await bookAppointment({ customerId: customer.id, serviceId: service.id, staffId, startTime: start });
    return { booked: true, confirmation: `${service.name} on ${humanTime(start)} with ${appt.staff.name}. A confirmation text is on its way.` };
  },

  async reschedule_appointment(args: { newStartTime: string; serviceName?: string }, ctx: ToolContext) {
    const appt = await resolveCallerAppointment(ctx.callerPhone, args.serviceName);
    const result = await rescheduleAppointment({ appointmentId: appt.id, newStartTime: parseDateTime(args.newStartTime) });
    return {
      rescheduled: true,
      message: `Moved your ${result.appointment.service.name} to ${humanTime(result.appointment.startTime)}.`,
      waitlistNotified: result.waitlistNotified?.customerName ?? null,
    };
  },

  async cancel_appointment(args: { serviceName?: string }, ctx: ToolContext) {
    const appt = await resolveCallerAppointment(ctx.callerPhone, args.serviceName);
    const result = await cancelAppointment(appt.id);
    return {
      cancelled: true,
      message: `Cancelled your ${appt.service.name} on ${humanTime(appt.startTime)}.`,
      waitlistNotified: result.waitlistNotified?.customerName ?? null,
    };
  },

  async join_waitlist(args: { serviceName: string; earliestDate: string; latestDate: string }, ctx: ToolContext) {
    const customer = await findCustomerByPhone(ctx.callerPhone);
    if (!customer) throw new Error('I need your name first to add you to the waitlist.');
    const service = await resolveService(args.serviceName);
    await addToWaitlist({
      customerId: customer.id,
      serviceId: service.id,
      // Widen to whole days so an afternoon freed slot still falls inside the
      // client's window (latestDate as a bare date would be midnight = too early).
      earliestDate: startOfDay(parseDateTime(args.earliestDate)),
      latestDate: endOfDay(parseDateTime(args.latestDate)),
    });
    return { added: true, message: `You're on the ${service.name} waitlist. We'll text you the moment a matching slot frees up.` };
  },

  async register_customer(args: { fullName: string; email?: string }, ctx: ToolContext) {
    const existing = await findCustomerByPhone(ctx.callerPhone);
    if (existing) return { registered: true, message: `You're already in our system, ${existing.fullName}.` };
    const customer = await registerCustomer({ fullName: args.fullName, phone: ctx.callerPhone, email: args.email });
    return { registered: true, message: `Thanks ${customer.fullName}, you're all set up. What would you like to book?` };
  },
};

export type ToolName = keyof typeof tools;
