// Drives the webhook with realistic Vapi-shaped payloads so you can test the
// whole receptionist WITHOUT a Vapi account or a real phone call.
//
// Run the server first (bun run dev), reseed for a clean slate (bun run seed),
// then in another terminal: bun run simulate
//
// It plays two calls: a returning client who cancels (watch the waitlist auto-
// fill fire), and a brand-new caller who registers and books.

const BASE = `http://localhost:${process.env.PORT ?? 3000}`;

function isoDate(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

async function post(body: unknown) {
  const res = await fetch(`${BASE}/vapi/webhook`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      // Match the server's VAPI_SECRET so the request is accepted.
      'x-vapi-secret': process.env.VAPI_SECRET ?? '',
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

function assistantRequest(callerNumber: string) {
  return post({ message: { type: 'assistant-request', call: { customer: { number: callerNumber } } } });
}

function toolCall(callerNumber: string, name: string, args: Record<string, unknown>) {
  return post({
    message: {
      type: 'tool-calls',
      call: { customer: { number: callerNumber } },
      toolCallList: [{ id: `call_${name}`, function: { name, arguments: args } }],
    },
  });
}

function show(label: string, value: unknown) {
  console.log(`\n=== ${label} ===`);
  console.log(JSON.stringify(value, null, 2));
}

async function main() {
  const health = await (await fetch(`${BASE}/`)).json().catch(() => null);
  if (!health) {
    console.error(`Server not reachable at ${BASE}. Start it with: bun run dev`);
    process.exit(1);
  }

  // --- Call 1: returning client Sarah cancels tomorrow's Botox ---
  const sarah = '+15551230001';
  show('Call 1 — assistant-request (returning client)', await assistantRequest(sarah));
  show('Sarah: get_my_details', await toolCall(sarah, 'get_my_details', {}));
  const cancel = await toolCall(sarah, 'cancel_appointment', {});
  show('Sarah: cancel_appointment (should auto-notify the waitlist)', cancel);

  // --- Call 2: brand-new caller registers and books ---
  const newCaller = '+15557770123';
  show('Call 2 — assistant-request (unknown caller)', await assistantRequest(newCaller));
  show('New caller: register_customer', await toolCall(newCaller, 'register_customer', { fullName: 'Jordan New' }));

  const date = isoDate(3);
  const avail = (await toolCall(newCaller, 'check_availability', { serviceName: 'Botox', date })) as any;
  show(`New caller: check_availability (Botox, ${date})`, avail);

  // Dig the first offered slot out of the webhook's nested response shape:
  // { results: [ { toolCallId, result: { options: [...] } } ] }
  const first = avail?.results?.[0]?.result?.options?.[0];
  if (first) {
    const booked = await toolCall(newCaller, 'book_appointment', {
      serviceName: 'Botox',
      startTime: first.startTime,
      staffId: first.staffId,
    });
    show('New caller: book_appointment', booked);
  } else {
    console.log('\n(no Botox slots returned to book — try a different date)');
  }

  console.log('\nDone. Tip: run `bun run seed` to reset before simulating again.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
