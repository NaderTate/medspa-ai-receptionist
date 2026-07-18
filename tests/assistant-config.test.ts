import { describe, expect, it } from 'bun:test';

process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
const { buildAssistant, buildFallbackAssistant } = await import('../src/vapi/personalization.js');

// One assertion set for every assistant variant — personalization must never
// silently drop or drift the reliability layer. Values are asserted EXACTLY:
// they are locked per the 2026-07-18 research pass.
function expectReliabilityShape(assistant: any) {
  expect(assistant.stopSpeakingPlan).toEqual({ numWords: 2, voiceSeconds: 0.5, backoffSeconds: 1 });
  expect(assistant.startSpeakingPlan).toEqual({ waitSeconds: 0.7 });
  expect(assistant.backgroundDenoisingEnabled).toBe(true);
  expect(assistant.transcriber).toEqual({
    provider: 'deepgram',
    model: 'nova-3',
    language: 'en',
    fallbackPlan: { transcribers: [{ provider: 'deepgram', model: 'nova-2', language: 'en' }] },
  });
  expect(assistant.voice.voiceId).toBe('6fZce9LFNG3iEITDfqZZ');
  expect(assistant.voice.fallbackPlan).toEqual({
    voices: [
      { provider: '11labs', voiceId: '21m00Tcm4TlvDq8ikWAM', model: 'eleven_flash_v2_5' },
      { provider: 'openai', voiceId: 'shimmer' },
    ],
  });
  expect(assistant.model.fallbackModels).toEqual(['gpt-4o']);
  expect(assistant.hooks).toEqual([
    {
      on: 'customer.speech.timeout',
      options: { timeoutSeconds: 10, triggerMaxCount: 2, triggerResetMode: 'onUserSpeech' },
      do: [{ type: 'say', exact: "Are you still there? I can check times or book whenever you're ready." }],
    },
  ]);
  expect(assistant.firstMessage.length).toBeGreaterThan(0);
  expect(assistant.model.tools.length).toBeGreaterThanOrEqual(7);
  for (const tool of assistant.model.tools) {
    expect(tool.messages).toEqual([
      { type: 'request-start', content: 'One moment while I check that for you.' },
      { type: 'request-response-delayed', content: 'Thanks for your patience — almost done.', timingMilliseconds: 4000 },
      { type: 'request-failed', content: "I'm sorry, that didn't go through just now. Let's try once more." },
    ]);
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
