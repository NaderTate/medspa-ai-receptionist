import { Card } from './primitives';
import type { Appointment } from '../api';
import { clockTime, dayHeading, dayKey } from '../format';

// Group a flat, time-sorted list into [day -> appointments] so the agenda can
// scale to many days without becoming an undifferentiated wall of rows.
function groupByDay(appts: Appointment[]) {
  const groups = new Map<string, Appointment[]>();
  for (const a of appts) {
    const key = dayKey(a.startTime);
    const bucket = groups.get(key);
    if (bucket) bucket.push(a);
    else groups.set(key, [a]);
  }
  return [...groups.values()];
}

function Row({ appt }: { appt: Appointment }) {
  return (
    <li className="flex items-center gap-5 px-6 py-4 transition-colors hover:bg-porcelain/50">
      <div className="w-24 shrink-0">
        <p className="font-display text-2xl leading-none text-ink tnum">{clockTime(appt.startTime)}</p>
        <p className="mt-1 font-body text-[11px] uppercase tracking-wide text-muted tnum">{appt.durationMinutes} min</p>
      </div>
      <div className="h-10 w-px shrink-0 bg-clay/25" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-body text-[16px] font-semibold text-ink">{appt.customerName}</p>
        <p className="truncate font-body text-[13px] text-muted">{appt.serviceName}</p>
      </div>
      <div className="hidden shrink-0 text-right sm:block">
        <p className="font-body text-[13px] text-ink-soft">{appt.staffName}</p>
        <p className="font-body text-[11px] uppercase tracking-wide text-muted">provider</p>
      </div>
    </li>
  );
}

export function Appointments({ appointments }: { appointments: Appointment[] }) {
  const days = groupByDay(appointments);

  return (
    <Card className="overflow-hidden">
      <div className="flex items-baseline justify-between border-b border-line px-6 py-5">
        <h2 className="font-display text-2xl text-ink">Appointments</h2>
        <span className="font-body text-[11px] font-semibold uppercase tracking-[0.2em] text-muted tnum">
          {appointments.length} booked
        </span>
      </div>

      {appointments.length === 0 ? (
        <p className="px-6 py-16 text-center font-body text-sm text-muted">No appointments booked.</p>
      ) : (
        <div>
          {days.map((dayAppts) => {
            const head = dayHeading(dayAppts[0]!.startTime);
            return (
              <section key={dayKey(dayAppts[0]!.startTime)}>
                {/* Sticky day header keeps the current day visible while scrolling a long list. */}
                <div className="sticky top-0 z-10 flex items-baseline gap-2 border-b border-line bg-porcelain-deep/85 px-6 py-2.5 backdrop-blur">
                  <span className="font-body text-[12px] font-bold uppercase tracking-[0.18em] text-ink">{head.label}</span>
                  <span className="font-body text-[12px] tracking-wide text-muted">{head.sub}</span>
                  <span className="ml-auto font-body text-[11px] text-muted tnum">{dayAppts.length}</span>
                </div>
                <ul className="divide-y divide-line">
                  {dayAppts.map((a) => (
                    <Row key={a.id} appt={a} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </Card>
  );
}
