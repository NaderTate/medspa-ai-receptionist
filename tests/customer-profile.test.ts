import { describe, expect, it } from 'bun:test';

process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
const { splitProfileAppointments } = await import('../src/lib/customers.js');

const at = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

describe('splitProfileAppointments', () => {
  it('separates future booked visits from the last three completed ones', () => {
    // Ordered ascending by startTime, matching the customerProfile query.
    const rows = [
      { status: 'COMPLETED', startTime: at(-40) },
      { status: 'COMPLETED', startTime: at(-30) },
      { status: 'COMPLETED', startTime: at(-20) },
      { status: 'COMPLETED', startTime: at(-10) },
      { status: 'BOOKED', startTime: at(-1) }, // stale BOOKED in the past — not "upcoming"
      { status: 'BOOKED', startTime: at(1) },
      { status: 'CANCELLED', startTime: at(2) }, // cancelled — never shown
    ];
    const { upcoming, past } = splitProfileAppointments(rows);

    expect(upcoming).toEqual([rows[5]!]);
    expect(past).toHaveLength(3);
    expect(past[0]).toBe(rows[3]!); // most recent completed first
    expect(past[1]).toBe(rows[2]!);
    expect(past[2]).toBe(rows[1]!);
  });

  it('handles a customer with no history', () => {
    const { upcoming, past } = splitProfileAppointments([]);
    expect(upcoming).toEqual([]);
    expect(past).toEqual([]);
  });
});
