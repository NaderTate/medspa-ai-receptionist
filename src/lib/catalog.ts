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
