import Link from 'next/link';
import type { ServiceItem } from '@/lib/customer-portal/data';
import { fmtDate, naira, timeAgo } from '@/lib/customer-portal/format';
import { Badge, Stepper } from './ui';
import { Icon } from './Icon';

/** One Job Card or service in a list — status, progress, money, next step. */
export function ServiceCard({ item, delay }: { item: ServiceItem; delay?: number }) {
  const owe = item.phase !== 'cancelled' && item.status !== 'ESCALATED' ? item.money.balance : null;
  return (
    <Link
      href={item.href}
      data-testid={`service-card-${item.number}`}
      className="ejo-rise ejo-lift group block rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] p-4 hover:border-[var(--ejo-primary)]/40 sm:p-5"
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)]">
          <Icon name={item.kind === 'jc' ? 'wrench' : 'calendarCheck'} size={19} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-sm font-semibold text-[var(--ejo-text)]">{item.number}</p>
            <span className="text-xs text-[var(--ejo-text-muted)]">{item.kind === 'jc' ? 'Job Card' : 'Vehicle service'}</span>
          </div>
          <p className="mt-0.5 truncate text-sm text-[var(--ejo-text-muted)]">{item.vehicle.label}{item.vehicle.plate ? ` · ${item.vehicle.plate}` : ''}</p>
        </div>
        <Badge tone={item.info.tone}>{item.info.label}</Badge>
      </div>

      {item.phase === 'active' ? (
        <div className="mt-4"><Stepper steps={item.steps} current={item.step} /></div>
      ) : null}

      <p className="mt-3 text-sm text-[var(--ejo-text)]">{item.info.explain}</p>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-[var(--ejo-border)] pt-3 text-xs text-[var(--ejo-text-muted)]">
        <span className="inline-flex items-center gap-1"><Icon name="calendar" size={13} /> {fmtDate(item.createdAt)}</span>
        {item.money.estimateTotal !== null ? <span className="inline-flex items-center gap-1"><Icon name="receipt" size={13} /> Estimate {naira(item.money.estimateTotal)}</span> : null}
        {owe !== null && owe > 0 ? <span className="inline-flex items-center gap-1 font-semibold text-[#b45309] dark:text-[var(--ejo-warning)]"><Icon name="wallet" size={13} /> {naira(owe)} to pay</span> : null}
        {owe === 0 && item.money.estimateTotal ? <span className="inline-flex items-center gap-1 font-medium text-[var(--ejo-success)]"><Icon name="checkCircle" size={13} /> Paid in full</span> : null}
        <span className="ml-auto inline-flex items-center gap-1 font-medium text-[var(--ejo-primary)]">Updated {timeAgo(item.lastUpdate)} <Icon name="chevronRight" size={14} /></span>
      </div>
    </Link>
  );
}
