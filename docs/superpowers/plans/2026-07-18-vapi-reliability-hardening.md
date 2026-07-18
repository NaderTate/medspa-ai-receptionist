# Vapi Reliability Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the two observed voice-agent failures — stopping mid-sentence (false VAD barge-in) and dead air / failed call pickup (Neon cold starts vs Vapi's hard 7.5s assistant-request deadline, plus tool-response contract violations) — and add a self-healing layer (re-prompts, provider fallbacks, spoken tool-latency cover) so a single provider hiccup or slow query never kills a client demo call.

**Architecture:** All reliability settings live in the transient assistant JSON built by `src/vapi/personalization.ts` (this repo returns a full assistant per call from the `assistant-request` webhook — nothing is configured in the Vapi dashboard except the phone number's server URL). The webhook route gains a hard-deadline race that ships a degraded-but-valid fallback assistant instead of ever missing Vapi's budget, and tool results are converted to Vapi's required string envelope. Latency work: a keep-warm ping stops Neon from suspending, a TTL cache removes catalog queries from the hot path, and personalization collapses to one DB round trip.

**Tech Stack:** Bun (runtime + built-in `bun test`), TypeScript (strict, ESM with `.js` import suffixes), Express 5, Prisma 7 + `@prisma/adapter-neon` (Neon serverless Postgres over WebSockets), Twilio (optional, log-only fallback), Vapi (voice platform; assistant schema verified against live docs 2026-07-18).

## Global Constraints

- Runtime is **Bun on Windows**; run commands from the repo root with Git Bash syntax. `bun test` is the test runner (built-in; do not add jest/vitest).
- ESM imports **must** end in `.js` (e.g. `import { prisma } from './db.js'`) — matching the existing codebase.
- **No new runtime dependencies.** Only dev dependency allowed: `@types/bun`.
- **Never** read out, modify, or commit `.env`. Never print secret values.
- `bun test` auto-loads `.env`, so tests may reach the **real demo database**. Tests must therefore be DB-free or **read-only** — never invoke mutating tools (`book_appointment`, `cancel_appointment`, `reschedule_appointment`, `join_waitlist`, `register_customer`) from a test.
- The working tree has unrelated uncommitted changes (`public/`, `src/routes/webtest.ts`, `SCRIPT.md` deletion, `.env.example`, `src/config.ts`, `src/index.ts`). `git add` **explicit file paths only** — never `git add -A` or `git add .`.
- Commit messages follow the repo style: one imperative sentence, no `feat:`/`fix:` prefixes (e.g. "Switch the assistant LLM to gpt-4o-mini"), ending with the line `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Locked reliability values (verified against Vapi docs 2026-07-18 — do not "improve" them): `stopSpeakingPlan {numWords: 2, voiceSeconds: 0.5, backoffSeconds: 1}`, `startSpeakingPlan {waitSeconds: 0.7}`, speech-timeout hook `{timeoutSeconds: 10, triggerMaxCount: 2, triggerResetMode: 'onUserSpeech'}`, `request-response-delayed` at `4000` ms, assistant build budget `4500` ms, keep-warm interval `240_000` ms, catalog cache TTL `60_000` ms, web-test `server.timeoutSeconds: 10`.
- If a live web-test call fails to start with a Vapi validation error naming one of these fields, the field name drifted since 2026-07-18 — fix per https://docs.vapi.ai/customization/speech-configuration, https://docs.vapi.ai/voice-fallback-plan, https://docs.vapi.ai/customization/transcriber-fallback-plan, https://docs.vapi.ai/assistants/assistant-hooks, https://docs.vapi.ai/tools/custom-tools — and note the correction in the final report.
- After every implementation step, `bunx tsc --noEmit` must pass before committing.

---

### Task 1: Test infrastructure + defensive PORT parsing

**Files:**
- Modify: `package.json` (dev dependency via `bun add -d`)
- Modify: `tsconfig.json` (only if typecheck fails on `bun:test`, see Step 3)
- Modify: `src/config.ts:36` (the `PORT` export)
- Test: `tests/parse-port.test.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `parsePort(raw: string | undefined): number` exported from `src/config.ts`; a working `bun test` setup all later tasks rely on.

**Why:** A malformed `PORT` env value (observed in the wild as a quote-wrapped `"3000"`) currently produces `Number(...) = NaN`, and Express silently binds a random port — the server looks up but Vapi/ngrok point at a dead port. Also establishes the test harness.

- [ ] **Step 1: Install Bun test types**

Run: `bun add -d @types/bun`
Expected: `package.json` devDependencies gains `@types/bun`; `bun.lock` updated.

- [ ] **Step 2: Write the failing test**

Create `tests/parse-port.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import { parsePort } from '../src/config.js';

describe('parsePort', () => {
  it('returns the default 3000 when unset or empty', () => {
    expect(parsePort(undefined)).toBe(3000);
    expect(parsePort('')).toBe(3000);
  });

  it('parses a plain numeric port', () => {
    expect(parsePort('3111')).toBe(3111);
  });

  it('strips accidental surrounding quotes', () => {
    expect(parsePort('"3000"')).toBe(3000);
    expect(parsePort("'8080'")).toBe(8080);
  });

  it('falls back to 3000 on garbage instead of NaN', () => {
    expect(parsePort('abc')).toBe(3000);
    expect(parsePort('0')).toBe(3000);
    expect(parsePort('70000')).toBe(3000);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `bun test tests/parse-port.test.ts`
Expected: FAIL — `parsePort` is not exported from `../src/config.js`.

Also run: `bunx tsc --noEmit`. If it errors with `Cannot find module 'bun:test'`, open `tsconfig.json` and add `"bun"` to the `types` array in `compilerOptions` (create the array as `"types": ["bun"]` if absent, preserving any existing entries like `"node"`).

- [ ] **Step 4: Implement `parsePort`**

In `src/config.ts`, replace the line:

```ts
export const PORT = Number(process.env.PORT ?? 3000);
```

with:

```ts
// Parse PORT defensively: shells and profiles sometimes hand us values wrapped
// in literal quotes, and Number(garbage) is NaN — Express would then silently
// bind a random port while Vapi/ngrok keep pointing at the configured one.
export function parsePort(raw: string | undefined): number {
  const cleaned = (raw ?? '').trim().replace(/^["']|["']$/g, '');
  if (!cleaned) return 3000;
  const port = Number(cleaned);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.warn(`[config] Ignoring invalid PORT value ${JSON.stringify(raw)}; using 3000.`);
    return 3000;
  }
  return port;
}
export const PORT = parsePort(process.env.PORT);
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `bun test tests/parse-port.test.ts` → Expected: 4 pass.
Run: `bunx tsc --noEmit` → Expected: clean exit.

- [ ] **Step 6: Commit**

```bash
git add package.json bun.lock tsconfig.json src/config.ts tests/parse-port.test.ts
git commit -m "$(cat <<'EOF'
Guard PORT parsing against malformed env values and add bun test setup

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

(If `tsconfig.json` was not modified in Step 3, drop it from `git add`.)

---

### Task 2: SMS that can never crash the server or fail a booking

**Files:**
- Modify: `src/lib/sms.ts` (full rewrite, shown below)
- Modify: `src/lib/booking.ts` (3 call sites), `src/lib/waitlist.ts` (1 call site), `src/lib/reminders.ts` (1 call site)
- Test: `tests/sms.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `sendSmsSafe(to: string, body: string): Promise<void>` (never rejects) and `smsIsLive(): boolean` from `src/lib/sms.ts`. The old `sendSms` export is **removed**; all callers switch.

**Why:** Today `sms.ts` constructs the Twilio client at import time — one malformed credential crashes the whole voice agent at boot (verified live: a non-`AC` SID throws in module scope). Worse, booking/cancel/reschedule `await sendSms(...)` inside the tool handler: a Twilio failure makes the agent tell the caller the booking failed *after the appointment row was created*, and even a healthy send adds its round trip to tool latency.

- [ ] **Step 1: Write the failing test**

Create `tests/sms.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';

// Poison the Twilio env BEFORE importing the module. This reproduces the
// observed boot crash: a SID not starting with "AC" makes twilio() throw.
process.env.TWILIO_ACCOUNT_SID = 'not-a-real-sid';
process.env.TWILIO_AUTH_TOKEN = 'x';
process.env.TWILIO_FROM_NUMBER = '+15550000000';

const sms = await import('../src/lib/sms.js');

describe('sms resilience', () => {
  it('importing the module does not throw on bad credentials', () => {
    expect(typeof sms.sendSmsSafe).toBe('function');
  });

  it('sendSmsSafe resolves (never rejects) even with a broken Twilio config', async () => {
    await expect(sms.sendSmsSafe('+15551230001', 'test message')).resolves.toBeUndefined();
  });

  it('smsIsLive reports false when the client cannot be constructed', () => {
    expect(sms.smsIsLive()).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test tests/sms.test.ts`
Expected: FAIL — the import of `../src/lib/sms.js` throws `accountSid must start with AC` (today's boot-crash bug, reproduced), and `sendSmsSafe` does not exist.

- [ ] **Step 3: Rewrite `src/lib/sms.ts`**

Replace the entire file content with:

```ts
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
```

- [ ] **Step 4: Switch every caller**

Run: `grep -rn "sendSms" src scripts` — expected call sites: `src/lib/booking.ts` (3), `src/lib/waitlist.ts` (1), `src/lib/reminders.ts` (1), plus the definition. If grep finds others, apply the same substitution there.

In `src/lib/booking.ts` and `src/lib/waitlist.ts`: change the import to `import { sendSmsSafe } from './sms.js';` and change every `await sendSms(` to `void sendSmsSafe(` — the SMS no longer blocks the tool response nor fails it. Example (booking confirmation):

```ts
  void sendSmsSafe(
    appointment.customer.phone,
    `${SPA.name}: you're booked for ${service.name} with ${appointment.staff.name} on ${humanTime(input.startTime)}. See you then!`,
  );
```

In `src/lib/reminders.ts`: change the import the same way, but keep the await — `await sendSmsSafe(` — so the reminders CLI (`scripts/send-reminders.ts`) finishes its sends before the process exits.

- [ ] **Step 5: Run tests and typecheck**

Run: `bun test tests/sms.test.ts` → Expected: 3 pass.
Run: `bunx tsc --noEmit` → Expected: clean (this proves no caller still references the removed `sendSms`).

- [ ] **Step 6: Commit**

```bash
git add src/lib/sms.ts src/lib/booking.ts src/lib/waitlist.ts src/lib/reminders.ts tests/sms.test.ts
git commit -m "$(cat <<'EOF'
Make SMS non-blocking and boot-safe so texting can never break a call

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Deadline helper — `raceWithFallback`

**Files:**
- Create: `src/lib/async.ts`
- Test: `tests/race-with-fallback.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `raceWithFallback<T>(primary: Promise<T>, deadlineMs: number, fallback: () => T): Promise<T>` from `src/lib/async.ts`. Task 7 uses it on the assistant-request path.

**Why:** Vapi enforces a **hard, non-configurable 7.5-second** end-to-end deadline on the `assistant-request` webhook; exceeding it fails the call at pickup (`assistant-request-failed`). Measured on this stack: a Neon cold start makes `buildAssistant` take **7.76s**. The route must be able to answer with a valid fallback before the deadline no matter what the DB does.

- [ ] **Step 1: Write the failing test**

Create `tests/race-with-fallback.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import { raceWithFallback } from '../src/lib/async.js';

const later = <T>(ms: number, value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

describe('raceWithFallback', () => {
  it('returns the primary result when it beats the deadline', async () => {
    expect(await raceWithFallback(later(5, 'fast'), 200, () => 'fallback')).toBe('fast');
  });

  it('returns the fallback when the primary is too slow', async () => {
    expect(await raceWithFallback(later(200, 'slow'), 20, () => 'fallback')).toBe('fallback');
  });

  it('returns the fallback when the primary rejects', async () => {
    expect(await raceWithFallback(Promise.reject(new Error('db down')), 200, () => 'fallback')).toBe('fallback');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test tests/race-with-fallback.test.ts`
Expected: FAIL — cannot resolve `../src/lib/async.js`.

- [ ] **Step 3: Implement**

Create `src/lib/async.ts`:

```ts
// Deadline helper for hard-realtime webhook paths. Vapi gives assistant-request
// a fixed 7.5s end-to-end budget; instead of ever missing it (which fails the
// call at pickup), we answer with a degraded-but-valid fallback.

export async function raceWithFallback<T>(primary: Promise<T>, deadlineMs: number, fallback: () => T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback()), deadlineMs);
  });
  try {
    return await Promise.race([primary.catch(() => fallback()), deadline]);
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `bun test tests/race-with-fallback.test.ts` → Expected: 3 pass.
Run: `bunx tsc --noEmit` → Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/async.ts tests/race-with-fallback.test.ts
git commit -m "$(cat <<'EOF'
Add raceWithFallback for answering hard-deadline webhooks

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Catalog cache — stop paying Neon round trips for static data

**Files:**
- Create: `src/lib/catalog.ts`
- Modify: `src/vapi/tools.ts` (`resolveService`, lines ~18-26, and the now-unused `prisma` import)
- Modify: `src/lib/availability.ts` (`findOpenSlots`, lines ~19-33)
- Test: `tests/catalog-cache.test.ts`

**Interfaces:**
- Consumes: `prisma` from `src/lib/db.js`.
- Produces: `cached<T>(fetch: () => Promise<T>, ttlMs: number): () => Promise<T>`, `getServices(): Promise<Service[]>`, `getStaff(): Promise<StaffMember[]>` from `src/lib/catalog.ts` (Prisma model types inferred — no explicit annotations needed).

**Why:** Measured warm tool-call latency is ~0.6s, of which 2 of the 4 sequential Neon round trips fetch services/staff — data that changes on the order of weeks. A 60s TTL cache halves the hot-path round trips; the mid-conversation pause after "let me check" shrinks accordingly.

- [ ] **Step 1: Write the failing test**

Create `tests/catalog-cache.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';

process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
const { cached } = await import('../src/lib/catalog.js');

describe('cached', () => {
  it('reuses the value within the TTL', async () => {
    let calls = 0;
    const get = cached(async () => ++calls, 60_000);
    expect(await get()).toBe(1);
    expect(await get()).toBe(1);
    expect(calls).toBe(1);
  });

  it('refetches after the TTL expires', async () => {
    let calls = 0;
    const get = cached(async () => ++calls, 0);
    await get();
    await get();
    expect(calls).toBe(2);
  });

  it('does not cache failures', async () => {
    let calls = 0;
    const get = cached(async () => {
      calls++;
      if (calls === 1) throw new Error('transient');
      return 'ok';
    }, 60_000);
    await expect(get()).rejects.toThrow('transient');
    expect(await get()).toBe('ok');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test tests/catalog-cache.test.ts`
Expected: FAIL — cannot resolve `../src/lib/catalog.js`.

- [ ] **Step 3: Implement `src/lib/catalog.ts`**

```ts
// Services and staff change rarely (an admin edit, not mid-call), but every
// availability check and service lookup paid a Neon round trip for them. A
// short TTL cache removes those round trips from the hot tool-call path while
// keeping data fresh enough that a catalog edit shows up within a minute.

import { prisma } from './db.js';

export function cached<T>(fetch: () => Promise<T>, ttlMs: number): () => Promise<T> {
  let value: Promise<T> | null = null;
  let fetchedAt = 0;
  return () => {
    if (!value || Date.now() - fetchedAt >= ttlMs) {
      fetchedAt = Date.now();
      value = fetch().catch((err) => {
        value = null; // never cache a failure
        throw err;
      });
    }
    return value;
  };
}

const CATALOG_TTL_MS = 60_000;
export const getServices = cached(() => prisma.service.findMany(), CATALOG_TTL_MS);
export const getStaff = cached(() => prisma.staffMember.findMany(), CATALOG_TTL_MS);
```

- [ ] **Step 4: Run the cache tests**

Run: `bun test tests/catalog-cache.test.ts` → Expected: 3 pass.

- [ ] **Step 5: Swap the hot-path call sites**

In `src/vapi/tools.ts`:
- Remove the line `import { prisma } from '../lib/db.js';` (after this change nothing in the file uses it).
- Add `import { getServices } from '../lib/catalog.js';`
- In `resolveService`, replace `const services = await prisma.service.findMany();` with `const services = await getServices();`

In `src/lib/availability.ts`:
- Add `import { getServices, getStaff } from './catalog.js';` (keep the existing `prisma` import — appointments are still queried live).
- In `findOpenSlots`, replace:

```ts
  const service = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!service) throw new Error('Unknown service.');
```

with:

```ts
  const service = (await getServices()).find((s) => s.id === serviceId);
  if (!service) throw new Error('Unknown service.');
```

- and replace `const staff = await prisma.staffMember.findMany();` with `const staff = await getStaff();`

- [ ] **Step 6: Typecheck and full test run**

Run: `bunx tsc --noEmit` → Expected: clean.
Run: `bun test` → Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/catalog.ts src/vapi/tools.ts src/lib/availability.ts tests/catalog-cache.test.ts
git commit -m "$(cat <<'EOF'
Cache the service and staff catalog to cut tool-call latency

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: One-round-trip customer profile

**Files:**
- Modify: `src/lib/customers.ts` (add two exports; keep existing ones — the tools still use them)
- Test: `tests/customer-profile.test.ts`

**Interfaces:**
- Consumes: `prisma` from `src/lib/db.js`.
- Produces: `splitProfileAppointments<A extends { status: string; startTime: Date }>(appointments: A[]): { upcoming: A[]; past: A[] }` and `customerProfile(phone: string): Promise<{ customer; upcoming; past } | null>` where `upcoming`/`past` elements carry `service` and `staff` includes (Prisma-inferred types). Task 6 consumes `customerProfile`.

**Why:** `buildAssistant` currently does `findCustomerByPhone` **then** `Promise.all(upcomingAppointments, pastVisits)` — two sequential Neon round trips inside Vapi's hard pickup deadline. One `findUnique` with a filtered `appointments` include does the same job in one round trip; splitting into upcoming/past happens in JS.

- [ ] **Step 1: Write the failing test**

Create `tests/customer-profile.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';

process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
const { splitProfileAppointments } = await import('../src/lib/customers.js');

const at = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

describe('splitProfileAppointments', () => {
  it('separates future booked visits from the last three completed ones', () => {
    // Ordered ascending by startTime, matching the customerProfile query.
    const rows = [
      { status: 'COMPLETED', startTime: at(-40) },
      { status: 'COMPLETED', startTime: at(-30) },
      { status: 'COMPLETED', startTime: at(-20) },
      { status: 'COMPLETED', startTime: at(-10) },
      { status: 'BOOKED', startTime: at(-1) }, // stale BOOKED in the past — not "upcoming"
      { status: 'BOOKED', startTime: at(1) },
      { status: 'CANCELLED', startTime: at(2) }, // cancelled — never shown
    ];
    const { upcoming, past } = splitProfileAppointments(rows);

    expect(upcoming).toEqual([rows[5]]);
    expect(past).toHaveLength(3);
    expect(past[0]).toBe(rows[3]); // most recent completed first
    expect(past[1]).toBe(rows[2]);
    expect(past[2]).toBe(rows[1]);
  });

  it('handles a customer with no history', () => {
    const { upcoming, past } = splitProfileAppointments([]);
    expect(upcoming).toEqual([]);
    expect(past).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test tests/customer-profile.test.ts`
Expected: FAIL — `splitProfileAppointments` is not exported.

- [ ] **Step 3: Implement in `src/lib/customers.ts`**

Append to the file:

```ts
// Split a customer's appointment rows (ordered ascending by startTime) into
// what personalization needs: future booked visits, and the 3 most recent
// completed ones (most recent first).
export function splitProfileAppointments<A extends { status: string; startTime: Date }>(appointments: A[]) {
  const now = new Date();
  const upcoming = appointments.filter((a) => a.status === 'BOOKED' && a.startTime >= now);
  const past = appointments
    .filter((a) => a.status === 'COMPLETED')
    .slice(-3)
    .reverse();
  return { upcoming, past };
}

// One-round-trip profile for call personalization. buildAssistant runs inside
// Vapi's hard assistant-request deadline, so every round trip shaved here is
// margin against a failed call pickup.
export async function customerProfile(phone: string) {
  const customer = await prisma.customer.findUnique({
    where: { phone },
    include: {
      appointments: {
        where: { OR: [{ status: 'BOOKED', startTime: { gte: new Date() } }, { status: 'COMPLETED' }] },
        include: { service: true, staff: true },
        orderBy: { startTime: 'asc' },
      },
    },
  });
  if (!customer) return null;
  return { customer, ...splitProfileAppointments(customer.appointments) };
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `bun test tests/customer-profile.test.ts` → Expected: 2 pass.
Run: `bunx tsc --noEmit` → Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/customers.ts tests/customer-profile.test.ts
git commit -m "$(cat <<'EOF'
Load the caller profile in a single query for faster call pickup

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: The reliability-hardened assistant config

**Files:**
- Modify: `src/vapi/personalization.ts` (imports, new config constants, `buildAssistant`, new `buildFallbackAssistant`)
- Test: `tests/assistant-config.test.ts`

**Interfaces:**
- Consumes: `customerProfile` from `src/lib/customers.js` (Task 5); `SPA`, `VOICE` from `src/config.js`.
- Produces: `buildAssistant(callerPhone: string): Promise<object>` (same name/signature as today, richer output) and `buildFallbackAssistant(): object` (synchronous, zero I/O). Task 7 consumes both.

**Why:** This is the fix for the observed mid-sentence cutoffs and half the dead-air story. Every block below prevents a specific verified failure: default `stopSpeakingPlan` interrupts on raw VAD (echo/breath/cough = false barge-in — Vapi staff confirmed this exact quiet-room symptom); no voice fallback means one ElevenLabs error terminates the call; no speech-timeout hook means silence rides until Vapi's ~30s timeout kills the call; no tool messages means a slow webhook is pure dead air (idle hooks are disabled during tool calls); `messagePlan.idleMessages` no longer exists in Vapi's API — hooks are the current mechanism.

- [ ] **Step 1: Write the failing test**

Create `tests/assistant-config.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test tests/assistant-config.test.ts`
Expected: FAIL — `buildFallbackAssistant` is not exported (and shape assertions fail for `buildAssistant`).

- [ ] **Step 3: Rework `src/vapi/personalization.ts`**

3a. Replace the customers import line:

```ts
import { findCustomerByPhone, pastVisits, upcomingAppointments } from '../lib/customers.js';
```

with:

```ts
import { customerProfile } from '../lib/customers.js';
```

3b. Directly below the imports, add the reliability constants:

```ts
// --- Reliability configuration ---------------------------------------------
// Each value prevents a specific verified failure mode. Values locked per the
// 2026-07-18 research pass; see docs/superpowers/plans/2026-07-18-vapi-reliability-hardening.md.

// False barge-in was the #1 cause of "stops talking mid-sentence": the default
// stopSpeakingPlan (numWords 0) interrupts on raw voice-activity detection,
// which triggers on echo, breaths, and coughs even in a quiet room. numWords 2
// requires two *transcribed words* before the assistant yields.
const START_SPEAKING_PLAN = { waitSeconds: 0.7 };
const STOP_SPEAKING_PLAN = { numWords: 2, voiceSeconds: 0.5, backoffSeconds: 1 };

// Explicit transcriber (not the account default) so we control the model and
// can attach a fallback — a dead STT provider otherwise means the assistant
// "hears" nothing for the rest of the call.
const TRANSCRIBER = {
  provider: 'deepgram',
  model: 'nova-3',
  language: 'en',
  fallbackPlan: { transcribers: [{ provider: 'deepgram', model: 'nova-2', language: 'en' }] },
};

// Without a voice fallback, a single ElevenLabs error terminates the call
// (pipeline-error-eleven-labs-voice-failed). Order: alternate 11labs voice
// first (closest sound), cross-provider voice as last resort.
const VOICE_FALLBACK_PLAN = {
  voices: [
    { provider: '11labs', voiceId: '21m00Tcm4TlvDq8ikWAM', model: 'eleven_flash_v2_5' },
    { provider: 'openai', voiceId: 'shimmer' },
  ],
};

// If the caller goes quiet, re-prompt twice instead of sitting in dead air
// until Vapi's silence timeout kills the call. (messagePlan.idleMessages no
// longer exists in Vapi's API; this hook is the current mechanism.)
const HOOKS = [
  {
    on: 'customer.speech.timeout',
    options: { timeoutSeconds: 10, triggerMaxCount: 2, triggerResetMode: 'onUserSpeech' },
    do: [{ type: 'say', exact: "Are you still there? I can check times or book whenever you're ready." }],
  },
];

// Spoken cover for tool latency: idle hooks are disabled during tool calls, so
// these messages are the only thing between a slow webhook and silent dead air.
const TOOL_MESSAGES = [
  { type: 'request-start', content: 'One moment while I check that for you.' },
  { type: 'request-response-delayed', content: 'Thanks for your patience — almost done.', timingMilliseconds: 4000 },
  { type: 'request-failed', content: "I'm sorry, that didn't go through just now. Let's try once more." },
];
```

3c. Below `SHARED_RULES`, add the two shared builders:

```ts
// Everything reliability-related, identical for every caller.
function assistantBase() {
  return {
    transcriber: TRANSCRIBER,
    voice: { ...VOICE, fallbackPlan: VOICE_FALLBACK_PLAN },
    startSpeakingPlan: START_SPEAKING_PLAN,
    stopSpeakingPlan: STOP_SPEAKING_PLAN,
    backgroundDenoisingEnabled: true,
    hooks: HOOKS,
  };
}

function assistantModel(context: string) {
  return {
    provider: 'openai',
    model: 'gpt-4o-mini',
    fallbackModels: ['gpt-4o'],
    messages: [{ role: 'system', content: `${SHARED_RULES}\n\n${context}` }],
    tools: toolDefinitions.map((t) => ({ ...t, messages: TOOL_MESSAGES })),
  };
}
```

3d. Replace the body of `buildAssistant` so it uses `customerProfile` and the shared builders (the greeting/context strings are unchanged except `upcoming`/`history` now come from the profile):

```ts
export async function buildAssistant(callerPhone: string) {
  const profile = callerPhone ? await customerProfile(callerPhone) : null;

  let firstMessage: string;
  let context: string;

  if (profile) {
    const { customer, upcoming, past } = profile;
    const upcomingLine = upcoming.length
      ? `They have an upcoming ${upcoming[0]!.service.name} with ${upcoming[0]!.staff.name} on ${humanTime(upcoming[0]!.startTime)}.`
      : 'They have no upcoming appointments.';
    const historyLine = past.length
      ? `Past visits: ${past.map((h) => h.service.name).join(', ')}.`
      : 'No past visits on record.';

    firstMessage = upcoming.length
      ? `Hi ${customer.fullName.split(' ')[0]}, welcome back to ${SPA.name}! Are you calling about your ${upcoming[0]!.service.name} on ${humanTime(upcoming[0]!.startTime)}, or something else?`
      : `Hi ${customer.fullName.split(' ')[0]}, welcome back to ${SPA.name}! How can I help today?`;

    context = `The caller is a returning client: ${customer.fullName}. ${upcomingLine} ${historyLine}
${customer.notes ? `Front-desk notes: ${customer.notes}` : ''}
You already know who they are — do not ask for their name.`;
  } else {
    firstMessage = `Thanks for calling ${SPA.name}! How can I help you today?`;
    context = `The caller is not in our system (new client). If they want to book, use register_customer to take their name first, then book.`;
  }

  return { ...assistantBase(), firstMessage, model: assistantModel(context) };
}

// Degraded-but-working assistant for when personalization can't complete in
// time (DB cold start or outage). The call ALWAYS connects; the agent can
// recover the caller's details mid-call via get_my_details once the DB wakes.
export function buildFallbackAssistant() {
  const context = `You could not load this caller's record before the call connected (temporary system delay).
Treat them warmly as a possibly-returning client. If you need their details, call get_my_details — it may work now.
If they want to book and get_my_details finds nothing, register them with register_customer first.`;
  return {
    ...assistantBase(),
    firstMessage: `Thanks for calling ${SPA.name}! How can I help you today?`,
    model: assistantModel(context),
  };
}
```

(The `toolDefinitions` array itself is unchanged.)

- [ ] **Step 4: Run tests and typecheck**

Run: `bun test tests/assistant-config.test.ts` → Expected: 2 pass.
Run: `bunx tsc --noEmit` → Expected: clean.
Run: `bun test` → Expected: all suites pass.

- [ ] **Step 5: Commit**

```bash
git add src/vapi/personalization.ts tests/assistant-config.test.ts
git commit -m "$(cat <<'EOF'
Harden the assistant config against barge-in, silence, and provider failures

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Webhook contract — always 200, string results, deadline-proof pickup

**Files:**
- Create: `src/app.ts`
- Modify: `src/index.ts` (slims down to listener + jobs), `src/routes/vapi.ts` (string envelope + fallback race), `src/routes/webtest.ts` (server timeout), `scripts/simulate-call.ts` (parse the now-string result)
- Test: `tests/webhook.test.ts`

**Interfaces:**
- Consumes: `raceWithFallback` (Task 3), `buildAssistant`/`buildFallbackAssistant` (Task 6).
- Produces: `createApp(): express.Express` from `src/app.ts`. Webhook tool responses become `{ results: [{ toolCallId: string, result: string }] }` — `result` is **always a JSON string** (success payloads stringified; errors as `'{"error":"..."}'`). `assistant-request` always answers HTTP 200 with a valid assistant within 4.5s.

**Why (verified against Vapi docs):** Vapi **ignores any non-200 tool response entirely** and silently discards responses whose `result`/`error` are not strings or whose `toolCallId` doesn't exactly match — logging "ok, no result returned" while the caller hears nothing. Today this route returns result **objects** (contract violation) and returns a raw 500 if `buildAssistant` throws (verified live: DB failure = dead call at pickup). Errors stay *inside* the `result` string (not the `error` field) deliberately — the model reads them as data and recovers conversationally, which is this codebase's existing design.

- [ ] **Step 1: Write the failing test**

Create `tests/webhook.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test tests/webhook.test.ts`
Expected: FAIL — cannot resolve `../src/app.js`.

- [ ] **Step 3: Extract `src/app.ts` and slim `src/index.ts`**

Create `src/app.ts`:

```ts
// Express app assembly, separated from the listener so tests can mount the
// real app on an ephemeral port.

import cors from 'cors';
import express from 'express';
import { SPA } from './config.js';
import { vapiRouter } from './routes/vapi.js';
import { apiRouter } from './routes/api.js';
import { webtestRouter } from './routes/webtest.js';

export function createApp() {
  const app = express();
  app.use(cors()); // the dashboard runs on a different port in dev, so allow cross-origin reads
  app.use(express.json());
  app.use(express.static('public')); // serves the dev web-test page at /web-test.html

  app.get('/', (_req, res) => {
    res.json({ service: `${SPA.name} AI receptionist`, status: 'ok' });
  });

  app.use('/vapi', vapiRouter);
  app.use('/api', apiRouter);

  // Dev-only browser test harness (talk to the assistant from a web page, no phone).
  // Off in production so it never exposes the assistant config or secret publicly.
  if (process.env.NODE_ENV !== 'production') {
    app.use('/web-test', webtestRouter);
  }

  return app;
}
```

Replace `src/index.ts` with:

```ts
// HTTP server. Vapi points at POST /vapi/webhook. The health check is handy
// for confirming a deploy is live.

import { PORT, REMINDER_HOUR, SPA } from './config.js';
import { createApp } from './app.js';
import { startDailyReminderJob } from './lib/reminders.js';

createApp().listen(PORT, () => {
  console.log(`${SPA.name} receptionist backend listening on http://localhost:${PORT}`);
  console.log(`Vapi webhook: POST http://localhost:${PORT}/vapi/webhook`);
  if (process.env.NODE_ENV !== 'production') {
    console.log(`Web test page: http://localhost:${PORT}/web-test.html`);
  }
  // Daily appointment-reminder texts, run in-process while the server is up.
  startDailyReminderJob(REMINDER_HOUR);
});
```

- [ ] **Step 4: Fix the webhook contract in `src/routes/vapi.ts`**

Replace the imports and `runToolCall`, and the `assistant-request` branch:

```ts
import { Router, type Request, type Response } from 'express';
import { VAPI_SECRET } from '../config.js';
import { raceWithFallback } from '../lib/async.js';
import { buildAssistant, buildFallbackAssistant } from '../vapi/personalization.js';
import { tools, type ToolContext } from '../vapi/tools.js';
```

```ts
// Vapi's assistant-request webhook has a hard, non-configurable 7.5s end-to-end
// budget; missing it fails the call at pickup. We spend at most 4.5s on
// personalization, then ship the generic fallback — the call ALWAYS connects.
const ASSISTANT_BUILD_BUDGET_MS = 4500;

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
    return typeof value === 'string' ? value : JSON.stringify(value);
  } catch (err) {
    return JSON.stringify({ error: err instanceof Error ? err.message : 'Something went wrong.' });
  }
}
```

In the route handler, replace the `assistant-request` branch:

```ts
  if (message.type === 'assistant-request') {
    const assistant = await raceWithFallback(buildAssistant(callerPhone), ASSISTANT_BUILD_BUDGET_MS, buildFallbackAssistant);
    return res.json({ assistant });
  }
```

(The `tool-calls` branch keeps its `Promise.all` mapping — `runToolCall` now returns the string directly: `({ toolCallId: call.id, result: await runToolCall(call, ctx) })`.)

- [ ] **Step 5: Update the two consumers of the old object shape**

`src/routes/webtest.ts` — add the tool timeout to the injected server block:

```ts
    assistant.server = {
      url: `${base}/vapi/webhook`,
      timeoutSeconds: 10,
      ...(VAPI_SECRET ? { secret: VAPI_SECRET } : {}),
    };
```

`scripts/simulate-call.ts` — the availability result is now a JSON **string**; replace:

```ts
  const first = avail?.results?.[0]?.result?.options?.[0];
```

with:

```ts
  const availResult = JSON.parse(avail?.results?.[0]?.result ?? '{}');
  const first = availResult?.options?.[0];
```

- [ ] **Step 6: Run tests and typecheck**

Run: `bun test tests/webhook.test.ts` → Expected: 4 pass (or 3 pass + 1 skip if `VAPI_SECRET` is empty).
Run: `bunx tsc --noEmit` → Expected: clean.
Run: `bun test` → Expected: all suites pass.

- [ ] **Step 7: Commit**

```bash
git add src/app.ts src/index.ts src/routes/vapi.ts src/routes/webtest.ts scripts/simulate-call.ts tests/webhook.test.ts
git commit -m "$(cat <<'EOF'
Meet Vapi's tool-response contract and never miss the assistant-request deadline

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Keep Neon warm

**Files:**
- Modify: `src/lib/db.ts` (add `startDbKeepWarm`)
- Modify: `src/index.ts` (start the ping inside the listen callback)
- Test: `tests/keep-warm.test.ts`

**Interfaces:**
- Consumes: `prisma` from `src/lib/db.js`.
- Produces: `startDbKeepWarm(intervalMs?: number, ping?: () => Promise<unknown>): () => void` (returns a stop function).

**Why:** Neon suspends its compute after ~5 idle minutes; the measured wake-up on this stack is **7.76s** — over Vapi's 7.5s pickup budget (that's the intermittent "first call after a quiet spell fails"). A `SELECT 1` every 4 minutes keeps it awake for pennies; running it immediately at boot also warms the very first call after a deploy. (Long-term alternative: disable scale-to-zero on a paid Neon plan.)

- [ ] **Step 1: Write the failing test**

Create `tests/keep-warm.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';

process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
const { startDbKeepWarm } = await import('../src/lib/db.js');

describe('startDbKeepWarm', () => {
  it('pings immediately on start and can be stopped', () => {
    let pings = 0;
    const stop = startDbKeepWarm(60_000, async () => {
      pings++;
    });
    expect(pings).toBe(1);
    stop();
  });

  it('survives a failing ping without throwing', () => {
    const stop = startDbKeepWarm(60_000, async () => {
      throw new Error('db down');
    });
    stop();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test tests/keep-warm.test.ts`
Expected: FAIL — `startDbKeepWarm` is not exported.

- [ ] **Step 3: Implement in `src/lib/db.ts`**

Append:

```ts
// Neon suspends its compute after ~5 idle minutes, and the wake-up costs
// multiple seconds — enough to blow Vapi's hard 7.5s assistant-request budget
// on the first call after a quiet spell. A cheap periodic ping keeps the
// compute awake while the server runs; the boot-time ping also warms the very
// first call after a deploy.
export function startDbKeepWarm(
  intervalMs = 4 * 60_000,
  ping: () => Promise<unknown> = () => prisma.$queryRaw`SELECT 1`,
): () => void {
  const run = () => {
    void ping().catch((err) => console.warn('[db] keep-warm ping failed:', err));
  };
  run();
  const timer = setInterval(run, intervalMs);
  return () => clearInterval(timer);
}
```

- [ ] **Step 4: Start it in `src/index.ts`**

Add to the imports: `import { startDbKeepWarm } from './lib/db.js';`
Inside the `listen` callback, after `startDailyReminderJob(REMINDER_HOUR);`, add:

```ts
  // Keep the Neon compute awake so call pickup never pays a cold start.
  startDbKeepWarm();
  console.log('[db] keep-warm ping every 4 minutes');
```

- [ ] **Step 5: Run tests and typecheck**

Run: `bun test tests/keep-warm.test.ts` → Expected: 2 pass.
Run: `bunx tsc --noEmit` → Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/db.ts src/index.ts tests/keep-warm.test.ts
git commit -m "$(cat <<'EOF'
Keep the Neon compute warm so call pickup never pays a cold start

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: End-to-end verification

**Files:**
- No new files. Runs the full stack; the last two checks need the user (live mic call).

**Interfaces:**
- Consumes: everything above.
- Produces: evidence for the final report — before/after latency numbers and the manual checklist results.

- [ ] **Step 1: Full automated pass**

Run: `bunx tsc --noEmit` → clean.
Run: `bun test` → all suites pass (expect ~17 tests across 7 files).

- [ ] **Step 2: Integration pass against the demo DB** *(resets demo data — this is the repo's documented dev loop, see README "Try it without a phone")*

Run: `bun run seed` → seed summary prints.
Start the server in one terminal: `bun run dev`. In another: `bun run simulate`.
Expected: Call 1 — Sarah's `cancel_appointment` result is now a JSON **string** containing `"cancelled":true`, and the waitlist SMS to Maria appears in the server log (log-only mode) *after* the webhook response (fire-and-forget). Call 2 — the new caller registers and books; `book_appointment` result string contains `"booked":true`. The simulate script's slot-picking still works (it parses the string now).

- [ ] **Step 3: Measure the pickup path**

With the server still running, time the webhook (Git Bash; reads `VAPI_SECRET` from `.env` without printing it):

```bash
SECRET=$(grep -E '^VAPI_SECRET=' .env | cut -d= -f2- | tr -d '\r' | sed 's/^"//; s/"$//')
for i in 1 2 3; do
  curl -s -o /dev/null -w "assistant-request run $i: %{time_total}s\n" \
    -X POST http://localhost:3000/vapi/webhook \
    -H "content-type: application/json" -H "x-vapi-secret: $SECRET" \
    -d '{"message":{"type":"assistant-request","call":{"customer":{"number":"+15551230001"}}}}'
done
```

Expected: every run well under 1s (baseline before this plan: 7.76s cold / 0.42s warm). Record the numbers for the final report.

- [ ] **Step 4: Live web-test call — USER CHECKLIST** *(requires a microphone; the user runs this, agent cannot)*

Open the web-test page (via ngrok URL for tool calls, per the page's own hint) and run one call per item:

1. **Vapi accepts the config:** the call starts at all. If it errors immediately, the event log shows Vapi's validation message naming the bad field — fix per the docs links in Global Constraints and re-run.
2. **No false barge-in:** let the assistant speak several long sentences while you stay silent. Event log must show NO "user speech" / interrupt events during assistant speech, and no `speech-end` under 600ms (the page flags these).
3. **Real interruption still works:** talk over it with a full phrase ("wait, actually I have a question") — it should yield within ~half a second.
4. **Silence recovery:** say nothing for ~10s mid-call → you hear "Are you still there?..." (twice max).
5. **Tool latency cover:** ask to book → you hear "One moment while I check that for you." before the availability answer.
6. **Fallback pickup:** stop the server, wait 6+ minutes (Neon suspends), restart the server and call within ~10s — the call must still connect (generic greeting is acceptable; that's the fallback working as designed).

- [ ] **Step 5: Report**

Summarize for the user: what changed, the before/after latency numbers from Step 3, results of each checklist item, and any Vapi field-name corrections that were needed.

---

## Deliberately out of scope (do not "helpfully" add)

- **No assistant-level `server`/`serverUrl` in `buildAssistant`** — phone calls get the tool URL from the Vapi phone-number config today; injecting `PUBLIC_URL` there could silently break working phone calls when ngrok rotates. The web-test route injects it already.
- **No per-tool `server` blocks** (a per-tool `server` without a `url` is of unverified validity).
- **No `silenceTimeoutSeconds` change** — the speech-timeout hook re-prompts at ~10s and ~20s; Vapi's default ~30s hangup then behaves correctly.
- **No ElevenLabs chunkPlan/stability changes** — zero claims about TTS-side cutoffs survived verification; the barge-in fix is the verified mechanism. If cutoffs persist after this plan with no interrupt events in the logs, that's a new investigation.
- **No prompt-wording changes** — the user owns the prompt layer.
