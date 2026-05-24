// Display formatting helpers, kept in one place.

function localMidnight(iso: string): Date {
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  return d;
}

export const clockTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

// A stable per-day key so we can group appointments by calendar day.
export const dayKey = (iso: string) => String(localMidnight(iso).getTime());

// "Today" / "Tomorrow" / weekday, plus a "May 28" sub-label, for day headers.
export function dayHeading(iso: string): { label: string; sub: string } {
  const day = localMidnight(iso).getTime();
  const today = localMidnight(new Date().toISOString()).getTime();
  const diff = Math.round((day - today) / 86_400_000);
  const label =
    diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : new Date(iso).toLocaleDateString('en-US', { weekday: 'long' });
  const sub = new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  return { label, sub };
}

export const dateRange = (a: string, b: string) => {
  const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(a)} – ${fmt(b)}`;
};
