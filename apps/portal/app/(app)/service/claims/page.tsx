import { allows, guardAnyPage } from '@/lib/authz/server';
import { listProductWarrantyClaims, getProductWarrantyBySerial } from '@/lib/actions/product-warranty';
import { logProductWarrantyClaimFormAction } from '@/lib/actions/product-warranty-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { LiveSearchInput } from '@/components/LiveSearchInput';
import { CustomerLink } from '@/components/CustomerLink';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { CoverageChip } from '@/components/service/CoverageChip';
import { RefineTextButton } from '@/components/enyo/RefineTextButton';
import { PageHeader, RevealPanel, ResponsiveTable, EmptyState, StatusChip } from '@/components/ui';
import { CLAIM_STATUS_LABEL, CUSTOMER_RESOLUTION_LABEL } from '@/lib/warranty-claim-status';
import { SERVICE_JOB_STATUS_LABEL, type ServiceJobStatus } from '@/lib/service-core';
import { formatDateOnly } from '@/lib/utils/format-date';

const input = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';
const lbl = 'block text-xs font-medium text-[var(--ejo-text-muted)]';

/** Product warranty claims: each one with its service job; log a claim for a covered serial (approval runs on the Warranty claim page). */
export default async function ProductClaimsPage({ searchParams }: { searchParams: Promise<{ q?: string; serial?: string; error?: string }> }) {
  await guardAnyPage(['service.view', 'warranty.view'], '/service');
  const { q, serial, error } = await searchParams;
  const canLog = await allows('warranty.manage');
  const [claims, look, canSeeCustomers] = await Promise.all([listProductWarrantyClaims({ q }), serial && canLog ? getProductWarrantyBySerial(serial) : Promise.resolve(null), allows('crm.view')]);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
  const open = claims.filter((c) => ['DRAFT', 'PENDING_HOD', 'PENDING_MANAGER', 'APPROVED_TO_SUBMIT', 'SUBMITTED'].includes(c.status)).length;
  return (
    <div className="p-8">
      <PageHeader
        icon="file"
        back={{ href: '/service', label: 'Back to Service Centre' }}
        title="Product warranty claims"
        description={<>Claims on units under product warranty. Logging one opens the service job that does the repair; the claim itself is approved by the Warranty Manager on its <LoadingLink href="/warranty/claims" className="text-[var(--ejo-primary)] hover:underline">Warranty claim</LoadingLink> page. {open} open.</>}
      />
      {error ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="error" message={error} /></div> : null}

      {canLog ? (
        <RevealPanel label="Log a claim" icon="plus" open={Boolean(error) || Boolean(serial)} className="mb-6 max-w-3xl">
          <form action="/service/claims" className="mb-4 flex flex-wrap gap-2">
            <input name="serial" defaultValue={serial ?? ''} placeholder="Serial number" required className={`${input} max-w-xs`} aria-label="Serial number to look up" />
            <button type="submit" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]">Look up</button>
          </form>
          {look ? (
            look.found ? (
              <div className="mb-4 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] p-3 text-sm">
                <p className="text-[var(--ejo-text)]"><span className="font-medium">{look.productName}</span> · serial {look.serialNumber}{look.customerName ? ` · ${look.customerName}` : ''}</p>
                <p className="mt-1"><CoverageChip coverage={look.coverage} /></p>
              </div>
            ) : <p className="mb-4 text-sm text-[var(--ejo-warning)]">{look.serialNumber} is not in the system, so it cannot carry a warranty claim. Open a <LoadingLink href={`/service/jobs/new?serial=${encodeURIComponent(look.serialNumber)}`} className="text-[var(--ejo-primary)] hover:underline">paid service job</LoadingLink> instead.</p>
          ) : null}
          {look?.found && look.coverage.covered ? (
            <form action={logProductWarrantyClaimFormAction} className="grid gap-3 sm:grid-cols-2">
              <FormPendingOverlay />
              <input type="hidden" name="serialNumber" value={look.serialNumber} />
              <div className="sm:col-span-2"><label className={lbl} htmlFor="fault">Fault (the customer&apos;s complaint)</label><textarea id="fault" name="fault" required rows={3} className={`${input} mt-1`} placeholder="e.g. Inverter shuts down under load after 20 minutes." /><div className="mt-1"><RefineTextButton targetId="fault" /></div></div>
              <div><label className={lbl} htmlFor="causalPart">Suspected part (optional)</label><input id="causalPart" name="causalPart" className={`${input} mt-1`} placeholder="e.g. battery pack" /></div>
              <div><label className={lbl} htmlFor="failureDate">Failure date</label><input id="failureDate" name="failureDate" type="date" defaultValue={today} max={today} className={`${input} mt-1`} /></div>
              <div className="sm:col-span-2"><SubmitButton label="Log claim and open service job" pendingLabel="Logging…" className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90" /></div>
            </form>
          ) : look?.found ? <p className="text-sm text-[var(--ejo-warning)]">Not under an active product warranty today — open a <LoadingLink href={`/service/jobs/new?serial=${encodeURIComponent(look.serialNumber)}`} className="text-[var(--ejo-primary)] hover:underline">paid service job</LoadingLink> instead, or register the warranty first.</p> : null}
        </RevealPanel>
      ) : null}

      <form className="mb-4 flex gap-2" action="/service/claims">
        <LiveSearchInput type="search" name="q" defaultValue={q ?? ''} placeholder="Search by claim number, serial or complaint…" className="w-full max-w-md rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]" />
        <button type="submit" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]">Search</button>
      </form>

      {claims.length === 0 ? (
        <EmptyState icon="file" title="No product warranty claims yet">Log one for a covered serial above.</EmptyState>
      ) : (
        <ResponsiveTable className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--ejo-border)] bg-[var(--ejo-bg)] text-left text-xs text-[var(--ejo-text-muted)]">
                <th className="px-3 py-2">Claim</th><th className="px-3 py-2">Unit</th><th className="px-3 py-2">Customer</th><th className="px-3 py-2">Complaint</th><th className="px-3 py-2">Service job</th><th className="px-3 py-2">Claim status</th>
              </tr>
            </thead>
            <tbody>
              {claims.map((c) => (
                <tr key={c.id} className="border-b border-[var(--ejo-border)] align-top last:border-0">
                  <td className="px-3 py-2"><LoadingLink href={`/warranty/claims/${c.id}`} className="font-medium text-[var(--ejo-primary)] hover:underline">{c.claimNumber}</LoadingLink><div className="text-xs text-[var(--ejo-text-muted)]"><LoadingLink href={`/warranty/${c.warranty.id}`} className="hover:underline">{c.warranty.warrantyNumber}</LoadingLink> · failed {formatDateOnly(c.failureDate)}</div></td>
                  <td data-label="Unit" className="px-3 py-2 text-[var(--ejo-text)]">{c.warranty.finishedUnit?.product.name ?? c.causalPart}<div className="text-xs text-[var(--ejo-text-muted)]">{c.warranty.finishedUnit?.serialNumber ?? ''}</div></td>
                  <td data-label="Customer" className="px-3 py-2 text-xs"><CustomerLink id={c.customer.id} name={c.customer.fullName} canView={canSeeCustomers} /></td>
                  <td data-label="Complaint" className="line-clamp-2 max-w-xs px-3 py-2 text-xs text-[var(--ejo-text)]">{c.complaint}</td>
                  <td data-label="Service job" className="px-3 py-2 text-xs">{c.job ? <><LoadingLink href={`/service/jobs/${c.job.id}`} className="text-[var(--ejo-primary)] hover:underline">{c.job.number}</LoadingLink><div className="text-[var(--ejo-text-muted)]">{SERVICE_JOB_STATUS_LABEL[c.job.status as ServiceJobStatus]}</div></> : <span className="text-[var(--ejo-text-muted)]">—</span>}</td>
                  <td data-label="Claim status" className="px-3 py-2"><StatusChip status={c.status} label={CLAIM_STATUS_LABEL[c.status] ?? c.status} />{c.customerResolution ? <div className="mt-1 text-xs text-[var(--ejo-text-muted)]">{CUSTOMER_RESOLUTION_LABEL[c.customerResolution] ?? c.customerResolution}</div> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ResponsiveTable>
      )}
    </div>
  );
}
