// The one endpoint Vapi calls. It handles two kinds of message:
//   - "assistant-request": a call is starting — return the personalized assistant.
//   - "tool-calls": the agent wants to run an action — dispatch it and return the result.
// Everything the agent can do flows through here.

import { Router, type Request, type Response } from 'express';
import { VAPI_SECRET } from '../config.js';
import { buildAssistant } from '../vapi/personalization.js';
import { tools, type ToolContext } from '../vapi/tools.js';

export const vapiRouter = Router();

// Minimal shapes for the parts of Vapi's payload we actually read. The payload
// is an external/untrusted JSON body, so we keep these loose and read defensively.
type VapiCaller = { call?: { customer?: { number?: string } }; customer?: { number?: string } };
type VapiToolCall = { id: string; function?: { name?: string; arguments?: unknown } };

function callerPhoneFrom(message: VapiCaller): string {
  return message?.call?.customer?.number ?? message?.customer?.number ?? '';
}

// Look the handler up by the name the agent sent (like calling tools[name](args)),
// parse its arguments, run it, and turn any failure into recoverable data — so a
// single bad action becomes "that didn't work, want to try X?" instead of a
// dropped call or a 500.
async function runToolCall(call: VapiToolCall, ctx: ToolContext) {
  const name = call.function?.name ?? '';
  const handler = (tools as Record<string, (a: unknown, c: ToolContext) => Promise<unknown>>)[name];
  if (!handler) return { error: `Unknown tool "${name}".` };
  try {
    const raw = call.function?.arguments ?? {};
    const args = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw;
    return await handler(args, ctx);
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Something went wrong.' };
  }
}

vapiRouter.post('/webhook', async (req: Request, res: Response) => {
  if (VAPI_SECRET && req.header('x-vapi-secret') !== VAPI_SECRET) {
    return res.status(401).json({ error: 'Bad or missing x-vapi-secret header.' });
  }

  const message = req.body?.message ?? {};
  const callerPhone = callerPhoneFrom(message);

  if (message.type === 'assistant-request') {
    const assistant = await buildAssistant(callerPhone);
    return res.json({ assistant });
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
