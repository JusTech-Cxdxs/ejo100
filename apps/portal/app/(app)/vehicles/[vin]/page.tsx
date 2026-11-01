import { notFound } from 'next/navigation';
import { guardAnyPage } from '@/lib/authz/server';
import { getVehiclePassport, type VehiclePassport } from '@/lib/actions/vehicle-passport';
import { LoadingLink } from '@/components/LoadingLink';
import { EmptyState, Icon, PageHeader, SectionCard, StatusChip } from '@/components/ui';
import { QrCode, Code128 } from '@/components/VehicleCodes';
import { portalBaseUrl } from '@/lib/portal-url';
import { vehicleScanPath } from '@/lib/vin';
import { referenceUrl } from '@/lib/search-plan';
import { formatDateOnly, formatDateTimeCompact } from '@/lib/utils/format-date';
import type { LifeStage } from '@/lib/vehicle-life';

export const dynamic = 'force-dynamic';

const TONE: Record<string, 'success' | 'error' | 'warning' | 'info' | 'neutral'> = { pass: 'success', fail: 'error', rework: 'warning', open: 'info', other: 'neutral' };
const STATE: Record<LifeStage['state'], { label: string; tone: 'success' | 'error' | 'info' | 'neutral' }> = {
  done: { label: 'Done', tone: 'success' },
  issue: { label: 'Needs attention', tone: 'error' },
  open: { label: 'In progress', tone: 'info' },
  none: { label: 'Nothing recorded', tone: 'neutral' },
};
const day = (s: string) => formatDateOnly(new Date(`${s}T12:00:00Z`));

/**
 * One vehicle, by its VIN: the page its label opens. Kit arrival and QC,
 * every station, QA, PDI, yard, sale and warranty start — then every Job
 * Card, Vehicle Service, warranty claim, road test and gate exit. Each part
 * only for those who may see it.
 */
export default async function VehiclePassportPage({ params }: { params: Promise<{ vin: string }> }) {
  const { vin: raw } = await params;
  await guardAnyPage(['workshop.view', 'warranty.view', 'security.view', 'crm.view'], `/vehicles/${raw}`);
  const p = await getVehiclePassport(decodeURIComponent(raw));
  if (!p) notFound();
  const scanUrl = `${portalBaseUrl().replace(/\/$/, '')}${vehicleScanPath(p.vin)}`;
  return (
    <div className="w-full space-y-6 p-4 sm:p-8">
      <PageHeader
        icon="car"
        back={{ href: '/workshop/vehicles', label: 'Back to Vehicles' }}
        eyebrow="Vehicle"
        title={p.vin}
        description={<>{p.description ?? 'Model not recorded yet'}{p.vehicle?.plate ? <> · plate <span className="font-medium text-[var(--ejo-text)]">{p.vehicle.plate}</span></> : null}{p.now ? <> · now at <span className="font-medium text-[var(--ejo-text)]">{p.now}</span></> : null}</>}
        actions={p.may.editVehicle && p.vehicle ? <LoadingLink href={`/workshop/vehicles/${p.vehicle.id}/edit`} className="inline-flex items-center gap-1.5 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:border-[var(--ejo-primary)]/60 hover:text-[var(--ejo-primary)]"><Icon name="wrench" size={16} />Workshop record</LoadingLink> : undefined}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,34rem)_minmax(0,1fr)]">
        <SectionCard icon="badge" title="Label" description="One label for the vehicle, tied to its VIN. Scan the QR code with a phone to open this page, or the barcode with a handheld scanner.">
          <div className="flex flex-col items-center gap-4 rounded-[var(--ejo-radius-md)] bg-white p-4">
            <QrCode value={scanUrl} size="10rem" label={`QR code: opens the page of vehicle ${p.vin}`} />
            <Code128 value={p.vin} moduleSize={2} height="3.5rem" label={`Barcode of the VIN ${p.vin}`} />
          </div>
          {p.labels.mayPrint ? (
            <ul className="mt-4 grid grid-cols-2 gap-2 text-sm">
              {([['vehicle-label', 'windscreen', 'Windscreen label'], ['vehicle-label', 'door-jamb', 'Door-jamb label'], ['vehicle-traveller', '', 'Traveller sheet'], ['pdi-certificate', '', 'PDI certificate']] as const).map(([path, size, label]) => (
                <li key={label}><a href={`/print/${path}/${encodeURIComponent(p.vin)}${size ? `?size=${size}` : ''}`} target="_blank" rel="noopener noreferrer" className="flex min-h-10 items-center gap-1.5 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-2 font-medium text-[var(--ejo-text)] hover:border-[var(--ejo-primary)]/60 hover:text-[var(--ejo-primary)]"><Icon name="printer" size={15} />{label}</a></li>
              ))}
            </ul>
          ) : <p className="mt-3 text-xs text-[var(--ejo-text-muted)]">Printing labels is for the people who label vehicles.</p>}
          <p className="mt-3 text-xs text-[var(--ejo-text-muted)]">{p.labels.printed ? `Label and papers printed ${p.labels.printed} ${p.labels.printed === 1 ? 'time' : 'times'}, last ${formatDateTimeCompact(p.labels.lastAt!)}. A reprint carries the same codes.` : 'Label and papers not printed yet.'}</p>
        </SectionCard>

        <SectionCard icon="car" title="The vehicle">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-[var(--ejo-text-muted)]">VIN</dt>
              <dd className="mt-0.5 font-mono font-medium tracking-wide text-[var(--ejo-text)]">{p.vin}</dd>
              {p.checkDigitOk === false ? <dd className="mt-0.5 text-xs text-[var(--ejo-text-muted)]">Its 9th character is not a North American check digit (most other markets do not use one). Compare with the chassis plate before printing a label.</dd> : null}
            </div>
            <Fact label="Model" value={p.description} />
            <Fact label="Plate" value={p.vehicle?.plate ?? null} mono />
            <Fact label="Engine number" value={p.vehicle?.engineNumber ?? null} mono />
            <Fact label="Mileage" value={p.vehicle?.mileage ? `${p.vehicle.mileage.toLocaleString('en-NG')} km` : null} />
            <div>
              <dt className="text-xs text-[var(--ejo-text-muted)]">Customer</dt>
              <dd className="mt-0.5 font-medium text-[var(--ejo-text)]">{p.vehicle?.customer ? <LoadingLink href={`/crm/customers/${p.vehicle.customer.id}`} className="text-[var(--ejo-primary)] hover:underline">{p.vehicle.customer.name}</LoadingLink> : p.vehicle ? (p.may.customers ? '—' : 'Sold (customer details are for the CRM)') : 'Not sold yet'}</dd>
            </div>
          </dl>
        </SectionCard>
      </div>

      <SectionCard icon="roadmap" title="From kit to customer" description="Every stage recorded for this VIN, oldest first. Plant stages come from the production, QC and PDI registers today; recording them on screen arrives with the PDI and assembly modules." flush>
        <ol className="divide-y divide-[var(--ejo-border)]">
          {p.stages.map((s, i) => (
            <li key={s.key} className="px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-semibold text-[var(--ejo-text)]"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--ejo-primary)]/10 text-xs text-[var(--ejo-primary)]">{i + 1}</span>{s.label}</span>
                <StatusChip tone={STATE[s.state].tone}>{STATE[s.state].label}</StatusChip>
              </div>
              {s.entries.length ? (
                <ul className="mt-2 space-y-1.5 pl-8 text-sm">
                  {s.entries.map((e) => (
                    <li key={e.id} className="flex flex-wrap items-baseline gap-x-2">
                      <span className="tabular-nums text-xs text-[var(--ejo-text-muted)]">{day(e.date)}</span>
                      {e.href ? <LoadingLink href={e.href} className="font-medium text-[var(--ejo-primary)] hover:underline">{e.stage}</LoadingLink> : <span className="font-medium text-[var(--ejo-text)]">{e.stage ?? '—'}</span>}
                      {e.result ? <StatusChip tone={TONE[e.tone ?? 'other']}>{e.result}</StatusChip> : null}
                      {[e.inspector, e.reference, e.notes].filter(Boolean).length ? <span className="text-xs text-[var(--ejo-text-muted)]">{[e.inspector, e.reference, e.notes].filter(Boolean).join(' · ')}</span> : null}
                    </li>
                  ))}
                </ul>
              ) : <p className="mt-1 pl-8 text-xs text-[var(--ejo-text-muted)]">{s.hint}: nothing recorded.</p>}
            </li>
          ))}
        </ol>
      </SectionCard>

      <AfterSale p={p} />
    </div>
  );
}

function Fact({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-[var(--ejo-text-muted)]">{label}</dt>
      <dd className={`mt-0.5 font-medium text-[var(--ejo-text)] ${mono ? 'font-mono tracking-wide' : ''}`}>{value ?? '—'}</dd>
    </div>
  );
}

function AfterSale({ p }: { p: VehiclePassport }) {
  const a = p.after;
  const lists: { title: string; icon: 'clipboard' | 'droplet' | 'shield-check' | 'file' | 'road' | 'exit'; rows: { id: string; number: string; href: string; when: Date; text: string }[] | null }[] = [
    { title: 'Job Cards', icon: 'clipboard', rows: a.jobCards?.map((r) => ({ id: r.id, number: r.number, href: referenceUrl('JC', r.id), when: r.at, text: [r.status, r.branch, r.summary].filter(Boolean).join(' · ') })) ?? null },
    { title: 'Vehicle Services', icon: 'droplet', rows: a.services?.map((r) => ({ id: r.id, number: r.number, href: referenceUrl('SV', r.id), when: r.at, text: [r.status, r.branch].join(' · ') })) ?? null },
    { title: 'Warranties', icon: 'shield-check', rows: a.warranties?.map((r) => ({ id: r.id, number: r.number, href: referenceUrl('WR', r.id), when: r.startsAt, text: `${r.kind} · ${r.subject} · ${r.status} · until ${formatDateOnly(r.endsAt)}` })) ?? null },
    { title: 'Warranty claims', icon: 'file', rows: a.claims?.map((r) => ({ id: r.id, number: r.number, href: referenceUrl('WC', r.id), when: r.at, text: `${r.status} · ${r.complaint}` })) ?? null },
    { title: 'Road tests', icon: 'road', rows: a.roadTests?.map((r) => ({ id: r.id, number: r.number, href: referenceUrl('RT', r.id), when: r.at, text: r.status })) ?? null },
    { title: 'Gate exits', icon: 'exit', rows: a.gateExits?.map((r) => ({ id: r.id, number: r.number, href: referenceUrl('VX', r.id), when: r.at, text: r.branch })) ?? null },
  ];
  const shown = lists.filter((l) => l.rows !== null);
  if (!shown.length) return null;
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      {shown.map((l) => (
        <SectionCard key={l.title} icon={l.icon} title={`${l.title}${l.rows!.length ? ` (${l.rows!.length})` : ''}`} flush>
          {l.rows!.length === 0 ? <div className="p-4"><EmptyState compact icon={l.icon} title={`No ${l.title.toLowerCase()} for this vehicle.`} /></div> : (
            <ul className="divide-y divide-[var(--ejo-border)]">
              {l.rows!.map((r) => (
                <li key={r.id} className="flex flex-wrap items-start justify-between gap-2 px-4 py-2.5 text-sm">
                  <span className="min-w-0"><LoadingLink href={r.href} className="font-mono font-medium text-[var(--ejo-primary)] hover:underline">{r.number}</LoadingLink><span className="block break-words text-xs text-[var(--ejo-text-muted)]">{r.text}</span></span>
                  <span className="shrink-0 text-xs tabular-nums text-[var(--ejo-text-muted)]">{formatDateOnly(r.when)}</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      ))}
    </div>
  );
}
