// Business configuration in one place. Change these to fit a real spa.

export const SPA = {
  name: 'Lumière Med Spa',
  timeZoneLabel: 'local time', // we store/compare everything in the server's local time for simplicity
  // Opening hours per weekday (0 = Sunday ... 6 = Saturday). null = closed that day.
  hours: {
    0: null, // Sunday: closed
    1: { open: 9, close: 18 }, // Monday
    2: { open: 9, close: 18 },
    3: { open: 9, close: 18 },
    4: { open: 9, close: 20 }, // Thursday: late night
    5: { open: 9, close: 18 },
    6: { open: 10, close: 16 }, // Saturday: shorter
  } as Record<number, { open: number; close: number } | null>,
  // We offer appointment start times on this minute grid (e.g. 9:00, 9:15, ...).
  slotStepMinutes: 15,
};

// If VAPI_SECRET is blank the webhook skips the header check (handy for local
// testing). ALWAYS set it in production so only Vapi can hit your endpoints.
export const VAPI_SECRET = process.env.VAPI_SECRET ?? '';
export const PORT = Number(process.env.PORT ?? 3000);
