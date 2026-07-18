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

  it('invokes fallback at most once when the deadline fires and the primary later rejects', async () => {
    let calls = 0;
    const latePrimary = new Promise<string>((_, reject) => setTimeout(() => reject(new Error('late failure')), 50));
    const result = await raceWithFallback(latePrimary, 10, () => {
      calls++;
      return 'fallback';
    });
    expect(result).toBe('fallback');
    await new Promise((resolve) => setTimeout(resolve, 60)); // let the late rejection land
    expect(calls).toBe(1);
  });

  it('rejects instead of hanging when fallback itself throws on the timeout path', async () => {
    const never = new Promise<string>(() => {});
    await expect(
      raceWithFallback(never, 10, (): string => {
        throw new Error('fallback exploded');
      }),
    ).rejects.toThrow('fallback exploded');
  });
});
