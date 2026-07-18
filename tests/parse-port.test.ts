import { describe, expect, it, spyOn } from 'bun:test';
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

  it('falls back to 3000 on garbage instead of NaN, and warns', () => {
    const warn = spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(parsePort('abc')).toBe(3000);
      expect(parsePort('0')).toBe(3000);
      expect(parsePort('70000')).toBe(3000);
      expect(warn).toHaveBeenCalledTimes(3);
    } finally {
      warn.mockRestore();
    }
  });
});
