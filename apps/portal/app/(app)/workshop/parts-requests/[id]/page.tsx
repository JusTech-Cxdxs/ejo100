import { ResponsiveTable } from '@/components/ui/ResponsiveTable';
import { guardAnyPage, allows } from '@/lib/authz/server';
import { STORE_COST_PERMISSIONS } from '@/lib/authz/catalogue';
import { GrnRef } from '@/components/GrnRef';
import { notFound } from 'next/navigation';
import { listWarrantiesFor } from '@/lib/actions/warranty';
import { WarrantyList } from '@/components/WarrantyList';
import { getPartRequestSlip } from '@/lib/actions/sourcing';
import { listEligibleManagersForBranch, currentUserIsMasterAdmin, currentUserId } from '@/lib/actions/workshop';
import { listEligibleStoreManagersForBranch, listEligibleStoreOfficersForBranch } from '@/lib/actions/store';
import { pluralize, pluralizeWord } from '@/lib/utils/pluralize';
import {
  approvePartRequestSlipByHodFormAction,
  approvePartRequestSlipByStoreFormAction,
  releasePartRequestSlipFormAction,
  rejectPartRequestSlipFormAction,
} from '@/lib/actions/sourcing-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { SubmitButton } from '@/components/SubmitButton';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { formatDateTime } from '@/lib/utils/format-date';
import { PrintMenu } from '@/components/print/PrintMenu';
import { SerialReleaseSelector } from '@/components/SerialReleaseSelector';
import { SearchableSelect } from '@/components/SearchableSelect';
import { searchStaffOptions, loadStaffOptions } from '@/lib/actions/security';
import { PageTitle } from '@/components/ui';
import { CustomerLink } from '@/components/CustomerLink';

const STATUS_LABEL: Record<string, string> = {
  PENDING_HOD_APPROVAL: 'Awaiting HOD approval',
  PENDING_STORE_APPROVAL: 'Awaiting Store approval',
  APPROVED: 'Approved — awaiting release',
  RELEASED: 'Released',
  REJECTED: 'Rejected',
};

function formatNaira(value: number): string {
  return `₦${value.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * The parts request slip, laid out like a printed store requisition: header,
 * numbered parts table, total, then the approval chain. Lines were matched
 * and priced at estimate time, so nothing here is editable.
 */
export default async function PartRequestSlipDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; status?: string }>;
}) {
  await guardAnyPage(['workshop.view'], '/workshop');
  const { id } = await params;
  const { error, status } = await searchParams;
  const slip = await getPartRequestSlip(id);
  const warranties = slip ? await listWarrantiesFor({ slipId: id }) : [];
  if (!slip) notFound();
  // Customer names link to their Customers (CRM) page for those who may open it.
  const canSeeCustomers = await allows('crm.view');
  // Goods receipts show delivery costs: a link only for those who may open them.
  const canSeeGrn = (await Promise.all(STORE_COST_PERMISSIONS.map((k) => allows(k)))).some(Boolean);
  // Who usually collects: the job's assigned technician.
  const receiver = (slip.jobCard?.assignedTechnician ?? slip.vehicleService?.assignedTechnician) ?? null;

  const [isMasterAdmin, viewerId, eligibleManagers, eligibleStoreManagers, eligibleStoreOfficers] = await Promise.all([
    currentUserIsMasterAdmin(),
    currentUserId(),
    listEligibleManagersForBranch(slip.branchId),
    listEligibleStoreManagersForBranch(slip.branchId),
    listEligibleStoreOfficersForBranch(slip.branchId),
  ]);
  const isEligibleManager = isMasterAdmin || eligibleManagers.supervisors.some((m: { id: string }) => m.id === viewerId);
  const isEligibleStoreStaff =
    isMasterAdmin ||
    eligibleStoreManagers.staff.some((s) => s.id === viewerId) ||
    eligibleStoreOfficers.staff.some((s) => s.id === viewerId);
  const serializedLines = slip.lines.filter((l: (typeof slip.lines)[number]) => l.part.trackingType === 'SERIALIZED');
  // A slip comes from either a Job Card or a Vehicle Service estimate;
  // exactly one of the two is set.
  const source = slip.jobCard ?? slip.vehicleService;
  const sourceLabel = slip.jobCard ? 'Job Card' : 'Vehicle Service';
  const sourceNumber = slip.jobCard ? slip.jobCard.jobNumber : slip.vehicleService?.serviceNumber;
  const sourceUrl = slip.jobCard ? `/workshop/job-cards/${slip.jobCard.id}` : `/workshop/vehicle-service/${slip.vehicleService?.id}`;
  const vehicle = source!.vehicle;
  const vehicleSummary = [vehicle.year, vehicle.make, vehicle.model, vehicle.engineType].filter(Boolean).join(' ') || 'No vehicle details on file';
  const totalAmount = slip.lines.reduce((sum: number, l: (typeof slip.lines)[number]) => {
    const amount = l.estimateLineItem?.amount ?? l.serviceEstimateLineItem?.amount;
    return sum + (amount !== null && amount !== undefined ? Number(amount) : 0);
  }, 0);

  return (
    <div className="p-8">
      <LoadingLink href="/workshop/parts-requests" className="mb-4 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)] print:hidden">
        ← Back to Parts Requests
      </LoadingLink>

      {error ? (
        <div className="mb-6 max-w-xl print:hidden">
          <FormFeedbackBanner kind="error" message={error} />
        </div>
      ) : null}
      {status === 'hod_approved' ? (
        <div className="mb-6 max-w-xl print:hidden">
          <FormFeedbackBanner kind="success" message="Approved — now awaiting Store." />
        </div>
      ) : null}
      {status === 'store_approved' ? (
        <div className="mb-6 max-w-xl print:hidden">
          <FormFeedbackBanner kind="success" message="Approved and stock reserved — now ready for release." />
        </div>
      ) : null}
      {status === 'released' ? (
        <div className="mb-6 max-w-xl print:hidden">
          <FormFeedbackBanner kind="success" message="Released." />
        </div>
      ) : null}
      {status === 'rejected' ? (
        <div className="mb-6 max-w-xl print:hidden">
          <FormFeedbackBanner kind="success" message="Rejected." />
        </div>
      ) : null}

      {/* The slip prints on its own; approval actions and the timeline don't. */}
      <div className="max-w-4xl rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-8 print:border-0 print:p-0 print:shadow-none">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--ejo-border)] pb-4">
          <div>
            <PageTitle icon="package">Store Parts Request</PageTitle>
            <p className="text-sm text-[var(--ejo-text-muted)]">{slip.referenceNumber}</p>
          </div>
          <span className="rounded-full bg-[var(--ejo-info)]/15 px-3 py-1 text-xs font-medium text-[var(--ejo-info)] print:hidden">
            {STATUS_LABEL[slip.status] ?? slip.status}
          </span>
        </div>

        <div className="grid gap-4 border-b border-[var(--ejo-border)] py-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-[var(--ejo-text-muted)]">{sourceLabel}</dt>
            <dd className="text-sm font-medium text-[var(--ejo-text)]">
              <LoadingLink href={sourceUrl} className="text-[var(--ejo-primary)] hover:underline print:text-[var(--ejo-text)] print:no-underline">
                {sourceNumber}
              </LoadingLink>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--ejo-text-muted)]">Customer</dt>
            <dd className="text-sm font-medium text-[var(--ejo-text)]"><CustomerLink id={source!.customer.id} name={source!.customer.fullName} canView={canSeeCustomers} /></dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--ejo-text-muted)]">Vehicle</dt>
            <dd className="text-sm font-medium text-[var(--ejo-text)]">{vehicleSummary}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--ejo-text-muted)]">Plate No.</dt>
            <dd className="text-sm font-medium text-[var(--ejo-text)]">{vehicle.plateNumber ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--ejo-text-muted)]">VIN / Chassis</dt>
            <dd className="text-sm font-medium text-[var(--ejo-text)]">{vehicle.chassisNumber ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--ejo-text-muted)]">Date of Request</dt>
            <dd className="text-sm font-medium text-[var(--ejo-text)]">{formatDateTime(new Date(slip.createdAt))}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--ejo-text-muted)]">Requested By</dt>
            <dd className="text-sm font-medium text-[var(--ejo-text)]">{slip.requestedBy.fullName}</dd>
          </div>
        </div>

        <ResponsiveTable flush className="py-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--ejo-border)] text-left text-xs text-[var(--ejo-text-muted)]">
                <th className="px-3 py-2">S/N</th>
                <th className="px-3 py-2">Part No.</th>
                <th className="px-3 py-2">Part Name</th>
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2 text-right">Quantity</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2 print:hidden">Status</th>
              </tr>
            </thead>
            <tbody>
              {slip.lines.map((line: (typeof slip.lines)[number], i: number) => (
                <tr key={line.id} className="border-b border-[var(--ejo-border)] last:border-0">
                  <td data-hide-stacked className="px-3 py-2 text-[var(--ejo-text-muted)]">{i + 1}</td>
                  <td data-label="Part No." className="px-3 py-2 text-[var(--ejo-text-muted)]">{line.part.partNumber ?? '—'}</td>
                  <td data-wide data-label="Part Name" className="px-3 py-2 font-medium text-[var(--ejo-text)]">{line.part.name}</td>
                  <td data-label="Description" className="px-3 py-2 text-[var(--ejo-text-muted)]">{(line.estimateLineItem ?? line.serviceEstimateLineItem)?.description ?? '—'}</td>
                  <td data-label="Quantity" className="px-3 py-2 text-right text-[var(--ejo-text)]">
                    {Number(line.quantityRequested)} {pluralizeWord(Number(line.quantityRequested), line.part.baseUnitOfMeasure)}
                  </td>
                  <td data-label="Amount" className="px-3 py-2 text-right text-[var(--ejo-text)]">
                    {(() => {
                      // Each line links to either a Job Card or a Vehicle Service estimate line.
                      const amount = (line.estimateLineItem ?? line.serviceEstimateLineItem)?.amount;
                      return amount !== null && amount !== undefined ? formatNaira(Number(amount)) : '—';
                    })()}
                  </td>
                  <td data-label="Status" className="px-3 py-2 text-xs text-[var(--ejo-text-muted)] print:hidden">
                    {line.quantityReleased !== null ? (
                      <>
                        Released: {Number(line.quantityReleased)} {pluralizeWord(Number(line.quantityReleased), line.part.baseUnitOfMeasure)}
                        {line.issuedSerials.length > 0 ? (
                          <div className="mt-1 space-y-0.5">
                            {line.issuedSerials.map((s: (typeof line.issuedSerials)[number]) => (
                              <div key={s.serialNumber}>
                                Serial: <span className="font-medium text-[var(--ejo-text)]">{s.serialNumber}</span>
                                {s.goodsReceiptLine?.goodsReceipt ? (
                                  <>
                                    {' '}
                                    — from{' '}
                                    <GrnRef id={s.goodsReceiptLine.goodsReceipt.id} label={s.goodsReceiptLine.goodsReceipt.referenceNumber} link={canSeeGrn} />
                                  </>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        ) : null}
                        {line.batchConsumptions.length > 0 ? (
                          <div className="mt-1 space-y-0.5">
                            {line.batchConsumptions.map((c: (typeof line.batchConsumptions)[number], i: number) => (
                              <div key={i}>
                                From batch <span className="font-medium text-[var(--ejo-text)]">{c.batch.batchNumber}</span> —{' '}
                                {Number(c.quantityTaken)} {pluralizeWord(Number(c.quantityTaken), line.part.baseUnitOfMeasure)}
                                {c.batch.goodsReceiptLine?.goodsReceipt ? (
                                  <>
                                    {' '}
                                    (
                                    <GrnRef id={c.batch.goodsReceiptLine.goodsReceipt.id} label={c.batch.goodsReceiptLine.goodsReceipt.referenceNumber} link={canSeeGrn} />
                                    )
                                  </>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        ) : null}
                        {line.quantitySources.length > 0 ? (
                          <div className="mt-1 space-y-0.5">
                            {line.quantitySources.map((src: (typeof line.quantitySources)[number], i: number) => (
                              <div key={i}>
                                {src.goodsReceiptId ? (
                                  <>
                                    From{' '}
                                    <GrnRef id={src.goodsReceiptId} label={src.referenceNumber ?? 'Goods receipt'} link={canSeeGrn} />{' '}
                                    — {src.quantity} {pluralizeWord(src.quantity, line.part.baseUnitOfMeasure)}
                                  </>
                                ) : (
                                  <>
                                    {src.quantity} {pluralizeWord(src.quantity, line.part.baseUnitOfMeasure)} — no Goods Receipt on record
                                  </>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </>
                    ) : (
                      'Pending'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-medium text-[var(--ejo-text)]">
                <td className="px-3 py-2" colSpan={4}>
                  {pluralize(slip.lines.length, 'Part')} total
                </td>
                <td />
                <td className="px-3 py-2 text-right">{formatNaira(totalAmount)}</td>
                <td className="print:hidden" />
              </tr>
            </tfoot>
          </table>
        </ResponsiveTable>
      </div>

      <div className="mt-6 grid max-w-4xl gap-6 xl:grid-cols-[minmax(0,1fr)_360px] print:hidden">
        <div className="space-y-6">
          {slip.status === 'RELEASED' ? (
            <PrintMenu orgHref={`/print/parts-requests/${slip.id}`} clientHref={`/print/parts-requests/${slip.id}?variant=client`} clientLabel="Collector Copy" />
          ) : null}
          {slip.status === 'PENDING_HOD_APPROVAL' && isEligibleManager ? (
            <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-warning)]/30 bg-[var(--ejo-warning)]/5 p-6">
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Workshop HOD Approval</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <form action={approvePartRequestSlipByHodFormAction} className="space-y-2">
                  <FormPendingOverlay />
                  <input type="hidden" name="slipId" value={slip.id} />
                  <input type="hidden" name="jobCardId" value={slip.jobCard?.id ?? ''} />
                  <input type="hidden" name="vehicleServiceId" value={slip.vehicleService?.id ?? ''} />
                  <textarea name="notes" rows={2} placeholder="Notes (optional)" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-xs text-[var(--ejo-text)]" />
                  <SubmitButton label="Approve" pendingLabel="Approving…" className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-3 py-2 text-xs font-medium text-white hover:opacity-90" />
                </form>
                <form action={rejectPartRequestSlipFormAction} className="space-y-2">
                  <FormPendingOverlay />
                  <input type="hidden" name="slipId" value={slip.id} />
                  <input type="hidden" name="jobCardId" value={slip.jobCard?.id ?? ''} />
                  <input type="hidden" name="vehicleServiceId" value={slip.vehicleService?.id ?? ''} />
                  <textarea name="reason" required rows={2} placeholder="Reason for rejection" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-xs text-[var(--ejo-text)]" />
                  <SubmitButton label="Reject" pendingLabel="Rejecting…" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)] px-3 py-2 text-xs font-medium text-[var(--ejo-error)] hover:bg-[var(--ejo-error)]/5" />
                </form>
              </div>
            </div>
          ) : null}

          {slip.status === 'PENDING_STORE_APPROVAL' && isEligibleStoreStaff ? (
            <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-warning)]/30 bg-[var(--ejo-warning)]/5 p-6">
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Store Approval</h2>
              <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">Approving reserves this stock immediately.</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <form action={approvePartRequestSlipByStoreFormAction} className="space-y-2">
                  <FormPendingOverlay />
                  <input type="hidden" name="slipId" value={slip.id} />
                  <input type="hidden" name="jobCardId" value={slip.jobCard?.id ?? ''} />
                  <input type="hidden" name="vehicleServiceId" value={slip.vehicleService?.id ?? ''} />
                  <textarea name="notes" rows={2} placeholder="Notes (optional)" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-xs text-[var(--ejo-text)]" />
                  <SubmitButton label="Approve & Reserve" pendingLabel="Approving…" className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-3 py-2 text-xs font-medium text-white hover:opacity-90" />
                </form>
                <form action={rejectPartRequestSlipFormAction} className="space-y-2">
                  <FormPendingOverlay />
                  <input type="hidden" name="slipId" value={slip.id} />
                  <input type="hidden" name="jobCardId" value={slip.jobCard?.id ?? ''} />
                  <input type="hidden" name="vehicleServiceId" value={slip.vehicleService?.id ?? ''} />
                  <textarea name="reason" required rows={2} placeholder="Reason for rejection" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-xs text-[var(--ejo-text)]" />
                  <SubmitButton label="Reject" pendingLabel="Rejecting…" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)] px-3 py-2 text-xs font-medium text-[var(--ejo-error)] hover:bg-[var(--ejo-error)]/5" />
                </form>
              </div>
            </div>
          ) : null}

          {slip.status === 'APPROVED' && isEligibleStoreStaff ? (
            <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-info)]/30 bg-[var(--ejo-info)]/5 p-6">
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Release</h2>
              <form action={releasePartRequestSlipFormAction} className="mt-3 space-y-3">
                <FormPendingOverlay />
                <input type="hidden" name="slipId" value={slip.id} />
                <input type="hidden" name="jobCardId" value={slip.jobCard?.id ?? ''} />
                <input type="hidden" name="vehicleServiceId" value={slip.vehicleService?.id ?? ''} />
                {serializedLines.map((line: (typeof slip.lines)[number]) => (
                  <input key={line.id} type="hidden" name="serializedLineId" value={line.id} />
                ))}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Received by — staff</label>
                    <SearchableSelect name="receivedByUserId" search={searchStaffOptions} loadDefaultOptions={loadStaffOptions} defaultOptionsLabel="Staff" placeholder="Search staff by name or employee ID…" emptyMessage="No active staff match." minQueryLength={1} defaultValue={receiver?.id} defaultLabel={receiver?.fullName} />
                    <p className="mt-1 text-[11px] text-[var(--ejo-text-muted)]">{receiver ? 'Pre-filled with the assigned technician — change it if someone else collects.' : 'Choose who is collecting the parts.'}</p>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Not on staff? Type their name instead</label>
                    <input name="receivedByName" placeholder="e.g. an intern or a driver" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]" />
                  </div>
                </div>
                {serializedLines.map((line: (typeof slip.lines)[number]) => (
                  <div key={line.id}>
                    <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">
                      Serial numbers for {line.part.name} ({Number(line.quantityRequested)} needed)
                    </label>
                    <SerialReleaseSelector
                      lineId={line.id}
                      quantityNeeded={Number(line.quantityRequested)}
                      availableSerials={line.part.serials}
                    />
                  </div>
                ))}
                <SubmitButton label="Release" pendingLabel="Releasing…" className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90" />
              </form>
            </div>
          ) : null}
          <WarrantyList warranties={warranties} title="Warranties issued with this release" />
        </div>

        <div className="h-fit rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5 xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:overflow-y-auto">
          <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Timeline</h2>
          <dl className="mt-3 space-y-3 text-sm">
            <div>
              <dt className="text-xs text-[var(--ejo-text-muted)]">Requested</dt>
              <dd className="text-[var(--ejo-text)]">{slip.requestedBy.fullName} · {formatDateTime(new Date(slip.createdAt))}</dd>
            </div>
            {slip.hodApprovedBy ? (
              <div>
                <dt className="text-xs text-[var(--ejo-text-muted)]">HOD Approved</dt>
                <dd className="text-[var(--ejo-text)]">{slip.hodApprovedBy.fullName} · {slip.hodApprovedAt ? formatDateTime(new Date(slip.hodApprovedAt)) : ''}</dd>
              </div>
            ) : null}
            {slip.storeApprovedBy ? (
              <div>
                <dt className="text-xs text-[var(--ejo-text-muted)]">Store Approved</dt>
                <dd className="text-[var(--ejo-text)]">{slip.storeApprovedBy.fullName} · {slip.storeApprovedAt ? formatDateTime(new Date(slip.storeApprovedAt)) : ''}</dd>
              </div>
            ) : null}
            {slip.releasedBy ? (
              <div>
                <dt className="text-xs text-[var(--ejo-text-muted)]">Released</dt>
                <dd className="text-[var(--ejo-text)]">
                  {slip.releasedBy.fullName} · {slip.releasedAt ? formatDateTime(new Date(slip.releasedAt)) : ''}
                  {slip.receivedByUser ? <> · Received by {slip.receivedByUser.fullName}</> : slip.receivedByName ? <> · Received by {slip.receivedByName}</> : null}
                </dd>
              </div>
            ) : null}
            {slip.rejectedBy ? (
              <div>
                <dt className="text-xs text-[var(--ejo-error)]">Rejected ({slip.rejectionStage})</dt>
                <dd className="text-[var(--ejo-text)]">
                  {slip.rejectedBy.fullName} · {slip.rejectedAt ? formatDateTime(new Date(slip.rejectedAt)) : ''}
                </dd>
                <dd className="mt-1 text-xs text-[var(--ejo-text-muted)]">{slip.rejectionReason}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      </div>
    </div>
  );
}
