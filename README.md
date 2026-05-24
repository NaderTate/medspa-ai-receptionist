# Med Spa AI Receptionist

An AI phone receptionist for a med spa. It answers calls, **books, reschedules, and cancels** appointments against a real database, **recognizes returning clients** by their phone number, and turns every cancellation into a re-booking with an automatic **waitlist text**.

The voice itself runs on [Vapi](https://vapi.ai). This repo is the **backend brain** Vapi calls — it does 95% of the work (the database, the calendar logic, the texts). That split is what keeps it flexible and cheap.

## What it does

- **Remembers callers.** Before the call connects, it looks the number up. Known clients get greeted by name and the agent already knows their upcoming visit and history. New callers get a clean sign-up flow.
- **Books / reschedules / cancels** with real availability (opening hours + per-provider conflicts, no double-booking).
- **Smart waitlist auto-fill.** When someone cancels, the freed slot is instantly texted to the next client waiting for that service. A hole in the calendar becomes a re-booking.
- **SMS confirmations + reminders** via Twilio (booking confirmation immediately; a reminder script for 24h-out appointments).

## Stack

Bun · Express · TypeScript · Prisma · Neon Postgres · Twilio · Vapi

## Setup

```bash
bun install
cp .env.example .env        # then fill in DATABASE_URL (and Twilio if you want real texts)
bun run db:push             # create the tables in your Neon database
bun run seed                # load a demo med spa (providers, services, clients)
bun run dev                 # start the server on http://localhost:3000
```

> No Twilio keys? Leave them blank. The app runs in **log-only mode** and prints the texts it *would* send, so you can demo everything without an account or charges.

## Try it without a phone (call simulator)

In a second terminal (server running, freshly seeded):

```bash
bun run simulate
```

It plays two calls end-to-end against the webhook:
1. **Sarah** (a returning client) cancels tomorrow's Botox — watch the waitlist text fire to **Maria**.
2. A **new caller** registers and books an opening.

## Dashboard (frontend)

A clean front-desk dashboard that shows everything the receptionist is doing: today's schedule, the waitlist, clients, the service menu, and live stats (today's bookings, revenue booked this week, slots the waitlist re-filled). It reads the backend's `GET /api/dashboard` and auto-refreshes every 15s, so a booking or cancellation on a call shows up on screen within seconds. There's also a manual **Refresh** button in the header for an instant update.

Stack: Vite + React + TypeScript + Tailwind v4 + Motion. Design is a warm "quiet-luxury spa editorial" look (Cormorant Garamond + Hanken Grotesk).

```bash
# with the backend already running on :3000
cd frontend
bun install
cp .env.example .env     # VITE_API_URL defaults to http://localhost:3000
bun run dev              # dashboard on http://localhost:5173
```

## Wire it to Vapi (the 5-minute part)

1. Deploy this server somewhere public (or use a tunnel like `ngrok http 3000` for testing).
2. In Vapi, set your phone number's **Assistant Request** server URL to `https://<your-url>/vapi/webhook`. That's how each call gets the personalized assistant.
3. Make sure your tool/function server URL is the same `/vapi/webhook`, and add the header `x-vapi-secret` matching `VAPI_SECRET` in your `.env`.
4. Call your Vapi number. The backend handles the rest.

The assistant config (greeting, system prompt, the tool list) is built in `src/vapi/personalization.ts` — no setup needed in the Vapi dashboard beyond the URL + secret.

## How a call flows

```
caller dials Vapi number
        │
        ▼
Vapi ──POST /vapi/webhook──►  routes/vapi.ts
        │                          │
        │   "assistant-request"    ├─► vapi/personalization.ts  (look caller up, build greeting + tools)
        │                          │
        │   "tool-calls"           └─► vapi/tools.ts  ──►  lib/*  (availability, booking, waitlist, sms, db)
        │                                                      │
        ▼                                                      ▼
  Vapi speaks the result                              Neon Postgres + Twilio
```

Read it top to bottom: `routes/vapi.ts` is the front door, `vapi/` decides what to do, `lib/` does the actual work.

## How the code is laid out

```
src/
  index.ts                 # Express server
  config.ts                # spa name, opening hours, slot size
  routes/
    vapi.ts                # the one webhook Vapi calls
    api.ts                 # read-only GET /api/dashboard for the frontend
  vapi/
    personalization.ts     # builds the per-caller assistant (the "remembers you" magic)
    tools.ts               # the actions the agent can take mid-call
  lib/
    db.ts                  # Prisma client (Neon adapter)
    customers.ts           # look callers up by phone, fetch history
    availability.ts        # which start times are actually free
    booking.ts             # book / reschedule / cancel (+ side effects)
    waitlist.ts            # the auto-fill-on-cancel logic
    dashboard.ts           # builds the dashboard payload
    sms.ts                 # Twilio (or log-only) texting
    time.ts                # small date helpers
prisma/
  schema.prisma            # the data model
  seed.ts                  # demo med spa data
scripts/
  simulate-call.ts         # test the whole thing with no phone
  send-reminders.ts        # daily 24h-out reminder texts
frontend/                  # Vite + React + Tailwind dashboard (see "Dashboard" above)
  src/components/          # StatRow, Schedule, Waitlist, Clients, Services
  src/api.ts               # fetch + types for /api/dashboard
```

## Notes

- Times are kept in the server's local time to stay simple. For multi-timezone production you'd add a timezone library.
- The waitlist notifies the longest-waiting client whose date window covers the freed slot.
