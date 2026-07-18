import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import type { Server } from 'node:http';

process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
const { createApp } = await import('../src/app.js');
const { VAPI_SECRET } = await import('../src/config.js');

let server: Server;
let base = '';

beforeAll(async () => {
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (address && typeof address === 'object') base = `http://127.0.0.1:${address.port}`;
});

afterAll(() => {
  server.close();
});

const secretHeaders: Record<string, string> = VAPI_SECRET ? { 'x-vapi-secret': VAPI_SECRET } : {};
const post = (body: unknown) =>
  fetch(`${base}/vapi/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...secretHeaders },
    body: JSON.stringify(body),
  });

// NOTE: bun test auto-loads .env, so these may run against the real demo DB.
// Every call here is read-only; the contract holds with the DB up OR down.
describe('vapi webhook contract', () => {
  it('assistant-request ALWAYS returns 200 with a configured assistant', async () => {
    const res = await post({ message: { type: 'assistant-request', call: { customer: { number: '+15551230001' } } } });
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.assistant.firstMessage.length).toBeGreaterThan(0);
    expect(body.assistant.stopSpeakingPlan.numWords).toBe(2);
  }, 15_000);

  it('tool results are strings with the exact toolCallId echoed', async () => {
    const res = await post({
      message: {
        type: 'tool-calls',
        call: { customer: { number: '+15551230001' } },
        toolCallList: [{ id: 'tc_1', function: { name: 'get_my_details', arguments: {} } }],
      },
    });
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.results[0].toolCallId).toBe('tc_1');
    expect(typeof body.results[0].result).toBe('string');
  }, 15_000);

  it('unknown tools return a speakable string error, not a 5xx', async () => {
    const res = await post({
      message: { type: 'tool-calls', toolCallList: [{ id: 'tc_2', function: { name: 'not_a_tool', arguments: {} } }] },
    });
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(typeof body.results[0].result).toBe('string');
    expect(body.results[0].result).toContain('Unknown tool');
  });

  it.skipIf(!VAPI_SECRET)('rejects a wrong webhook secret with 401', async () => {
    const res = await fetch(`${base}/vapi/webhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-vapi-secret': 'wrong-secret' },
      body: JSON.stringify({ message: { type: 'assistant-request' } }),
    });
    expect(res.status).toBe(401);
  });
});
