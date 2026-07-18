// Deadline helper for hard-realtime webhook paths. Vapi gives assistant-request
// a fixed 7.5s end-to-end budget; instead of ever missing it (which fails the
// call at pickup), we answer with a degraded-but-valid fallback.

// Guarantees:
//  - fallback() runs at most once, even if the deadline fires and the primary
//    later rejects (side effects must not double-run).
//  - a throwing fallback() rejects the returned promise instead of hanging it.

export async function raceWithFallback<T>(primary: Promise<T>, deadlineMs: number, fallback: () => T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let memo: { value: T } | undefined;
  const runFallbackOnce = (): T => {
    if (!memo) memo = { value: fallback() };
    return memo.value;
  };
  const deadline = new Promise<T>((resolve, reject) => {
    timer = setTimeout(() => {
      try {
        resolve(runFallbackOnce());
      } catch (err) {
        reject(err);
      }
    }, deadlineMs);
  });
  try {
    return await Promise.race([primary.catch(() => runFallbackOnce()), deadline]);
  } finally {
    clearTimeout(timer);
  }
}
