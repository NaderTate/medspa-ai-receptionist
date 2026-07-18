import { describe, expect, it } from 'bun:test';

process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
const { buildAssistant, buildFallbackAssistant } = await import('../src/vapi/personalization.js');

// One assertion set for every assistant variant — personalization must never
// silently drop the reliability layer.
function expectReliabilityShape(assistant: any) {
  expect(assistant.stopSpeakingPlan).toEqual({ numWords: 2, voiceSeconds: 0.5, backoffSeconds: 1 });
  expect(assistant.startSpeakingPlan).toEqual({ waitSeconds: 0.7 });
  expect(assistant.backgroundDenoisingEnabled).toBe(true);
  expect(assistant.transcriber.provider).toBe('deepgram');
  expect(assistant.transcriber.fallbackPlan.transcribers.length).toBeGreaterThan(0);
  expect(assistant.voice.voiceId).toBe('6fZce9LFNG3iEITDfqZZ');
  expect(assistant.voice.fallbackPlan.voices.length).toBeGreaterThanOrEqual(2);
  expect(assistant.model.fallbackModels).toContain('gpt-4o');
  expect(assistant.hooks).toHaveLength(1);
  expect(assistant.hooks[0].on).toBe('customer.speech.timeout');
  expect(assistant.hooks[0].options).toEqual({ timeoutSeconds: 10, triggerMaxCount: 2, triggerResetMode: 'onUserSpeech' });
  expect(assistant.firstMessage.length).toBeGreaterThan(0);
  expect(assistant.model.tools.length).toBeGreaterThanOrEqual(7);
  for (const tool of assistant.model.tools) {
    const types = tool.messages.map((m: any) => m.type);
    expect(types).toContain('request-start');
    expect(types).toContain('request-response-delayed');
    expect(types).toContain('request-failed');
  }
}

describe('assistant reliability config', () => {
  it('an unknown caller (empty phone — no DB touch) gets the full reliability config', async () => {
    expectReliabilityShape(await buildAssistant(''));
  });

  it('the fallback assistant is synchronous, generic, and fully configured', () => {
    const assistant: any = buildFallbackAssistant();
    expectReliabilityShape(assistant);
    expect(assistant.model.messages[0].content).toContain('get_my_details');
  });
});
