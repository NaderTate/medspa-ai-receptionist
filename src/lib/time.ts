// Small date/time helpers. We keep everything in the server's local time and
// store plain Date objects — no timezone library, to stay easy to follow.

import { SPA } from '../config.js';

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

// The first moment of the next day. Used as an exclusive upper bound for
// "everything on this day" — DST-safe because it steps the calendar date
// rather than adding a fixed 24 hours.
export function nextDayStart(date: Date): Date {
  const d = startOfDay(date);
  d.setDate(d.getDate() + 1);
  return d;
}

// The spa's open/close window for a given day, as concrete Date objects.
// Returns null if the spa is closed that day.
export function openingWindow(day: Date): { open: Date; close: Date } | null {
  const hours = SPA.hours[day.getDay()];
  if (!hours) return null;
  const open = startOfDay(day);
  open.setHours(hours.open, 0, 0, 0);
  const close = startOfDay(day);
  close.setHours(hours.close, 0, 0, 0);
  return { open, close };
}

// Two time ranges overlap if each starts before the other ends.
export function rangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

// Friendly label for speech + SMS, e.g. "Thursday, May 29 at 2:30 PM".
export function humanTime(date: Date): string {
  return date.toLocaleString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// Parse an ISO date or datetime string the voice agent passes us. Throws on
// garbage so the caller can return a clear error instead of booking at an
// invalid time.
export function parseDateTime(value: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Could not understand the date/time "${value}". Use an ISO datetime like 2026-05-29T14:30.`);
  }
  return parsed;
}
