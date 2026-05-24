// SMS sending via Twilio. If Twilio env vars are missing, we run in "log-only"
// mode: the message is printed to the console instead of being sent. That lets
// the whole app run and be demoed without a Twilio account or real charges.

import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_FROM_NUMBER;

const liveMode = Boolean(accountSid && authToken && fromNumber);
const client = liveMode ? twilio(accountSid, authToken) : null;

export async function sendSms(to: string, body: string): Promise<void> {
  if (!liveMode || !client) {
    console.log(`[SMS log-only] to ${to}: ${body}`);
    return;
  }
  await client.messages.create({ to, from: fromNumber, body });
}

export function smsIsLive(): boolean {
  return liveMode;
}
