import Link from 'next/link';
import { guardPage } from '@/lib/authz/server';
import { listKits } from '@/lib/actions/plant-kits';
import { PageHeader, SectionCard } from '@/components/ui';
import { LiveSearchInput } from '@/components/LiveSearchInput';
import { ExportAction } from '@/components/ExportAction';
import { KitList } from '@/components/plant/KitList';
import { KIT_STATUS_WORDS, type KitStatus } from '@/lib/plant/kits';

export const dynamic = 'force-dynamic';

const FILTERS: [string, string][] = [['', 'Every kit'], ['SUBMITTED', KIT_STATUS_WORDS.SUBMITTED], ['ON_HOLD', KIT_STATUS_WORDS.ON_HOLD], ['INSPECTING', KIT_STATUS_WORDS.INSPECTING], ['ARRIVED', KIT_STATUS_WORDS.ARRIVED], ['issues', 'With open shortages or damage'], ['RELEASED', KIT_STATUS_WORDS.RELEASED], ['REJECTED', KIT_STATUS_WORDS.REJECTED], ['CANCELLED', KIT_STATUS_WORDS.CANCELLED]];

/** Every kit: search by VIN, kit or lot number, engine number or model; filter by where it is. */
export default async function KitsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  await guardPage('plant.view', '/plant/kits');
  const sp = await searchParams;
  const status = FILTERS.some(([k]) => k && k === sp.status) ? sp.status : undefined;
  const rows = await listKits(sp.q, status);
  const href = (st: string) => { const p = new URLSearchParams(); if (st) p.set('status', st); if (sp.q) p.set('q', sp.q); const s = p.toString(); return `/plant/kits${s ? `?${s}` : ''}`; };
  return (
    <div className="w-full space-y-6 p-4 sm:p-8">
      <PageHeader icon="boxes" back={{ href: '/plant', label: 'Back to the plant' }} title="Kits" description="Every vehicle as it arrived: checked against its packing list, then released to the line." actions={<span className="flex flex-wrap gap-2"><ExportAction kind="plant-kits" params={sp} /><ExportAction kind="plant-kit-issues" label="Export shortages" params={status === 'issues' ? { status: 'issues' } : {}} /></span>} />
      <form className="flex flex-wrap gap-2" action="/plant/kits">
        {status ? <input type="hidden" name="status" value={status} /> : null}
        <LiveSearchInput name="q" defaultValue={sp.q ?? ''} placeholder="VIN, kit, lot, engine number, model, shipment…" className="w-full max-w-md rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]" />
      </form>
      <nav aria-label="Status" className="flex flex-wrap gap-2 text-xs">
        {FILTERS.map(([k, l]) => <Link key={k || 'all'} href={href(k)} aria-current={(status ?? '') === k ? 'page' : undefined} className={`rounded-full px-3 py-1 font-medium ${(status ?? '') === k ? 'bg-[var(--ejo-primary)] text-white' : 'border border-[var(--ejo-border)] text-[var(--ejo-text)]'}`}>{l}</Link>)}
      </nav>
      <SectionCard icon="boxes" title={`${rows.length} ${rows.length === 1 ? 'kit' : 'kits'}${status && status !== 'issues' ? ` · ${KIT_STATUS_WORDS[status as KitStatus]}` : ''}`} flush>
        <KitList rows={rows} empty="No kit matches." showShipment />
      </SectionCard>
    </div>
  );
}
