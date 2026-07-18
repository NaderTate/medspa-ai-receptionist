// The one endpoint Vapi calls. It handles two kinds of message:
//   - "assistant-request": a call is starting — return the personalized assistant.
//   - "tool-calls": the agent wants to run an action — dispatch it and return the result.
// Everything the agent can do flows through here.

import { Router, type Request, type Response } from 'express';
import { SPA, VAPI_SECRET } from '../config.js';
import { raceWithFallback } from '../lib/async.js';
import { buildAssistant, buildFallbackAssistant } from '../vapi/personalization.js';
import { tools, type ToolContext } from '../vapi/tools.js';

export const vapiRouter = Router();

// Minimal shapes for the parts of Vapi's payload we actually read. The payload
// is an external/untrusted JSON body, so we keep these loose and read defensively.
type VapiCaller = { call?: { customer?: { number?: string } }; customer?: { number?: string } };
type VapiToolCall = { id: string; function?: { name?: string; arguments?: unknown } };

function callerPhoneFrom(message: VapiCaller): string {
  return message?.call?.customer?.number ?? message?.customer?.number ?? '';
}

// Vapi's assistant-request webhook has a hard, non-configurable 7.5s end-to-end
// budget; missing it fails the call at pickup. We spend at most 4.5s on
// personalization, then ship the generic fallback — the call ALWAYS connects.
const ASSISTANT_BUILD_BUDGET_MS = 4500;

// Absolute last resort if even buildFallbackAssistant throws: a minimal valid
// assistant so the call still connects. No personalization, no tools — the
// agent can only converse and take a message, which beats a dead line.
function lastResortAssistant() {
  return {
    firstMessage: `Thanks for calling ${SPA.name}! How can I help you today?`,
    model: {
      provider: 'openai',
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are the friendly phone receptionist for ${SPA.name}, a med spa. The booking system is briefly unavailable — apologize, offer to take the caller's name and number, and promise a call back shortly.`,
        },
      ],
    },
  };
}

// Vapi's tool contract: the response must be HTTP 200 and each result must be
// a STRING with the exact toolCallId echoed back — anything else is silently
// discarded and the caller hears dead air. Errors ride inside the result
// string as JSON so the model reads them as data and recovers conversationally.
async function runToolCall(call: VapiToolCall, ctx: ToolContext): Promise<string> {
  const name = call.function?.name ?? '';
  const handler = (tools as Record<string, (a: unknown, c: ToolContext) => Promise<unknown>>)[name];
  if (!handler) return JSON.stringify({ error: `Unknown tool "${name}".` });
  try {
    const raw = call.function?.arguments ?? {};
    const args = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw;
    const value = await handler(args, ctx);
    return typeof value === 'string' ? value : (JSON.stringify(value) ?? 'null');
  } catch (err) {
    return JSON.stringify({ error: err instanceof Error ? err.message : 'Something went wrong.' });
  }
}

vapiRouter.post('/webhook', async (req: Request, res: Response) => {
  if (VAPI_SECRET && req.header('x-vapi-secret') !== VAPI_SECRET) {
    return res.status(401).json({ error: 'Bad or missing x-vapi-secret header.' });
  }

  const message = req.body?.message ?? {};
  const callerPhone = callerPhoneFrom(message);

  if (message.type === 'assistant-request') {
    try {
      const assistant = await raceWithFallback(buildAssistant(callerPhone), ASSISTANT_BUILD_BUDGET_MS, buildFallbackAssistant);
      return res.json({ assistant });
    } catch (err) {
      console.error('[vapi] assistant build failed entirely, serving last-resort assistant:', err);
      return res.json({ assistant: lastResortAssistant() });
    }
  }

  if (message.type === 'tool-calls') {
    const calls: VapiToolCall[] = message.toolCallList ?? message.toolCalls ?? [];
    const ctx: ToolContext = { callerPhone };
    // An agent can request several actions in one turn, so run them all and
    // return one result per tool call (keyed by id, which Vapi matches back up).
    const results = await Promise.all(
      calls.map(async (call) => ({ toolCallId: call.id, result: await runToolCall(call, ctx) })),
    );
    return res.json({ results });
  }

  // Other Vapi events (status updates, end-of-call reports) — acknowledge.
  return res.json({ ok: true });
});
