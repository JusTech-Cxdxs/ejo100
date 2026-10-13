import Link from 'next/link';
import { requireCustomer } from '@/lib/customer-portal/session';
import { loadServices } from '@/lib/customer-portal/data';
import { EmptyState, PageHero } from '@/components/customer/ui';
import { ServiceCard } from '@/components/customer/ServiceCard';

export const metadata = { title: 'My services' };

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
] as const;
type FilterKey = (typeof FILTERS)[number]['key'];

/** Job Cards and Vehicle Services together, newest first, with filters. */
export default async function ServicesPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const me = await requireCustomer();
  const items = await loadServices(me.id);
  const sp = await searchParams;
  const show: FilterKey = (FILTERS.map((f) => f.key) as string[]).includes(sp.show ?? '') ? (sp.show as FilterKey) : 'all';
  const counts: Record<FilterKey, number> = {
    all: items.length,
    active: items.filter((i) => i.phase === 'active').length,
    completed: items.filter((i) => i.phase === 'completed').length,
    cancelled: items.filter((i) => i.phase === 'cancelled').length,
  };
  const list = show === 'all' ? items : items.filter((i) => i.phase === show);

  return (
    <div className="space-y-6">
      <PageHero eyebrow="My services" icon="wrench" title="Every visit, every step" subtitle="Your Job Cards (repairs) and vehicle services in one place. Open any of them to see its full timeline, estimate and payments." />

      <nav aria-label="Filter services">
        {/* Two by two on a phone so every filter is in view; one row from tablet up. */}
        <ul className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {FILTERS.map((f) => {
            const on = f.key === show;
            return (
              <li key={f.key}>
                <Link
                  href={f.key === 'all' ? '/customer-portal/dashboard/services' : `/customer-portal/dashboard/services?show=${f.key}`}
                  aria-current={on ? 'page' : undefined}
                  className={`flex min-h-11 items-center justify-between gap-2 rounded-full border px-4 py-2 text-sm sm:inline-flex sm:justify-start font-medium transition-colors ${on ? 'border-[var(--ejo-primary)] bg-[var(--ejo-primary)] text-white shadow-sm' : 'border-[var(--ejo-border)] bg-[var(--ejo-bg)] text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]'}`}
                >
                  {f.label}
                  <span className={`rounded-full px-1.5 text-xs ${on ? 'bg-white/20' : 'bg-[var(--ejo-surface)]'}`}>{counts[f.key]}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {list.length ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {list.map((i, idx) => <ServiceCard key={`${i.kind}-${i.id}`} item={i} delay={Math.min(idx, 10) * 40} />)}
        </div>
      ) : (
        <EmptyState
          icon="wrench"
          title={show === 'all' ? 'No visits yet' : `No ${show} visits`}
          text={show === 'all' ? 'Your Job Cards and services will appear here from your first visit to the workshop.' : 'Try another filter to see the rest of your history.'}
        />
      )}
    </div>
  );
}
