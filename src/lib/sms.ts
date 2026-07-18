// SMS sending via Twilio, hardened for a voice-agent backend:
//  - The client is constructed lazily inside a try/catch, so a bad credential
//    can never crash the server at boot — it degrades to log-only mode.
//  - sendSmsSafe never throws and never rejects: texting is a side effect, and
//    an SMS failure must never turn a successful booking into a spoken error.
// Hot-path callers use `void sendSmsSafe(...)` (don't block the tool response);
// batch jobs await it so a CLI process doesn't exit mid-send.

import twilio from 'twilio';

type TwilioClient = ReturnType<typeof twilio>;
let client: TwilioClient | null | undefined; // undefined = not initialized yet

function getClient(): TwilioClient | null {
  if (client !== undefined) return client;
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from) {
    client = null;
    return client;
  }
  try {
    client = twilio(sid, token);
  } catch (err) {
    console.error('[sms] Twilio init failed — running in log-only mode:', err);
    client = null;
  }
  return client;
}

export async function sendSmsSafe(to: string, body: string): Promise<void> {
  const c = getClient();
  if (!c) {
    console.log(`[SMS log-only] to ${to}: ${body}`);
    return;
  }
  try {
    await c.messages.create({ to, from: process.env.TWILIO_FROM_NUMBER, body });
  } catch (err) {
    console.error(`[sms] send failed to ${to}:`, err);
  }
}

export function smsIsLive(): boolean {
  return getClient() !== null;
}
