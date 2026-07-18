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
