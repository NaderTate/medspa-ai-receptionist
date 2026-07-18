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
