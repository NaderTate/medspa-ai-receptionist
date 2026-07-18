// DEV-ONLY browser test harness. Lets you talk to your REAL transient assistant
// — the exact object buildAssistant() returns — from a web page using your
// laptop mic. No phone, no telephony charges, unlimited calls. This is how you
// iterate on reliability (cutoffs, dead air, endpointing) without dialing.
//
//   GET /web-test/config     -> { publicKey, presets }
//   GET /web-test/assistant  -> { assistant, warnLocalhost, serverUrl }
//
// The Vapi Web SDK accepts a full inline assistant object, so we hand it the
// same one your phone calls use. We inject `server.url` because during a web
// call the tool-calls are made by Vapi's cloud and must reach a PUBLIC url.
//
// Mounted only when NODE_ENV !== 'production' (see index.ts) so it never exposes
// your assistant config or secret on a live deployment.

import { Router, type Request, type Response } from 'express';
import { VAPI_SECRET } from '../config.js';
import { buildAssistant } from '../vapi/personalization.js';

export const webtestRouter = Router();

// Seeded personas so you can test each conversation path with one click.
// Numbers match prisma/seed.ts. The unknown number exercises the new-caller flow.
const PRESETS = [
  { label: 'Sarah Chen — returning, Botox tomorrow (cancel/reschedule demo)', phone: '+15551230001' },
  { label: 'Maria Lopez — on the Botox waitlist', phone: '+15551230002' },
  { label: 'Priya Nair — HydraFacial regular', phone: '+15551230003' },
  { label: 'New caller — unknown number (registration flow)', phone: '+15557770123' },
];

webtestRouter.get('/config', (_req: Request, res: Response) => {
  res.json({ publicKey: process.env.VAPI_PUBLIC_KEY ?? '', presets: PRESETS });
});

webtestRouter.get('/assistant', async (req: Request, res: Response) => {
  try {
    const phone = typeof req.query.phone === 'string' ? req.query.phone : '';
    const assistant = (await buildAssistant(phone)) as Record<string, unknown>;

    // Tool-calls during a web call are made by Vapi's servers, so server.url must
    // be PUBLICLY reachable — localhost will not work. Prefer PUBLIC_URL; else
    // derive from the host you opened this page on (open it via your ngrok URL
    // and tool calls "just work"). x-forwarded-proto handles ngrok's TLS hop.
    const configured = process.env.PUBLIC_URL?.replace(/\/$/, '');
    const proto = req.get('x-forwarded-proto') ?? req.protocol;
    const base = configured || `${proto}://${req.get('host')}`;

    // secret is only injected when set; this endpoint is dev-only so a throwaway
    // local secret reaching the browser is acceptable (do not enable in prod).
    assistant.server = {
      url: `${base}/vapi/webhook`,
      timeoutSeconds: 10,
      ...(VAPI_SECRET ? { secret: VAPI_SECRET } : {}),
    };

    const warnLocalhost = /localhost|127\.0\.0\.1/.test(base);
    res.json({ assistant, warnLocalhost, serverUrl: `${base}/vapi/webhook` });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to build assistant.' });
  }
});
