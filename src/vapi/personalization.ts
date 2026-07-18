// Builds the assistant Vapi should use for a given inbound call. This is what
// makes the receptionist feel personal: before the call even connects we look
// up the caller by number and, if we know them, greet them by name and load
// their history into the system prompt. Unknown callers get a clean new-client
// flow. Everything else (the tools) is identical either way.

import { SPA, VOICE } from '../config.js';
import { customerProfile } from '../lib/customers.js';
import { humanTime } from '../lib/time.js';

// --- Reliability configuration ---------------------------------------------
// Each value prevents a specific verified failure mode. Values locked per the
// 2026-07-18 research pass; see docs/superpowers/plans/2026-07-18-vapi-reliability-hardening.md.

// False barge-in was the #1 cause of "stops talking mid-sentence": the default
// stopSpeakingPlan (numWords 0) interrupts on raw voice-activity detection,
// which triggers on echo, breaths, and coughs even in a quiet room. numWords 2
// requires two *transcribed words* before the assistant yields.
const START_SPEAKING_PLAN = { waitSeconds: 0.7 };
const STOP_SPEAKING_PLAN = { numWords: 2, voiceSeconds: 0.5, backoffSeconds: 1 };

// Explicit transcriber (not the account default) so we control the model and
// can attach a fallback — a dead STT provider otherwise means the assistant
// "hears" nothing for the rest of the call.
const TRANSCRIBER = {
  provider: 'deepgram',
  model: 'nova-3',
  language: 'en',
  fallbackPlan: { transcribers: [{ provider: 'deepgram', model: 'nova-2', language: 'en' }] },
};

// Without a voice fallback, a single ElevenLabs error terminates the call
// (pipeline-error-eleven-labs-voice-failed). Order: alternate 11labs voice
// first (closest sound), cross-provider voice as last resort.
const VOICE_FALLBACK_PLAN = {
  voices: [
    { provider: '11labs', voiceId: '21m00Tcm4TlvDq8ikWAM', model: 'eleven_flash_v2_5' },
    { provider: 'openai', voiceId: 'shimmer' },
  ],
};

// If the caller goes quiet, re-prompt twice instead of sitting in dead air
// until Vapi's silence timeout kills the call. (messagePlan.idleMessages no
// longer exists in Vapi's API; this hook is the current mechanism.)
const HOOKS = [
  {
    on: 'customer.speech.timeout',
    options: { timeoutSeconds: 10, triggerMaxCount: 2, triggerResetMode: 'onUserSpeech' },
    do: [{ type: 'say', exact: "Are you still there? I can check times or book whenever you're ready." }],
  },
];

// Spoken cover for tool latency: idle hooks are disabled during tool calls, so
// these messages are the only thing between a slow webhook and silent dead air.
const TOOL_MESSAGES = [
  { type: 'request-start', content: 'One moment while I check that for you.' },
  { type: 'request-response-delayed', content: 'Thanks for your patience — almost done.', timingMilliseconds: 4000 },
  { type: 'request-failed', content: "I'm sorry, that didn't go through just now. Let's try once more." },
];

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

// Everything reliability-related, identical for every caller.
function assistantBase() {
  return {
    transcriber: TRANSCRIBER,
    voice: { ...VOICE, fallbackPlan: VOICE_FALLBACK_PLAN },
    startSpeakingPlan: START_SPEAKING_PLAN,
    stopSpeakingPlan: STOP_SPEAKING_PLAN,
    backgroundDenoisingEnabled: true,
    hooks: HOOKS,
  };
}

function assistantModel(context: string) {
  return {
    provider: 'openai',
    model: 'gpt-4o-mini',
    fallbackModels: ['gpt-4o'],
    messages: [{ role: 'system', content: `${SHARED_RULES}\n\n${context}` }],
    tools: toolDefinitions.map((t) => ({ ...t, messages: TOOL_MESSAGES })),
  };
}

export async function buildAssistant(callerPhone: string) {
  const profile = callerPhone ? await customerProfile(callerPhone) : null;

  let firstMessage: string;
  let context: string;

  if (profile) {
    const { customer, upcoming, past } = profile;
    const upcomingLine = upcoming.length
      ? `They have an upcoming ${upcoming[0]!.service.name} with ${upcoming[0]!.staff.name} on ${humanTime(upcoming[0]!.startTime)}.`
      : 'They have no upcoming appointments.';
    const historyLine = past.length
      ? `Past visits: ${past.map((h) => h.service.name).join(', ')}.`
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

  return { ...assistantBase(), firstMessage, model: assistantModel(context) };
}

// Degraded-but-working assistant for when personalization can't complete in
// time (DB cold start or outage). The call ALWAYS connects; the agent can
// recover the caller's details mid-call via get_my_details once the DB wakes.
export function buildFallbackAssistant() {
  const context = `You could not load this caller's record before the call connected (temporary system delay).
Treat them warmly as a possibly-returning client. If you need their details, call get_my_details — it may work now.
If they want to book and get_my_details finds nothing, register them with register_customer first.`;
  return {
    ...assistantBase(),
    firstMessage: `Thanks for calling ${SPA.name}! How can I help you today?`,
    model: assistantModel(context),
  };
}
