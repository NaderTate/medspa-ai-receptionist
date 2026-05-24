# Video Script — "I Built a Med Spa Receptionist That Makes $2k/month"

> Working title (winner of the title validation): **"I Built a Med Spa Receptionist That Makes $2k/month"**
> Backup: "This AI Receptionist Reschedules Appointments by Itself — Med Spa Build (Vapi + Node)"
>
> Target length: 10-13 min. Bucket: 30-case-study (services / book-a-call).
> Format being replicated: "I Built an AI [Receptionist] with [stack]" + live-call money shot (proven: Nate 110k, Liam 109k, ItsKeaton 118k).
>
> **The one rule for this video:** the live demo must trigger a **reschedule/cancel + the waitlist text** on camera. That moment is why the video beats the no-code crowd. Don't just show a booking.

---

## How to read this script

Each section has three tracks:
- **[SAY]** — what you say to camera / voiceover.
- **[SHOW]** — what's on screen.
- **[DEMO]** — exact clicks/calls to perform.

Demo data is already seeded (`bun run seed`). The returning client is **Sarah Chen (+1 555 123 0001)** with a Botox appointment **tomorrow at 2:00 PM**. **Maria Lopez (+1 555 123 0002)** is on the Botox waitlist, so when Sarah cancels, Maria gets the text. That's your hero moment.

---

## 0. COLD OPEN — the money shot (0:00 - 0:45)

**[DEMO]** Pre-record a real phone call to your Vapi number. Call as Sarah (a number you've added to the DB). On the call: ask to **move your Botox to Thursday**. The agent reschedules it live. Then a beat later, your phone buzzes with the confirmation text.

**[SHOW]** Split screen: your phone on the call (left), the database/calendar updating (right).

**[SAY]**
> "A med spa books $600 a face. The phone rings while the injector is mid-Botox, gloved up, can't answer. That's a missed booking, and most spas miss three of these a day. So I built an AI receptionist that doesn't just answer the phone, it reschedules, cancels, and re-books appointments by itself. What you just saw was real. Here's how I built it, and at the end I'll show you how you'd charge a spa $2,000 a month for it."

---

## 1. WHAT IT ACTUALLY DOES (0:45 - 2:00)

**[SAY]** Plain English, no code yet.
> "Four things make this worth real money to a spa owner:
> 1. It **remembers callers**. Sarah calls, it already knows her name, her usual provider, and her next appointment.
> 2. It **books, reschedules, and cancels** against a real calendar. No double-booking.
> 3. When someone cancels, it **instantly texts the next person on the waitlist** to grab the slot. A cancellation becomes a re-booking.
> 4. It **texts confirmations and reminders** so people show up."

**[SHOW]** Four clean title cards. (Use the Miro board feature panel.)

**[SAY]**
> "Number 3 is the one owners lose their minds over. An empty chair is pure lost revenue. This fills it automatically."

---

## 2. THE ARCHITECTURE IN 60 SECONDS (2:00 - 3:30)

**[SHOW]** The Miro architecture board (call flow: caller → Vapi → your webhook → personalization / tools → lib → Neon + Twilio).

**[SAY]**
> "Here's the trick that keeps this cheap and flexible: Vapi handles the voice, the talking and listening. But it's basically a phone with a brain socket. The actual brain, all the booking logic, lives in my own backend. Vapi just calls my server and asks 'what do I say, what can I do.' That's why this isn't a no-code toy. 95% of the value is in code I control."

**[SAY]** Name the stack on screen:
> "Bun and Express for the server. Prisma and Neon Postgres for the database. Twilio for texts. Vapi for the voice. That's it."

**[SHOW]** On-screen labels: **Vapi (V-A-P-I)**, **Neon**, **Prisma**, **Twilio**. (Say each name slowly, spell Vapi.)

---

## 3. RECOGNIZING THE CALLER (3:30 - 5:30)

**[SHOW]** `src/vapi/personalization.ts`.

**[SAY]**
> "Before the call even connects, Vapi sends me the caller's phone number. I look it up. If I know them, I build a greeting that uses their name and their actual next appointment. If I don't, they get a clean new-client flow. Same tools either way."

**[DEMO]** Run the simulator's assistant-request for Sarah, show the personalized `firstMessage`:
> "Hi Sarah, welcome back to Lumière Med Spa! Are you calling about your Botox on Tuesday at 2:00 PM, or something else?"

**[SAY]**
> "I never told it who's calling. It knew. That's the difference between an AI that sounds like a robot and one that sounds like the front desk that's known you for years."

---

## 4. THE BUILD — booking + availability (5:30 - 8:00)

**[SHOW]** `src/lib/availability.ts`, then `src/lib/booking.ts`.

**[SAY]** Keep tying code back to behavior.
> "Availability is just: opening hours, minus the appointments already on the books, in slots the right length for the service. Booking checks the provider is still free, saves it, and fires a confirmation text."

**[DEMO]** Simulator: new caller registers → checks Botox availability → books the first slot. Show the confirmation SMS in the console (log-only mode).

**[SAY]**
> "And notice, no Twilio account needed to build this. It runs in log-only mode and just prints the text it would send. You plug in real Twilio keys at the end."

---

## 5. THE DIFFERENTIATOR — reschedule, cancel, and the waitlist (8:00 - 10:30)

> THIS IS THE CORE OF THE VIDEO. Slow down here.

**[SHOW]** `src/lib/booking.ts` (the `cancelAppointment` + `rescheduleAppointment` functions) and `src/lib/waitlist.ts`.

**[SAY]**
> "Here's the part the no-code builds fake or skip. When a client cancels, two things happen. One: the appointment is cancelled and they get a text. Two: I look at the waitlist for that service, find the person who's been waiting longest whose dates cover the freed slot, and text them automatically. The hole in the calendar fills itself."

**[DEMO]** The hero demo. Reseed first (`bun run seed`). Then either on a real Vapi call OR via `bun run simulate`:
- Sarah cancels her Botox.
- Show the response: `cancelled: true, waitlistNotified: "Maria Lopez"`.
- Show BOTH texts in the console: Sarah's cancellation, and Maria's "a Botox slot just opened" alert.

**[SAY]**
> "Sarah cancelled. Maria, who was waiting, just got texted the open slot. The spa didn't lose the revenue, and nobody lifted a finger. That's the whole pitch in ten seconds."

---

## 6. WHAT IT COSTS / WHAT YOU CHARGE (10:30 - 12:00)

**[SHOW]** Simple on-screen math (Miro pricing panel).

**[SAY]** Use the honest numbers.
> "Real talk on money. Vapi's base is about 5 cents a minute; all-in with the voice and AI you're around 15 to 30 cents a minute. A typical spa does maybe 300 minutes of calls a month, so your cost is roughly 75 bucks. You charge the spa 2,000 a month. That's the build. The reason they say yes: responding to a lead in 5 minutes instead of 30 makes you 21 times more likely to actually book them. That's not my stat, that's the MIT lead-response study. One saved Botox booking a week more than pays for it."

**[SHOW]** Caption: *Example math. Your costs vary.* (Keep it honest.)

---

## 7. CTA + CLOSE (12:00 - end)

**[SAY]**
> "Full code's free, link in the description, it's a public repo. If you run a med spa, or you build for businesses and want to deploy this, the call link is below. And tell me what vertical I should do next, dental, law firms, home services."

**[SHOW]** GitHub repo URL + the book-a-call link.

> **CTA priority:** book-a-call first (this is a services-conversion video). Free repo second.

---

## Pre-record checklist

- [ ] `bun run seed` for a clean demo (Sarah has tomorrow's Botox, Maria is waitlisted).
- [ ] Real Vapi number wired (`/vapi/webhook` + `x-vapi-secret`) for the cold-open + hero call.
- [ ] Phone with a number that's in the DB (so personalization fires on camera).
- [ ] Twilio keys set if you want real texts on screen (otherwise show the console log-only output).
- [ ] Say "Vapi", "Neon", "Prisma", "Twilio" slowly and add on-screen labels (caption fix from the channel review).
- [ ] The reschedule/cancel + waitlist text MUST happen live. That's the video.
- [ ] Read your auto-captions before publishing.

## Stat sources (for accuracy)

- Speed-to-lead 21x / 100x: MIT Lead Response Management study (Oldroyd / InsideSales), via HBR 2011.
- Vapi pricing ~$0.05/min base: vapi.ai/pricing.
- Med spa booking value / LTV: present as example math, not census.
- Do NOT use the "62% of calls unanswered" stat — it's a 2016 study.
