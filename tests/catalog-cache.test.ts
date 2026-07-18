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
