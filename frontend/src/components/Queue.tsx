import { Card, SectionTitle, StatusPill } from './primitives';
import type { QueueRow } from '../api';
import { dateRange } from '../format';

export function Queue({ rows }: { rows: QueueRow[] }) {
  return (
    <Card className="overflow-hidden p-6">
      {/* A gold hairline at the top quietly marks this as the high-value panel. */}
      <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-gold/0 via-gold to-gold/0" />
      <SectionTitle kicker="Waitlist queue" count={`${rows.length} waiting`} />
      <p className="mt-2 font-body text-[13px] leading-relaxed text-muted">
        When an appointment cancels, the next match here is texted the open slot automatically.
      </p>

      {rows.length === 0 ? (
        <p className="py-6 text-center font-body text-sm text-muted">No one in the queue right now.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="rounded-[10px] border border-line bg-porcelain/40 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="truncate font-body text-[15px] font-semibold text-ink">{r.customerName}</p>
                <StatusPill status={r.status} />
              </div>
              <p className="mt-1 font-body text-[13px] text-muted">
                {r.serviceName} · {dateRange(r.earliestDate, r.latestDate)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
