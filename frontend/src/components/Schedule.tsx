import { Card, SectionTitle } from './primitives';
import type { Appointment } from '../api';
import { clockTime, dayLabel, money } from '../format';

function Row({ appt, showDay }: { appt: Appointment; showDay?: boolean }) {
  return (
    <li className="flex items-center gap-4 border-t border-line py-3.5 first:border-t-0">
      <div className="w-20 shrink-0 text-right">
        <p className="font-display text-xl leading-none text-ink tnum">{clockTime(appt.startTime)}</p>
        {showDay && <p className="mt-1 font-body text-[11px] uppercase tracking-wide text-muted">{dayLabel(appt.startTime)}</p>}
      </div>
      <div className="h-9 w-px shrink-0 bg-clay/30" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-body text-[15px] font-semibold text-ink">{appt.customerName}</p>
        <p className="truncate font-body text-[13px] text-muted">
          {appt.serviceName} · {appt.staffName}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="font-body text-[13px] font-medium text-ink-soft tnum">{money(appt.priceCents)}</p>
        <p className="font-body text-[11px] text-muted tnum">{appt.durationMinutes} min</p>
      </div>
    </li>
  );
}

export function Schedule({ today, upcoming }: { today: Appointment[]; upcoming: Appointment[] }) {
  return (
    <Card className="p-6">
      <SectionTitle kicker="Today's schedule" count={`${today.length} booked`} />
      {today.length === 0 ? (
        <p className="py-8 text-center font-body text-sm text-muted">Nothing booked today yet.</p>
      ) : (
        <ul className="mt-2">
          {today.map((a) => (
            <Row key={a.id} appt={a} />
          ))}
        </ul>
      )}

      {upcoming.length > 0 && (
        <div className="mt-7">
          <SectionTitle kicker="Coming up" count={`next ${upcoming.length}`} />
          <ul className="mt-2">
            {upcoming.map((a) => (
              <Row key={a.id} appt={a} showDay />
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
