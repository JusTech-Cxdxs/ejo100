import { allows, guardAnyPage } from '@/lib/authz/server';
import { listProductWarranties, listProductWarrantyPolicyOptions, getProductWarrantyBySerial } from '@/lib/actions/product-warranty';
import { searchServiceCustomerOptions } from '@/lib/actions/service';
import { registerProductWarrantyFormAction } from '@/lib/actions/product-warranty-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { LiveSearchInput } from '@/components/LiveSearchInput';
import { CustomerLink } from '@/components/CustomerLink';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { SearchableSelect } from '@/components/SearchableSelect';
import { CoverageChip } from '@/components/service/CoverageChip';
import { PageHeader, RevealPanel, ResponsiveTable, EmptyState, StatusChip } from '@/components/ui';
import { formatDateOnly } from '@/lib/utils/format-date';

const input = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';
const lbl = 'block text-xs font-medium text-[var(--ejo-text-muted)]';

/** Product warranties by serial: the register, what is ending soon, and the form to register a unit under its policy. */
export default async function ProductWarrantiesPage({ searchParams }: { searchParams: Promise<{ q?: string; expiring?: string; serial?: string; status?: string; number?: string; error?: string }> }) {
  await guardAnyPage(['service.view', 'warranty.view'], '/service');
  const { q, expiring, serial, status, number, error } = await searchParams;
  const canRegister = await allows('warranty.manage');
  const [warranties, policies, look, canSeeCustomers] = await Promise.all([
    listProductWarranties({ q, expiring: expiring === '1' }),
    canRegister ? listProductWarrantyPolicyOptions() : Promise.resolve([]),
    serial && canRegister ? getProductWarrantyBySerial(serial) : Promise.resolve(null),
    allows('crm.view'),
  ]);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
  return (
    <div className="p-8">
      <PageHeader
        icon="shield"
        back={{ href: '/service', label: 'Back to Service Centre' }}
        title="Product warranties"
        description="Every serial under warranty: registered the day it is sold (or activated by the customer or dealer on the portal) under the product's policy. Policies are managed under Warranty › Policies."
      />
      {status === 'registered' ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="success" message={`Warranty ${number ?? ''} registered — it covers the unit from today's date on the certificate.`} /></div> : null}
      {error ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="error" message={error} /></div> : null}

      {canRegister ? (
        <RevealPanel label="Register a warranty by serial" icon="shield-check" open={Boolean(error) || Boolean(serial)} className="mb-6 max-w-3xl">
          <form action="/service/warranties" className="mb-4 flex flex-wrap gap-2">
            <input name="serial" defaultValue={serial ?? ''} placeholder="Serial number" required className={`${input} max-w-xs`} aria-label="Serial number to look up" />
            <button type="submit" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]">Look up</button>
          </form>
          {look ? (
            look.found ? (
              <div className="mb-4 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] p-3 text-sm">
                <p className="text-[var(--ejo-text)]"><span className="font-medium">{look.productName}</span> · serial {look.serialNumber} · {look.customerName ? `sold to ${look.customerName}` : 'no customer on record yet'}</p>
                <p className="mt-1"><CoverageChip coverage={look.coverage} /></p>
              </div>
            ) : <p className="mb-4 text-sm text-[var(--ejo-warning)]">{look.serialNumber} is not in the system. Only units the platform knows (built here or received into finished goods) can carry a warranty.</p>
          ) : null}
          {look?.found && !look.coverage.covered && look.coverage.state !== 'PENDING_VERIFICATION' ? (
            <form action={registerProductWarrantyFormAction} className="grid gap-3 sm:grid-cols-2">
              <FormPendingOverlay />
              <input type="hidden" name="serialNumber" value={look.serialNumber} />
              <div>
                <label className={lbl} htmlFor="policyId">Policy</label>
                <select id="policyId" name="policyId" defaultValue="" className={`${input} mt-1`}>
                  <option value="">Product&apos;s default policy (or the first active product policy)</option>
                  {policies.map((p) => <option key={p.value} value={p.value}>{p.label} — {p.sublabel}</option>)}
                </select>
              </div>
              <div><label className={lbl} htmlFor="startsAt">Starts on</label><input id="startsAt" name="startsAt" type="date" max={today} className={`${input} mt-1`} /><p className="mt-1 text-xs text-[var(--ejo-text-muted)]">Leave empty to use the sale date (or today).</p></div>
              {!look.customerName ? (
                <div className="sm:col-span-2"><label className={lbl} htmlFor="customerId">Customer the unit was sold to</label><div className="mt-1"><SearchableSelect id="customerId" name="customerId" required search={searchServiceCustomerOptions} placeholder="Search customers…" /></div></div>
              ) : null}
              <div className="sm:col-span-2"><label className={lbl} htmlFor="evidenceNote">Evidence (invoice or delivery note)</label><input id="evidenceNote" name="evidenceNote" className={`${input} mt-1`} placeholder="e.g. INV-2026-000123 of 4 March 2026" /></div>
              <div className="sm:col-span-2"><SubmitButton label="Register warranty" pendingLabel="Registering…" className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90" /></div>
            </form>
          ) : look?.found ? <p className="text-sm text-[var(--ejo-text-muted)]">This unit already holds a product warranty.</p> : null}
          {policies.length === 0 ? <p className="mt-3 text-xs text-[var(--ejo-warning)]">No active product policy yet — <LoadingLink href="/warranty/policies" className="text-[var(--ejo-primary)] hover:underline">create one</LoadingLink> (kind: Product) before registering.</p> : null}
        </RevealPanel>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-2">
        <LoadingLink href={`/service/warranties${q ? `?q=${encodeURIComponent(q)}` : ''}`} className={`rounded-full px-3 py-1 text-xs font-medium ${expiring !== '1' ? 'bg-[var(--ejo-primary)] text-white' : 'border border-[var(--ejo-border)] text-[var(--ejo-text)]'}`}>All</LoadingLink>
        <LoadingLink href={`/service/warranties?expiring=1${q ? `&q=${encodeURIComponent(q)}` : ''}`} className={`rounded-full px-3 py-1 text-xs font-medium ${expiring === '1' ? 'bg-[var(--ejo-primary)] text-white' : 'border border-[var(--ejo-border)] text-[var(--ejo-text)]'}`}>Ending within 30 days</LoadingLink>
      </div>
      <form className="mb-4 flex gap-2" action="/service/warranties">
        {expiring ? <input type="hidden" name="expiring" value={expiring} /> : null}
        <LiveSearchInput type="search" name="q" defaultValue={q ?? ''} placeholder="Search by warranty number, serial, product or customer…" className="w-full max-w-md rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]" />
        <button type="submit" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]">Search</button>
      </form>

      {warranties.length === 0 ? (
        <EmptyState icon="shield" title="No product warranties in this view">Register a unit by serial above, or let customers activate theirs on the portal.</EmptyState>
      ) : (
        <ResponsiveTable className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--ejo-border)] bg-[var(--ejo-bg)] text-left text-xs text-[var(--ejo-text-muted)]">
                <th className="px-3 py-2">Warranty</th><th className="px-3 py-2">Unit</th><th className="px-3 py-2">Customer</th><th className="px-3 py-2">Policy</th><th className="px-3 py-2">Cover</th><th className="px-3 py-2">Today</th>
              </tr>
            </thead>
            <tbody>
              {warranties.map((w) => (
                <tr key={w.id} className="border-b border-[var(--ejo-border)] align-top last:border-0">
                  <td className="px-3 py-2"><LoadingLink href={`/warranty/${w.id}`} className="font-medium text-[var(--ejo-primary)] hover:underline">{w.warrantyNumber}</LoadingLink><div className="text-xs text-[var(--ejo-text-muted)]">{w.origin === 'PORTAL' ? 'Activated on the portal' : 'Registered by staff'}{w._count.claims ? ` · ${w._count.claims} ${w._count.claims === 1 ? 'claim' : 'claims'}` : ''}</div></td>
                  <td data-label="Unit" className="px-3 py-2 text-[var(--ejo-text)]">{w.finishedUnit?.product.name ?? w.subjectDescription}<div className="text-xs text-[var(--ejo-text-muted)]">{w.finishedUnit?.serialNumber ?? ''}</div></td>
                  <td data-label="Customer" className="px-3 py-2 text-xs"><CustomerLink id={w.customer.id} name={w.customer.fullName} canView={canSeeCustomers} /></td>
                  <td data-label="Policy" className="px-3 py-2 text-xs text-[var(--ejo-text)]">{w.policy.name}</td>
                  <td data-label="Cover" className="px-3 py-2 text-xs text-[var(--ejo-text-muted)]">{formatDateOnly(w.startsAt)} – {formatDateOnly(w.endsAt)}</td>
                  <td data-label="Today" className="px-3 py-2">{w.status === 'ACTIVE' ? <CoverageChip coverage={w.coverage} compact /> : <StatusChip status={w.status} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ResponsiveTable>
      )}
    </div>
  );
}
