import { describe, expect, it, afterEach, spyOn } from 'bun:test';

process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
const { startDbKeepWarm } = await import('../src/lib/db.js');

describe('startDbKeepWarm', () => {
  let warnSpy: ReturnType<typeof spyOn>;

  afterEach(() => {
    warnSpy?.mockRestore();
  });

  it('pings immediately on start and can be stopped', () => {
    let pings = 0;
    const stop = startDbKeepWarm(60_000, async () => {
      pings++;
    });
    expect(pings).toBe(1);
    stop();
  });

  it('survives a failing ping without throwing', async () => {
    warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
    const stop = startDbKeepWarm(60_000, async () => {
      throw new Error('db down');
    });
    await Promise.resolve();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    stop();
  });
});
