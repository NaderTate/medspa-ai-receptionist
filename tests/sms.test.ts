import { describe, expect, it, beforeEach, afterEach, spyOn } from 'bun:test';

// Poison the Twilio env BEFORE importing the module. This reproduces the
// observed boot crash: a SID not starting with "AC" makes twilio() throw.
process.env.TWILIO_ACCOUNT_SID = 'not-a-real-sid';
process.env.TWILIO_AUTH_TOKEN = 'x';
process.env.TWILIO_FROM_NUMBER = '+15550000000';

const sms = await import('../src/lib/sms.js');

describe('sms resilience', () => {
  let logSpy: ReturnType<typeof spyOn>;
  let errorSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    logSpy = spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('importing the module does not throw on bad credentials', () => {
    expect(typeof sms.sendSmsSafe).toBe('function');
  });

  it('sendSmsSafe resolves (never rejects) even with a broken Twilio config', async () => {
    await expect(sms.sendSmsSafe('+15551230001', 'test message')).resolves.toBeUndefined();
    expect(logSpy).toHaveBeenCalledTimes(1); // Log-only mode logs exactly once per call
  });

  it('smsIsLive reports false when the client cannot be constructed', () => {
    expect(sms.smsIsLive()).toBe(false);
  });
});
