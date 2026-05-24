import { Card, SectionTitle, Avatar } from './primitives';
import type { Client } from '../api';
import { dayLabel } from '../format';

export function Clients({ clients }: { clients: Client[] }) {
  return (
    <Card className="p-6">
      <SectionTitle kicker="Clients" count={`${clients.length} total`} />
      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
        {clients.map((c) => (
          <li key={c.id} className="flex items-start gap-3 rounded-[10px] border border-line px-4 py-3">
            <Avatar name={c.fullName} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate font-body text-[15px] font-semibold text-ink">{c.fullName}</p>
                <span className="shrink-0 font-body text-[11px] tracking-wide text-muted tnum">
                  {c.visitCount} {c.visitCount === 1 ? 'visit' : 'visits'}
                </span>
              </div>
              <p className="font-body text-[12px] text-muted tnum">{c.phone}</p>
              {c.lastVisitService && c.lastVisitDate ? (
                <p className="mt-1 font-body text-[12px] text-muted">
                  Last: {c.lastVisitService} · {dayLabel(c.lastVisitDate)}
                </p>
              ) : (
                <p className="mt-1 font-body text-[12px] italic text-muted">New client</p>
              )}
              {c.notes && <p className="mt-1 truncate font-body text-[12px] text-clay/80">{c.notes}</p>}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
