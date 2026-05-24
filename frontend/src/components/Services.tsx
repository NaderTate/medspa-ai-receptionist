import { Card, SectionTitle } from './primitives';
import type { ServiceRow } from '../api';
import { money } from '../format';

export function Services({ services }: { services: ServiceRow[] }) {
  return (
    <Card className="p-6">
      <SectionTitle kicker="Service menu" count={`${services.length} treatments`} />
      <ul className="mt-3 space-y-3.5">
        {services.map((s) => (
          <li key={s.id} className="flex items-baseline gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="font-display text-lg text-ink">{s.name}</span>
                {/* dotted leader between name and price, menu-style */}
                <span className="mx-1 h-px flex-1 translate-y-[-3px] border-b border-dotted border-line" />
                <span className="font-body text-[14px] font-medium text-clay-deep tnum">{money(s.priceCents)}</span>
              </div>
              <p className="font-body text-[12px] text-muted">
                {s.description} · {s.durationMinutes} min
              </p>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
