import { Card } from './primitives';
import type { Dashboard } from '../api';
import { money } from '../format';

function Stat({ label, value, sub, accent }: { label: string; value: string; sub: string; accent?: 'clay' | 'gold' }) {
  const valueColor = accent === 'clay' ? 'text-clay-deep' : accent === 'gold' ? 'text-gold' : 'text-ink';
  return (
    <Card className="px-6 py-5">
      <p className="font-body text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">{label}</p>
      <p className={`mt-2 font-display text-5xl leading-none tnum ${valueColor}`}>{value}</p>
      <p className="mt-2 font-body text-[12px] text-muted">{sub}</p>
    </Card>
  );
}

export function StatRow({ stats }: { stats: Dashboard['stats'] }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <Stat label="Today" value={String(stats.todayCount)} sub="appointments booked" />
      <Stat label="This week" value={String(stats.weekCount)} sub="on the calendar" />
      <Stat label="Booked revenue" value={money(stats.revenueWeekCents)} sub="next 7 days" accent="clay" />
      <Stat label="Saved by waitlist" value={String(stats.waitlistSaves)} sub="cancellations re-filled" accent="gold" />
    </div>
  );
}
