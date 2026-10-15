import { getPrincipal, guardPage, myOrganisationId, reachWhere } from '@/lib/authz/server';
import { reorderList } from '@/lib/enyo/ml/models';
import { getEnyoSettings } from '@/lib/enyo/settings';
import { PageHeader, SectionCard, EmptyState } from '@/components/ui';
import { formatDateOnly } from '@/lib/utils/format-date';
import { pluralizeWord } from '@/lib/utils/pluralize';

export const dynamic = 'force-dynamic';

const METHOD: Record<string, string> = { croston_sba: 'Intermittent demand (Croston)', ses: 'Smoothed weekly use', moving_average: '12-week average' };
const qty = (n: number) => n.toLocaleString('en-NG', { maximumFractionDigits: 2 });

/**
 * Parts reorder suggestions from Enyo's demand model: parts at or below a
 * reorder point worked out from real weekly use, and how many to order to
 * cover four more weeks. Store staff raise the order themselves; nothing is
 * ordered or changed here. Within the person's own branches.
 */
export default async function ReorderSuggestionsPage() {
  await guardPage('analytics.inventory.view', '/inventory/reorder');
  const p = await getPrincipal();
  const orgId = p.organisationId ?? (await myOrganisationId());
  const reach = await reachWhere('analytics.inventory.view');
  const b = reach.branchId;
  const branchIds = b === undefined ? null : typeof b === 'string' ? [b] : b.in;
  const [settings, list] = await Promise.all([getEnyoSettings(orgId), reorderList(orgId, branchIds)]);

  return (
    <div className="w-full p-4 sm:p-8">
      <PageHeader
        icon="cart"
        eyebrow={`Inventory · ${settings.displayName}`}
        title="Reorder suggestions"
        description={<>Parts at or below the reorder point {settings.displayName} worked out from how fast each part is really used (two weeks&rsquo; lead time, about 95% of lead times covered). You decide and raise the order.</>}
        back={{ href: '/inventory/analytics', label: 'Inventory analytics' }}
      />
      <SectionCard
        icon="package"
        title={list.rows.length ? `${list.rows.length} ${pluralizeWord(list.rows.length, 'part')} to reorder` : 'Reorder suggestions'}
        description={list.asOf ? `Use counted up to the week of ${formatDateOnly(new Date(`${list.asOf}T12:00:00Z`))}. Model ${list.version}.` : undefined}
        flush={list.rows.length > 0}
      >
        {list.level === 'OFF' || !list.version ? (
          <EmptyState icon="sparkles" title="Not switched on">
            {list.level === 'OFF' ? 'Reorder suggestions are switched off.' : 'There is no demand model in use yet.'} An administrator manages this on the {settings.displayName} models page.
          </EmptyState>
        ) : list.rows.length === 0 ? (
          <EmptyState icon="check-circle" title="Nothing to reorder">Every forecast part in your branches is above its reorder point.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-[var(--ejo-border)] text-left text-xs text-[var(--ejo-text-muted)]">
                  <th className="px-4 py-2 font-medium">Part</th>
                  <th className="px-4 py-2 font-medium">Branch</th>
                  <th className="px-4 py-2 text-right font-medium">Available</th>
                  <th className="px-4 py-2 text-right font-medium">Reorder point</th>
                  <th className="px-4 py-2 text-right font-medium">Next 4 weeks</th>
                  <th className="px-4 py-2 text-right font-medium">Suggested order</th>
                  <th className="px-4 py-2 font-medium">Based on</th>
                </tr>
              </thead>
              <tbody>
                {list.rows.map((r) => (
                  <tr key={r.partId} className="border-b border-[var(--ejo-border)] last:border-0">
                    <td className="px-4 py-2.5">
                      <a href={`/inventory/parts/${r.partId}`} className="font-medium text-[var(--ejo-primary)] hover:underline">{r.name}</a>
                      {r.partNumber ? <span className="block text-xs text-[var(--ejo-text-muted)]">{r.partNumber}</span> : null}
                    </td>
                    <td className="px-4 py-2.5 text-[var(--ejo-text)]">{r.branchName}</td>
                    <td className={`px-4 py-2.5 text-right tabular-nums ${r.onHand <= 0 ? 'font-semibold text-[var(--ejo-error)]' : 'text-[var(--ejo-text)]'}`}>{qty(r.onHand)} {pluralizeWord(r.onHand, r.unit)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[var(--ejo-text)]">{qty(r.reorderPoint)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[var(--ejo-text)]">{qty(r.forecast4w)}</td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-[var(--ejo-text)]">{qty(r.suggestedQuantity)}</td>
                    <td className="px-4 py-2.5 text-xs text-[var(--ejo-text-muted)]">{METHOD[r.method] ?? r.method}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
