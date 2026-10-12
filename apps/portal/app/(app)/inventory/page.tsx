import { allows, guardAnyPage } from '@/lib/authz/server';
import { STORE_COST_PERMISSIONS } from '@/lib/authz/catalogue';
import { OrgTrail } from '@/components/OrgTrail';
import { PageHeader, NavCard, type IconName } from '@/components/ui';

const sections: { name: string; href: string; desc: string; icon: IconName }[] = [
  { name: 'Parts Catalog', href: '/inventory/parts', icon: 'package', desc: 'Every part the store stocks — tracking type, unit of measure, and current stock on hand.' },
  { name: 'Goods Receipts', href: '/inventory/goods-receipts', icon: 'receipt', desc: 'A complete record of every delivery received into the store.' },
  { name: 'Part Categories & Types', href: '/inventory/part-types', icon: 'layers', desc: 'The generic classification technicians pick from when requesting Store Parts on an estimate.' },
  { name: 'Estimate Matching', href: '/inventory/estimate-matching', icon: 'match', desc: 'Store Part lines awaiting a real, vehicle-fitting catalog Part and price.' },
  { name: 'Inventory Analytics', href: '/inventory/analytics', icon: 'chart', desc: 'Stock health, reorder intelligence (suggested reorder points and safety stock), demand, ABC/XYZ, turnover and true profitability — with what to do next.' },
  { name: 'Pricing Command Center', href: '/inventory/pricing', icon: 'tag', desc: 'Every delivery cost auto-compared against a Part\'s own target margin — real alerts, real analysis, one-click price sync.' },
];

/**
 * Inventory module landing page — Phase 1 of the Store system: the part
 * catalog and goods receipt. The Issue Slip workflow (requesting and
 * releasing stock to a Job Card) and External Procurement (cash-advance
 * sourcing) are their own later phases, not yet built.
 */
export default async function InventoryPage() {
  await guardAnyPage(['store.view'], '/inventory');
  // Show only what this person may open (the same rule the pages enforce).
  const [canAnalytics, canSeeCosts] = await Promise.all([allows('analytics.inventory.view'), Promise.all(STORE_COST_PERMISSIONS.map((k) => allows(k))).then((xs) => xs.some(Boolean))]);
  const COSTS = ['/inventory/goods-receipts', '/inventory/pricing'];
  const visible = sections.filter((s) => (s.href !== '/inventory/analytics' || canAnalytics) && (!COSTS.includes(s.href) || canSeeCosts));
  return (
    <div className="w-full p-4 sm:p-8">
      <PageHeader
        hero
        live
        icon="boxes"
        eyebrow="Module · Store"
        title="Inventory"
        description={<>The store: what is on the shelf, what came in, what it costs and what to reorder. <span className="block text-xs"><OrgTrail area="Store" /></span></>}
      />

      <div className="ejo-stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((s) => (
          <NavCard key={s.href} href={s.href} icon={s.icon} title={s.name} description={s.desc} />
        ))}
      </div>
    </div>
  );
}
