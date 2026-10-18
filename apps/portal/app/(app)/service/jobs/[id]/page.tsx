import { notFound } from 'next/navigation';
import { allows, guardAnyPage } from '@/lib/authz/server';
import { requireUser } from '@/lib/actions/workshop';
import { getServiceJob, getServiceJobAuditTrail, searchServiceTechnicianOptions, loadServiceTechnicianOptions, searchServicePartOptions } from '@/lib/actions/service';
import {
  assignServiceTechnicianFormAction, recordServiceDiagnosisFormAction, recordServicePartUsedFormAction, markServiceAwaitingPartsFormAction, resumeServiceRepairFormAction,
  recordServiceResolutionFormAction, recordServiceQaFormAction, returnServiceUnitFormAction, closeServiceJobFormAction, cancelServiceJobFormAction, quoteServiceJobFormAction,
  recordServiceJobPaymentFormAction, setServiceCostCentreFormAction, recordWarrantyLedgerEntryFormAction,
} from '@/lib/actions/service-form-handlers';
import { humanizeAction } from '@/lib/humanize-action';
import { LoadingLink } from '@/components/LoadingLink';
import { PrintMenu } from '@/components/print/PrintMenu';
import { AuditTrail } from '@/components/AuditTrail';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { SearchableSelect } from '@/components/SearchableSelect';
import { CustomerLink } from '@/components/CustomerLink';
import { RefineTextButton } from '@/components/enyo/RefineTextButton';
import { ServiceSteps } from '@/components/service/ServiceSteps';
import { CoverageChip } from '@/components/service/CoverageChip';
import { BackLink, PageTitle, StatusChip, SectionCard } from '@/components/ui';
import { SERVICE_JOB_STATUS_LABEL, SERVICE_KIND_LABEL, COST_CENTRE_LABEL, allowedCostCentres, canReturnUnit, canQaServiceJob, TECHNICIAN_WORK_STATUSES, type ServiceJobStatus, type ServiceJobKind, type WarrantyCostCentre } from '@/lib/service-core';
import { formatDateOnly, formatDateTime } from '@/lib/utils/format-date';
import { formatCurrency } from '@ejo/utils';

const BANNER: Record<string, string> = {
  opened: 'Service job opened. Assign a technician to start the diagnosis.',
  claim_logged: 'Warranty claim logged and the service job opened. Assign a technician to start the diagnosis.',
  assigned: 'Technician assigned — they have been told.',
  diagnosed: 'Diagnosis recorded.',
  part_recorded: 'Part recorded against the job.',
  awaiting_parts: 'Marked as awaiting parts — the supervisor has been told.',
  repairing: 'Repair resumed.',
  sent_to_qa: 'Resolution recorded — the unit is waiting for its quality check.',
  qa_passed: 'Quality check passed — the unit is ready for collection and the customer has been told.',
  qa_failed: 'Quality check failed — sent back for rework.',
  returned: 'Unit returned to the customer.',
  closed: 'Job closed.',
  cancelled: 'Job cancelled.',
  quoted: 'Quotation saved.',
  payment_recorded: 'Payment recorded.',
  cost_centre_set: 'Cost centre recorded.',
  ledger_recorded: 'Ledger entry recorded.',
};

const ACTION_LABEL: Record<string, string> = {
  'service_job.opened': 'Job opened', 'service_job.assigned': 'Technician assigned', 'service_job.diagnosed': 'Diagnosis recorded', 'service_job.part_used': 'Part used',
  'service_job.awaiting_parts': 'Awaiting parts', 'service_job.repair_resumed': 'Repair resumed', 'service_job.repaired': 'Resolution recorded — to quality check',
  'service_job.qa_passed': 'Quality check passed', 'service_job.qa_failed': 'Quality check failed', 'service_job.returned': 'Unit returned to customer', 'service_job.closed': 'Job closed',
  'service_job.cancelled': 'Job cancelled', 'service_job.quoted': 'Repair quoted', 'service_job.payment_recorded': 'Payment recorded', 'service_job.cost_centre_set': 'Cost centre set',
  'service_job.ledger_entry_recorded': 'Ledger entry recorded',
};

const input = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';
const btn = 'rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90';
const btnLine = 'rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]';
const lbl = 'block text-xs font-medium text-[var(--ejo-text-muted)]';

/** One service job: the unit and its cover, the steps, and the action that is next for whoever is looking. */
export default async function ServiceJobPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ status?: string; error?: string }> }) {
  await guardAnyPage(['service.view'], '/service');
  const { id } = await params;
  const { status, error } = await searchParams;
  const [job, trail, viewer] = await Promise.all([getServiceJob(id), getServiceJobAuditTrail(id), requireUser()]);
  if (!job) notFound();
  const record = { branchId: job.branchId, assigneeIds: [job.technicianId, job.supervisorId], ownerIds: [] as string[] };
  const [canManage, canWork, canLedger, canSeeCustomers] = await Promise.all([
    allows('service.manage', { branchId: job.branchId, homeBranch: true }),
    allows('service.job.work', record),
    allows('warranty.claim.approve', { branchId: job.branchId, homeBranch: true }),
    allows('crm.view'),
  ]);
  const s = job.status as ServiceJobStatus;
  const kind = job.kind as ServiceJobKind;
  const isTechStep = (TECHNICIAN_WORK_STATUSES as string[]).includes(s);
  const qa = canQaServiceJob(job, viewer.id);
  const ret = canReturnUnit({ status: job.status, kind: job.kind, quotedAmount: job.quotedAmount, paidAmount: job.paidAmount });
  const finished = ['RETURNED', 'CLOSED', 'CANCELLED'].includes(s);
  const costCentres = allowedCostCentres(kind);

  return (
    <div className="p-8">
      <BackLink href="/service/jobs" label="Back to Service jobs" className="mb-4" />
      {status && BANNER[status] ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="success" message={BANNER[status]} /></div> : null}
      {error ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="error" message={error} /></div> : null}

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <PageTitle icon="wrench">{job.number}</PageTitle>
          <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">
            {job.productName} · serial <span className="font-medium text-[var(--ejo-text)]">{job.serialNumber}</span> · {SERVICE_KIND_LABEL[kind]} · {job.branch.name}
            {job.claim ? <> · claim <LoadingLink href={`/warranty/claims/${job.claim.id}`} className="text-[var(--ejo-primary)] hover:underline">{job.claim.claimNumber}</LoadingLink></> : null}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusChip status={job.status} label={SERVICE_JOB_STATUS_LABEL[s]} className="px-3 py-1 text-sm" />
          <PrintMenu orgHref={`/print/service-job/${job.id}`} clientHref={`/print/service-job/${job.id}?variant=client`} clientLabel="Customer Copy" align="right" />
        </div>
      </div>

      <ServiceSteps job={job} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <SectionCard icon="package" title="The unit">
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <div><p className={lbl}>Customer</p><p className="text-[var(--ejo-text)]">{job.customer ? <CustomerLink id={job.customer.id} name={job.customer.fullName} canView={canSeeCustomers} /> : '—'}{job.customer?.phone ? <span className="text-xs text-[var(--ejo-text-muted)]"> · {job.customer.phone}</span> : null}</p></div>
              <div><p className={lbl}>Unit record</p><p className="text-[var(--ejo-text)]">{job.finishedUnit ? <>{job.finishedUnit.product.name}{job.finishedUnit.configuration ? ` — ${job.finishedUnit.configuration.name}` : ''} · <StatusChip status={job.finishedUnit.status} />{job.finishedUnit.soldAt ? <span className="text-xs text-[var(--ejo-text-muted)]"> · sold {formatDateOnly(job.finishedUnit.soldAt)}</span> : null}</> : <span className="text-[var(--ejo-text-muted)]">Serial not in the system (typed product)</span>}</p></div>
              <div className="sm:col-span-2"><p className={lbl}>Warranty today</p><p className="mt-1">{job.finishedUnit ? <CoverageChip coverage={job.coverage} /> : <span className="text-xs text-[var(--ejo-text-muted)]">No warranty can be checked for a serial that is not in the system.</span>}</p></div>
              <div className="sm:col-span-2"><p className={lbl}>Fault reported</p><p className="whitespace-pre-line text-[var(--ejo-text)]">{job.fault}</p></div>
              <div><p className={lbl}>Diagnosis</p><p className="whitespace-pre-line text-[var(--ejo-text)]">{job.diagnosis ?? <span className="text-[var(--ejo-text-muted)]">Not yet</span>}</p></div>
              <div><p className={lbl}>Resolution</p><p className="whitespace-pre-line text-[var(--ejo-text)]">{job.resolution ?? <span className="text-[var(--ejo-text-muted)]">Not yet</span>}</p></div>
              <div><p className={lbl}>Technician</p><p className="text-[var(--ejo-text)]">{job.technicianName ?? <span className="text-[var(--ejo-warning)]">Not assigned</span>}</p></div>
              <div><p className={lbl}>Supervisor</p><p className="text-[var(--ejo-text)]">{job.supervisorName ?? job.openedBy.fullName}</p></div>
              {job.qaAt ? <div className="sm:col-span-2"><p className={lbl}>Quality check</p><p className="text-[var(--ejo-text)]">{job.qaPassed ? 'Passed' : 'Failed'} by {job.qaByName ?? '—'} · {formatDateTime(job.qaAt)}</p></div> : null}
            </div>
          </SectionCard>

          {/* Supervisor: assign (or reassign) a technician */}
          {canManage && ['OPEN', 'ASSIGNED', 'DIAGNOSED'].includes(s) ? (
            <SectionCard icon="user" title={job.technicianId ? 'Reassign the technician' : 'Assign a technician'} description="Service technicians of your organisation.">
              <form action={assignServiceTechnicianFormAction} className="flex flex-wrap items-end gap-3">
                <FormPendingOverlay />
                <input type="hidden" name="jobId" value={job.id} />
                <div className="min-w-[280px] flex-1">
                  <label className={lbl} htmlFor="technicianId">Technician</label>
                  <div className="mt-1"><SearchableSelect id="technicianId" name="technicianId" required search={searchServiceTechnicianOptions} loadDefaultOptions={loadServiceTechnicianOptions} defaultOptionsLabel="Service technicians" placeholder="Search technicians…" /></div>
                </div>
                <SubmitButton label={job.technicianId ? 'Reassign' : 'Assign'} pendingLabel="Assigning…" className={btn} />
              </form>
            </SectionCard>
          ) : null}

          {/* Technician: diagnosis */}
          {canWork && s === 'ASSIGNED' ? (
            <SectionCard icon="clipboard" title="Record the diagnosis" description="What you found when you examined the unit.">
              <form action={recordServiceDiagnosisFormAction} className="space-y-3">
                <FormPendingOverlay />
                <input type="hidden" name="jobId" value={job.id} />
                <textarea id="diagnosis" name="diagnosis" required rows={4} className={input} placeholder="e.g. Battery cell failure — no charge accepted; motherboard and charging port test fine." />
                <div className="flex items-center gap-2"><SubmitButton label="Record diagnosis" pendingLabel="Saving…" className={btn} /><RefineTextButton targetId="diagnosis" /></div>
              </form>
            </SectionCard>
          ) : null}

          {/* Technician: parts, awaiting parts, resolution */}
          {canWork && ['DIAGNOSED', 'AWAITING_PARTS', 'REPAIRING'].includes(s) ? (
            <SectionCard icon="package" title="Repair" description="Record each part used from the service parts store, pause for parts, and record the resolution when done.">
              <form action={recordServicePartUsedFormAction} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_110px_140px_auto] sm:items-end">
                <FormPendingOverlay />
                <input type="hidden" name="jobId" value={job.id} />
                <div><label className={lbl} htmlFor="partId">Part used</label><div className="mt-1"><SearchableSelect id="partId" name="partId" required search={searchServicePartOptions} placeholder="Search parts by name or number…" /></div></div>
                <div><label className={lbl} htmlFor="quantity">Quantity</label><input id="quantity" name="quantity" type="number" min="0.001" step="0.001" defaultValue="1" required className={`${input} mt-1`} /></div>
                <div><label className={lbl} htmlFor="unitCost">Unit cost (₦)</label><input id="unitCost" name="unitCost" type="number" min="0" step="0.01" placeholder="store price" className={`${input} mt-1`} /></div>
                <SubmitButton label="Add part" pendingLabel="Adding…" className={btnLine} />
              </form>
              <div className="mt-4 flex flex-wrap gap-3">
                {s !== 'AWAITING_PARTS' ? (
                  <form action={markServiceAwaitingPartsFormAction} className="flex flex-wrap items-end gap-2">
                    <FormPendingOverlay />
                    <input type="hidden" name="jobId" value={job.id} />
                    <div><label className={lbl} htmlFor="awaitNote">Parts needed (optional)</label><input id="awaitNote" name="note" className={`${input} mt-1 min-w-[240px]`} placeholder="e.g. 14.1 inch FHD panel" /></div>
                    <SubmitButton label="Awaiting parts" pendingLabel="Saving…" className={btnLine} />
                  </form>
                ) : (
                  <form action={resumeServiceRepairFormAction}><FormPendingOverlay /><input type="hidden" name="jobId" value={job.id} /><SubmitButton label="Parts arrived — resume repair" pendingLabel="Saving…" className={btnLine} /></form>
                )}
              </div>
              <form action={recordServiceResolutionFormAction} className="mt-5 space-y-3 border-t border-[var(--ejo-border)] pt-4">
                <FormPendingOverlay />
                <input type="hidden" name="jobId" value={job.id} />
                <label className={lbl} htmlFor="resolution">Resolution — what was done</label>
                <textarea id="resolution" name="resolution" required rows={3} className={input} placeholder="e.g. Replaced the battery pack, updated BIOS, 4-hour burn-in passed." />
                <div className="flex items-center gap-2"><SubmitButton label="Repair done — send for quality check" pendingLabel="Saving…" className={btn} /><RefineTextButton targetId="resolution" /></div>
              </form>
            </SectionCard>
          ) : null}

          {/* Supervisor: QA */}
          {s === 'QA' && canManage ? (
            <SectionCard icon="shield-check" title="Quality check after repair" description="Test the unit as the customer will use it. The technician who repaired it cannot pass it.">
              {qa.ok ? (
                <form action={recordServiceQaFormAction} className="space-y-3">
                  <FormPendingOverlay />
                  <input type="hidden" name="jobId" value={job.id} />
                  <div><label className={lbl} htmlFor="qaNote">Notes (optional)</label><input id="qaNote" name="note" className={`${input} mt-1`} placeholder="e.g. Keyboard, display, ports, battery and Wi-Fi all pass." /></div>
                  <div className="flex flex-wrap gap-2">
                    <button type="submit" name="result" value="PASS" className={btn}>Pass — ready for collection</button>
                    <button type="submit" name="result" value="FAIL" className={btnLine}>Fail — back to the technician</button>
                  </div>
                </form>
              ) : <p className="text-sm text-[var(--ejo-warning)]">{qa.reason}</p>}
            </SectionCard>
          ) : null}

          {/* Money on a paid job */}
          {kind === 'PAID' && (canManage || job.quotedAmount !== null) ? (
            <SectionCard icon="money" title="Quotation and payment" description="A paid repair is quoted after the diagnosis and returned once paid in full.">
              <div className="grid gap-3 text-sm sm:grid-cols-3">
                <div><p className={lbl}>Quoted</p><p className="text-[var(--ejo-text)]">{job.quotedAmount === null ? 'Not yet' : formatCurrency(job.quotedAmount, 'NGN')}</p></div>
                <div><p className={lbl}>Paid</p><p className="text-[var(--ejo-text)]">{formatCurrency(job.paidAmount, 'NGN')}</p></div>
                <div><p className={lbl}>Balance</p><p className={job.balance > 0 ? 'font-medium text-[var(--ejo-warning)]' : 'text-[var(--ejo-success)]'}>{formatCurrency(job.balance, 'NGN')}</p></div>
              </div>
              {canManage && !finished ? (
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <form action={quoteServiceJobFormAction} className="flex flex-wrap items-end gap-2">
                    <FormPendingOverlay />
                    <input type="hidden" name="jobId" value={job.id} />
                    <div><label className={lbl} htmlFor="quoteAmount">Quoted amount (₦)</label><input id="quoteAmount" name="amount" type="number" min="0" step="0.01" defaultValue={job.quotedAmount ?? ''} required className={`${input} mt-1`} /></div>
                    <SubmitButton label={job.quotedAmount === null ? 'Quote' : 'Update quote'} pendingLabel="Saving…" className={btnLine} />
                  </form>
                  {job.quotedAmount !== null && job.balance > 0 ? (
                    <form action={recordServiceJobPaymentFormAction} className="flex flex-wrap items-end gap-2">
                      <FormPendingOverlay />
                      <input type="hidden" name="jobId" value={job.id} />
                      <div><label className={lbl} htmlFor="payAmount">Amount paid (₦)</label><input id="payAmount" name="amount" type="number" min="0.01" step="0.01" defaultValue={job.balance} required className={`${input} mt-1`} /></div>
                      <div><label className={lbl} htmlFor="payRef">Reference</label><input id="payRef" name="reference" className={`${input} mt-1`} placeholder="transfer / POS reference" /></div>
                      <SubmitButton label="Record payment" pendingLabel="Saving…" className={btnLine} />
                    </form>
                  ) : null}
                </div>
              ) : null}
            </SectionCard>
          ) : null}

          {/* Supervisor: return / close / cancel */}
          {canManage && s === 'READY' ? (
            <SectionCard icon="check-circle" title="Return the unit to the customer">
              {ret.ok ? (
                <form action={returnServiceUnitFormAction} className="flex flex-wrap items-end gap-2">
                  <FormPendingOverlay />
                  <input type="hidden" name="jobId" value={job.id} />
                  <div><label className={lbl} htmlFor="collectedBy">Collected by</label><input id="collectedBy" name="collectedBy" className={`${input} mt-1 min-w-[240px]`} placeholder="name of the person collecting" /></div>
                  <SubmitButton label="Unit returned" pendingLabel="Saving…" className={btn} />
                </form>
              ) : <p className="text-sm text-[var(--ejo-warning)]">{ret.reason}</p>}
            </SectionCard>
          ) : null}
          {canManage && s === 'RETURNED' ? (
            <form action={closeServiceJobFormAction}><FormPendingOverlay /><input type="hidden" name="jobId" value={job.id} /><SubmitButton label="Close the job" pendingLabel="Closing…" className={btnLine} /></form>
          ) : null}
          {canManage && ['OPEN', 'ASSIGNED'].includes(s) ? (
            <details className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4 text-sm">
              <summary className="cursor-pointer font-medium text-[var(--ejo-error)]">Cancel this job</summary>
              <form action={cancelServiceJobFormAction} className="mt-3 flex flex-wrap items-end gap-2">
                <FormPendingOverlay />
                <input type="hidden" name="jobId" value={job.id} />
                <div className="min-w-[260px] flex-1"><label className={lbl} htmlFor="cancelReason">Reason</label><input id="cancelReason" name="reason" required className={`${input} mt-1`} /></div>
                <SubmitButton label="Cancel job" pendingLabel="Cancelling…" className={btnLine} />
              </form>
            </details>
          ) : null}

          {/* Parts and ledger */}
          <SectionCard icon="package" title={`Parts used (${job.parts.length})`} description={job.parts.length ? `Recorded value ${formatCurrency(job.partsTotal, 'NGN')} — stock is adjusted by the Store.` : 'No parts recorded yet.'}>
            {job.parts.length ? (
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-[var(--ejo-text-muted)]"><th className="py-1">Part</th><th className="py-1 text-right">Qty</th><th className="py-1 text-right">Unit cost</th><th className="py-1">By</th></tr></thead>
                <tbody>{job.parts.map((p) => <tr key={p.id} className="border-t border-[var(--ejo-border)]"><td className="py-1 text-[var(--ejo-text)]">{p.part.name}{p.part.partNumber ? <span className="text-xs text-[var(--ejo-text-muted)]"> · {p.part.partNumber}</span> : null}</td><td className="py-1 text-right">{p.quantity} {p.part.baseUnitOfMeasure}</td><td className="py-1 text-right">{formatCurrency(p.unitCost, 'NGN')}</td><td className="py-1 text-xs text-[var(--ejo-text-muted)]">{p.usedByName ?? '—'} · {formatDateOnly(p.usedAt)}</td></tr>)}</tbody>
              </table>
            ) : null}
          </SectionCard>

          {kind !== 'PAID' || job.ledger.length || canLedger ? (
            <SectionCard icon="money" title="Cost centre and warranty ledger" description="Which department carries this case, and what it cost.">
              <p className="text-sm text-[var(--ejo-text)]">Cost centre: <span className="font-medium">{job.costCentre ? COST_CENTRE_LABEL[job.costCentre as WarrantyCostCentre] : 'not decided yet'}</span>{job.ledgerTotal ? <> · ledger total <span className="font-medium">{formatCurrency(job.ledgerTotal, 'NGN')}</span></> : null}</p>
              {job.ledger.length ? (
                <ul className="mt-2 space-y-1 text-xs text-[var(--ejo-text-muted)]">
                  {job.ledger.map((l) => <li key={l.id}><span className="text-[var(--ejo-text)]">{formatCurrency(l.amount, 'NGN')}</span> · {COST_CENTRE_LABEL[l.costCentre as WarrantyCostCentre]}{l.note ? ` · ${l.note}` : ''} · {l.recordedByName ?? '—'}, {formatDateOnly(l.recordedAt)}</li>)}
                </ul>
              ) : null}
              {canLedger && (job.diagnosis || job.resolution) ? (
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <form action={setServiceCostCentreFormAction} className="flex flex-wrap items-end gap-2">
                    <FormPendingOverlay />
                    <input type="hidden" name="jobId" value={job.id} />
                    <div className="min-w-[240px] flex-1"><label className={lbl} htmlFor="costCentre">Cost centre</label><select id="costCentre" name="costCentre" defaultValue={job.costCentre ?? ''} required className={`${input} mt-1`}><option value="" disabled>Choose…</option>{costCentres.map((c) => <option key={c} value={c}>{COST_CENTRE_LABEL[c]}</option>)}</select></div>
                    <SubmitButton label="Set" pendingLabel="Saving…" className={btnLine} />
                  </form>
                  <form action={recordWarrantyLedgerEntryFormAction} className="flex flex-wrap items-end gap-2">
                    <FormPendingOverlay />
                    <input type="hidden" name="jobId" value={job.id} />
                    <div><label className={lbl} htmlFor="ledgerCc">Charge to</label><select id="ledgerCc" name="costCentre" defaultValue={job.costCentre ?? costCentres[0]} className={`${input} mt-1`}>{costCentres.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ').toLowerCase()}</option>)}</select></div>
                    <div><label className={lbl} htmlFor="ledgerAmount">Amount (₦)</label><input id="ledgerAmount" name="amount" type="number" step="0.01" defaultValue={job.partsTotal || ''} required className={`${input} mt-1`} /></div>
                    <div><label className={lbl} htmlFor="ledgerNote">Note</label><input id="ledgerNote" name="note" className={`${input} mt-1`} placeholder="parts + labour" /></div>
                    <SubmitButton label="Record" pendingLabel="Saving…" className={btnLine} />
                  </form>
                </div>
              ) : canLedger ? <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">The cost centre is decided once the diagnosis is in.</p> : null}
            </SectionCard>
          ) : null}
        </div>

        <div className="space-y-6 xl:sticky xl:top-6 xl:self-start">
          {!canManage && !canWork && isTechStep ? <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4 text-xs text-[var(--ejo-text-muted)]">This job is with {job.technicianName ?? 'its technician'}. Only they and the supervisor can record work on it.</div> : null}
          <SectionCard icon="history" title="Audit trail">
            <AuditTrail
              entries={trail.map((e) => {
                const meta = (e.metadata ?? {}) as Record<string, unknown>;
                const parts = [
                  typeof meta.technician === 'string' ? `To ${meta.technician}` : null,
                  typeof meta.part === 'string' ? `${meta.part} × ${meta.quantity}` : null,
                  typeof meta.amount === 'number' ? formatCurrency(meta.amount, 'NGN') : null,
                  typeof meta.costCentre === 'string' ? String(meta.costCentre).replace(/_/g, ' ').toLowerCase() : null,
                  typeof meta.reason === 'string' ? `Reason: ${meta.reason}` : null,
                  typeof meta.note === 'string' ? meta.note : null,
                  typeof meta.collectedBy === 'string' ? `Collected by ${meta.collectedBy}` : null,
                ].filter(Boolean);
                return { id: e.id, actionLabel: ACTION_LABEL[e.action] ?? humanizeAction(e.action), userName: e.userName, detail: parts.join(' · ') || null, dateLabel: formatDateTime(e.createdAt) };
              })}
            />
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
