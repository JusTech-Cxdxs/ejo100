import { LoadingLink } from '@/components/LoadingLink';

const sections = [
  { name: 'Parts Catalog', href: '/inventory/parts', desc: 'Every part the store stocks — tracking type, unit of measure, and current stock on hand.' },
  { name: 'Goods Receipts', href: '/inventory/goods-receipts', desc: 'A complete record of every delivery received into the store.' },
  { name: 'Part Categories & Types', href: '/inventory/part-types', desc: 'The generic classification technicians pick from when requesting Store Parts on an estimate.' },
  { name: 'Estimate Matching', href: '/inventory/estimate-matching', desc: 'Store Part lines awaiting a real, vehicle-fitting catalog Part and price.' },
];

/**
 * Inventory module landing page — Phase 1 of the Store system: the part
 * catalog and goods receipt. The Issue Slip workflow (requesting and
 * releasing stock to a Job Card) and External Procurement (cash-advance
 * sourcing) are their own later phases, not yet built.
 */
export default function InventoryPage() {
  return (
    <div className="p-8">
      <div className="mb-2 flex items-center gap-2">
        <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Inventory</h1>
        <span className="rounded-full bg-[var(--ejo-success)]/15 px-2.5 py-0.5 text-xs font-medium text-[var(--ejo-success)]">
          Live
        </span>
      </div>
      <p className="mb-8 text-sm text-[var(--ejo-text-muted)]">
        Kewalram Nigeria — Automobile Division — Lagos State — Isolo Branch — Store
      </p>

      <div className="grid gap-6 md:grid-cols-2">
        {sections.map((s) => (
          <LoadingLink
            key={s.href}
            href={s.href}
            className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6 transition-shadow hover:shadow-md"
          >
            <h3 className="font-semibold text-[var(--ejo-text)]">{s.name}</h3>
            <p className="mt-2 text-sm text-[var(--ejo-text-muted)]">{s.desc}</p>
          </LoadingLink>
        ))}
      </div>
    </div>
  );
}
