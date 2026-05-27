// Builds the assistant Vapi should use for a given inbound call. This is what
// makes the receptionist feel personal: before the call even connects we look
// up the caller by number and, if we know them, greet them by name and load
// their history into the system prompt. Unknown callers get a clean new-client
// flow. Everything else (the tools) is identical either way.

import { SPA, VOICE } from '../config.js';
import { findCustomerByPhone, pastVisits, upcomingAppointments } from '../lib/customers.js';
import { humanTime } from '../lib/time.js';

// The functions the model is allowed to call, described for Vapi. Names + params
// match the handlers in tools.ts.
const toolDefinitions = [
  {
    type: 'function',
    function: {
      name: 'get_my_details',
      description: "Re-fetch the caller's name and upcoming appointments by their phone number.",
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'check_availability',
      description: 'List open appointment times for a service on a given day.',
      parameters: {
        type: 'object',
        properties: {
          serviceName: { type: 'string', description: 'Service name, e.g. "Botox".' },
          date: { type: 'string', description: 'The day to check, ISO date e.g. 2026-05-29.' },
        },
        required: ['serviceName', 'date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'book_appointment',
      description: 'Book a service at a specific start time. Only use a startTime returned by check_availability.',
      parameters: {
        type: 'object',
        properties: {
          serviceName: { type: 'string' },
          startTime: { type: 'string', description: 'ISO datetime returned by check_availability.' },
          staffId: { type: 'string', description: 'Provider id from check_availability, if known.' },
        },
        required: ['serviceName', 'startTime'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'reschedule_appointment',
      description: "Move the caller's upcoming appointment to a new time.",
      parameters: {
        type: 'object',
        properties: {
          newStartTime: { type: 'string', description: 'ISO datetime for the new slot.' },
          serviceName: { type: 'string', description: 'Only needed if the caller has more than one upcoming visit.' },
        },
        required: ['newStartTime'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cancel_appointment',
      description: "Cancel the caller's upcoming appointment.",
      parameters: {
        type: 'object',
        properties: { serviceName: { type: 'string', description: 'Only needed to disambiguate multiple visits.' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'join_waitlist',
      description: 'Add the caller to the waitlist for a service within a date window.',
      parameters: {
        type: 'object',
        properties: {
          serviceName: { type: 'string' },
          earliestDate: { type: 'string', description: 'ISO date — earliest acceptable day.' },
          latestDate: { type: 'string', description: 'ISO date — latest acceptable day.' },
        },
        required: ['serviceName', 'earliestDate', 'latestDate'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'register_customer',
      description: 'Create a record for a new caller. Use before booking if the caller is unknown.',
      parameters: {
        type: 'object',
        properties: { fullName: { type: 'string' } },
        required: ['fullName'],
      },
    },
  },
];

const SHARED_RULES = `You are the friendly phone receptionist for ${SPA.name}, a med spa.
Speak warmly and concisely, like a great front-desk person. Confirm details back before booking.
Never invent open times — always call check_availability first and only offer times it returns.
All times are in ${SPA.timeZoneLabel}. Today is ${new Date().toDateString()}.
If a caller wants to cancel, do it and confirm the cancellation.`;

export async function buildAssistant(callerPhone: string) {
  const customer = callerPhone ? await findCustomerByPhone(callerPhone) : null;

  let firstMessage: string;
  let context: string;

  if (customer) {
    const [upcoming, history] = await Promise.all([upcomingAppointments(customer.id), pastVisits(customer.id)]);
    const upcomingLine = upcoming.length
      ? `They have an upcoming ${upcoming[0]!.service.name} with ${upcoming[0]!.staff.name} on ${humanTime(upcoming[0]!.startTime)}.`
      : 'They have no upcoming appointments.';
    const historyLine = history.length
      ? `Past visits: ${history.map((h) => h.service.name).join(', ')}.`
      : 'No past visits on record.';

    firstMessage = upcoming.length
      ? `Hi ${customer.fullName.split(' ')[0]}, welcome back to ${SPA.name}! Are you calling about your ${upcoming[0]!.service.name} on ${humanTime(upcoming[0]!.startTime)}, or something else?`
      : `Hi ${customer.fullName.split(' ')[0]}, welcome back to ${SPA.name}! How can I help today?`;

    context = `The caller is a returning client: ${customer.fullName}. ${upcomingLine} ${historyLine}
${customer.notes ? `Front-desk notes: ${customer.notes}` : ''}
You already know who they are — do not ask for their name.`;
  } else {
    firstMessage = `Thanks for calling ${SPA.name}! How can I help you today?`;
    context = `The caller is not in our system (new client). If they want to book, use register_customer to take their name first, then book.`;
  }

  return {
    firstMessage,
    model: {
      provider: 'openai',
      model: 'gpt-4o-mini',
      messages: [{ role: 'system', content: `${SHARED_RULES}\n\n${context}` }],
      tools: toolDefinitions,
    },
    voice: VOICE,
  };
}
