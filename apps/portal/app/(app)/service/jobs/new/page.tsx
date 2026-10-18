import { allows, guardAnyPage } from '@/lib/authz/server';
import { lookupUnitBySerial, searchServiceCustomerOptions } from '@/lib/actions/service';
import { openServiceJobFormAction } from '@/lib/actions/service-form-handlers';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { SearchableSelect } from '@/components/SearchableSelect';
import { LoadingLink } from '@/components/LoadingLink';
import { CoverageChip } from '@/components/service/CoverageChip';
import { PageHeader, SectionCard, StatusChip } from '@/components/ui';
import { SERVICE_KIND_LABEL } from '@/lib/service-core';
import { formatDateOnly } from '@/lib/utils/format-date';
import { RefineTextButton } from '@/components/enyo/RefineTextButton';

const input = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';
const label = 'block text-xs font-medium text-[var(--ejo-text-muted)]';

/**
 * Open a service job: look the serial up first (product, customer and
 * warranty cover today come from the unit's own record), then record the
 * fault. A serial not in the system can still be opened with a typed product name.
 */
export default async function NewServiceJobPage({ searchParams }: { searchParams: Promise<{ serial?: string; error?: string }> }) {
  await guardAnyPage(['service.view'], '/service');
  const { serial, error } = await searchParams;
  const canManage = await allows('service.manage');
  const look = serial ? await lookupUnitBySerial(serial) : null;
  return (
    <div className="p-8">
      <PageHeader
        icon="wrench"
        back={{ href: '/service/jobs', label: 'Back to Service jobs' }}
        title="Open a service job"
        description="Start with the unit's serial number. The system finds the product, the customer and whether it is under warranty today; a covered unit gets a warranty job, any other a paid one."
      />
      {error ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="error" message={error} /></div> : null}
      {!canManage ? (
        <div className="max-w-2xl rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6 text-sm text-[var(--ejo-text)]">Only the Service Centre supervisor opens service jobs. You can look a serial up on the <LoadingLink href="/service/warranties" className="text-[var(--ejo-primary)] hover:underline">Product warranties</LoadingLink> page.</div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-6">
            <SectionCard icon="search" title="1. Find the unit" description="Type the serial exactly as printed on the label.">
              <form action="/service/jobs/new" className="flex flex-wrap gap-2">
                <input name="serial" defaultValue={serial ?? ''} placeholder="Serial number, e.g. ZNX26LP0000123" required className={`${input} max-w-md`} aria-label="Serial number" />
                <button type="submit" className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90">Look up</button>
              </form>
              {look ? (
                look.found && look.unit ? (
                  <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                    <div><p className={label}>Product</p><p className="text-[var(--ejo-text)]">{look.unit.productName}{look.unit.configuration ? ` — ${look.unit.configuration}` : ''}</p></div>
                    <div><p className={label}>Serial</p><p className="text-[var(--ejo-text)]">{look.serialNumber}</p></div>
                    <div><p className={label}>Customer</p><p className="text-[var(--ejo-text)]">{look.unit.customerName ?? <span className="text-[var(--ejo-warning)]">No customer on record</span>}</p></div>
                    <div><p className={label}>Unit</p><p className="text-[var(--ejo-text)]"><StatusChip status={look.unit.status} /> · {look.unit.locationName}{look.unit.soldAt ? ` · sold ${formatDateOnly(look.unit.soldAt)}` : ''}</p></div>
                    <div className="sm:col-span-2"><p className={label}>Warranty today</p><p className="mt-1"><CoverageChip coverage={look.coverage} /></p></div>
                    {look.openJob ? <div className="sm:col-span-2 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-warning)]/40 bg-[var(--ejo-warning)]/5 p-3 text-xs text-[var(--ejo-text)]">This unit is already at the Service Centre: <LoadingLink href={`/service/jobs/${look.openJob.id}`} className="font-medium text-[var(--ejo-primary)] hover:underline">{look.openJob.number}</LoadingLink>.</div> : null}
                  </div>
                ) : (
                  <div className="mt-4 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-warning)]/40 bg-[var(--ejo-warning)]/5 p-3 text-sm text-[var(--ejo-text)]">
                    <span className="font-medium">{look.serialNumber}</span> is not in the system (not built here, not received, or sold before the platform). You can still open a paid or goodwill job: type the product name below.
                  </div>
                )
              ) : null}
            </SectionCard>

            {look && !look.openJob ? (
              <SectionCard icon="clipboard" title="2. Record the fault and open the job">
                <form action={openServiceJobFormAction} className="space-y-4">
                  <FormPendingOverlay />
                  <input type="hidden" name="serialNumber" value={look.serialNumber} />
                  {!look.found ? (
                    <div>
                      <label className={label} htmlFor="productName">Product (as the customer describes it)</label>
                      <input id="productName" name="productName" required placeholder="e.g. Zinox Prestige Pro2 laptop" className={`${input} mt-1`} />
                    </div>
                  ) : null}
                  {!look.unit?.customerId ? (
                    <div>
                      <label className={label} htmlFor="customerId">Customer (optional)</label>
                      <div className="mt-1"><SearchableSelect id="customerId" name="customerId" search={searchServiceCustomerOptions} placeholder="Search customers by name, email or phone…" /></div>
                    </div>
                  ) : null}
                  <div>
                    <label className={label} htmlFor="fault">Fault reported</label>
                    <textarea id="fault" name="fault" required rows={4} placeholder="What the customer reports: e.g. does not power on, screen flickers, battery drains in an hour." className={`${input} mt-1`} />
                    <div className="mt-1"><RefineTextButton targetId="fault" /></div>
                  </div>
                  <div>
                    <label className={label} htmlFor="kind">Kind of job</label>
                    <select id="kind" name="kind" defaultValue={look.kind} className={`${input} mt-1 max-w-xs`}>
                      {look.coverage.covered ? <option value="WARRANTY">{SERVICE_KIND_LABEL.WARRANTY} — covered today</option> : null}
                      <option value="PAID">{SERVICE_KIND_LABEL.PAID}</option>
                      <option value="GOODWILL">{SERVICE_KIND_LABEL.GOODWILL}</option>
                    </select>
                    {!look.coverage.covered ? <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">Not under warranty today, so the repair is paid unless you choose goodwill.</p> : null}
                  </div>
                  <SubmitButton label="Open service job" pendingLabel="Opening…" className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90" />
                </form>
              </SectionCard>
            ) : null}
          </div>
          <div className="space-y-4 text-sm text-[var(--ejo-text-muted)]">
            <SectionCard icon="info" title="How the kind is decided">
              <p>A unit with an <strong>active product warranty</strong> covering today gets a <strong>warranty</strong> job; the Warranty Manager later decides which department carries the cost. Any other unit gets a <strong>paid</strong> job: diagnose, quote, repair once paid.</p>
              <p className="mt-2">Register missing warranties under <LoadingLink href="/service/warranties" className="text-[var(--ejo-primary)] hover:underline">Product warranties</LoadingLink> before opening the job, so the cover is recorded correctly.</p>
            </SectionCard>
          </div>
        </div>
      )}
    </div>
  );
}
