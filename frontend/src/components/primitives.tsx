import type { ReactNode } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`relative rounded-[14px] border border-line bg-surface shadow-[0_1px_2px_rgba(33,29,24,0.04),0_12px_30px_-18px_rgba(33,29,24,0.18)] ${className}`}
    >
      {children}
    </div>
  );
}

export function SectionTitle({ kicker, count }: { kicker: string; count?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between">
      <h2 className="font-body text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">{kicker}</h2>
      {count !== undefined && <span className="font-body text-[11px] tracking-wide text-muted">{count}</span>}
    </div>
  );
}

export function Avatar({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-clay-soft font-display text-[15px] font-medium text-clay-deep">
      {initials}
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  WAITING: 'bg-porcelain-deep text-ink-soft',
  NOTIFIED: 'bg-gold-soft text-gold',
  CONVERTED: 'bg-clay-soft text-clay-deep',
  EXPIRED: 'bg-porcelain-deep text-muted',
};

export function StatusPill({ status }: { status: string }) {
  const label = status === 'NOTIFIED' ? 'Texted' : status.charAt(0) + status.slice(1).toLowerCase();
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${STATUS_STYLES[status] ?? 'bg-porcelain-deep text-muted'}`}
    >
      {label}
    </span>
  );
}
