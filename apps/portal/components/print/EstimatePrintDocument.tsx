import { DocumentHeader, SignatureBlock, DocumentFooter } from '@/components/print/DocumentHeader';
import { PrintOnLoad } from '@/components/print/PrintOnLoad';
import { pluralize, pluralizeWord } from '@/lib/utils/pluralize';
import { formatDateTime } from '@/lib/utils/format-date';

type OrganisationInfo = {
  name: string;
  legalName: string | null;
  website: string | null;
  email: string | null;
  hotlines: string[];
  hqAddress: string | null;
  poBox: string | null;
  rcNumber: string | null;
};

type BranchInfo = { name: string; address: string | null; email: string | null; hotlines: string[] };

export type EstimatePrintLine = {
  id: string;
  description: string;
  /** Raw type key (STORE_PART, LABOUR, …) — drives the customer subtotals. */
  typeKey: string;
  /** Human label for the Organisation Copy's own Type column. */
  typeLabel: string;
  quantity: number;
  unitOfMeasure: string | null;
  unitPrice: number | null;
  amount: number | null;
  enteredBy: string | null;
};

export type EstimatePrintPayment = { id: string; recordedAt: Date; method: string; amount: number; recordedBy: string; notes: string | null };

export type EstimatePrintAuditEntry = { id: string; action: string; createdAt: Date; metadata: unknown; user: { fullName: string } | null };

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  CASH: 'Cash',
  BANK_TRANSFER: 'Bank Transfer',
  CARD: 'Card',
  CHEQUE: 'Cheque',
};

/**
 * Every estimate-related audit action, for both Job Card (estimate.*,
 * estimate_line.*) and Vehicle Service (service_estimate.*), plus the
 * payments made against it. Same wording as each detail page's own
 * audit trail, so the printed record reads exactly like the screen.
 */
const ESTIMATE_AUDIT_LABEL: Record<string, string> = {
  'estimate.created': 'Estimate started',
  'estimate.line_item_added': 'Estimate line added',
  'estimate.line_item_updated': 'Estimate line updated',
  'estimate.line_item_removed': 'Estimate line removed',
  'estimate.submitted': 'Estimate submitted for validation',
  'estimate.approved': 'Estimate approved',
  'estimate.manager_approved': 'Estimate approved by manager',
  'estimate.customer_notified': 'Customer notified of approved estimate',
  'estimate.nudge_to_technician': 'Supervisor notified technician about estimate',
  'estimate.nudge_to_supervisor': 'Technician notified supervisor about estimate',
  'estimate.store_matching_requested': 'Store matching requested',
  'estimate.store_matching_completed': 'Store matching completed',
  'estimate_line.store_matched': 'Store Part line matched',
  'service_estimate.created': 'Estimate started',
  'service_estimate.line_item_added': 'Estimate line added',
  'service_estimate.line_item_updated': 'Estimate line updated',
  'service_estimate.line_item_removed': 'Estimate line removed',
  'service_estimate.line_store_matched': 'Store Part line matched',
  'service_estimate.store_matching_requested': 'Store matching requested',
  'service_estimate.store_matching_completed': 'Store matching completed',
  'service_estimate.nudge_to_supervisor': 'Technician notified supervisor about estimate',
  'service_estimate.nudge_to_technician': 'Supervisor notified technician about estimate',
  'service_estimate.submitted': 'Estimate submitted for validation',
  'service_estimate.approved': 'Estimate approved',
  'service_estimate.manager_approved': 'Estimate approved by manager',
  'service_estimate.customer_notified': 'Customer notified of approved estimate',
  'service_estimate.cancelled': 'Estimate cancelled',
  'payment.recorded': 'Payment recorded',
  'payment.approved': 'Minimum deposit met — work can proceed',
};

export function isEstimateAuditAction(action: string): boolean {
  return Boolean(ESTIMATE_AUDIT_LABEL[action]);
}

function formatNaira(amount: number): string {
  return `₦${amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function auditDetail(entry: EstimatePrintAuditEntry, typeLabels: Record<string, string>): string | null {
  const meta = entry.metadata as Record<string, unknown> | null;
  if (!meta) return null;
  const a = entry.action;
  if (a.endsWith('line_item_added') || a.endsWith('line_item_updated')) {
    const parts: string[] = [];
    if (typeof meta.type === 'string') parts.push(typeLabels[meta.type] ?? meta.type);
    if (typeof meta.description === 'string') parts.push(`"${meta.description}"`);
    if (typeof meta.quantity === 'number') parts.push(`qty ${meta.quantity}`);
    parts.push(typeof meta.unitPrice === 'number' ? `priced at ${formatNaira(meta.unitPrice)}` : 'no price set');
    return parts.join(' — ');
  }
  if (a.endsWith('line_item_removed')) return typeof meta.description === 'string' ? `"${meta.description}"` : null;
  if (a.endsWith('store_matched')) {
    const parts: string[] = [];
    if (typeof meta.partName === 'string') parts.push(`matched to "${meta.partName}"`);
    if (typeof meta.unitPrice === 'number') parts.push(`priced at ${formatNaira(meta.unitPrice)}`);
    return parts.join(' — ') || null;
  }
  if (a === 'payment.recorded') {
    const parts: string[] = [];
    if (typeof meta.amount === 'number') parts.push(formatNaira(meta.amount));
    if (typeof meta.method === 'string') parts.push(PAYMENT_METHOD_LABEL[meta.method] ?? meta.method);
    if (typeof meta.notes === 'string' && meta.notes) parts.push(meta.notes);
    return parts.join(' — ') || null;
  }
  if (a === 'payment.approved') return typeof meta.totalPaid === 'number' ? `Total confirmed: ${formatNaira(meta.totalPaid)}` : null;
  const note = typeof meta.note === 'string' ? meta.note : typeof meta.notes === 'string' ? meta.notes : null;
  return note ? `Note: ${note}` : null;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: '10px', color: '#94A3B8', fontWeight: 600, letterSpacing: '0.02em' }}>{label}</div>
      <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A', marginTop: '1px' }}>{value}</div>
    </div>
  );
}

function SectionTitle({ children }: { children: string }) {
  return <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>{children}</div>;
}

/**
 * The one real printable estimate, shared by Job Card and Vehicle
 * Service so both always print identically.
 *
 * Customer Copy — exactly what the customer already receives by email
 * and as the attached PDF: line items with no internal type, the three
 * plain customer subtotals, total, the 70% minimum deposit, both ways
 * to pay, and the payment reference.
 *
 * Organisation Copy — everything above, plus the internal detail: the
 * Type and Entered By columns, per-type subtotals, the people involved,
 * who validated / approved / notified and when, every payment recorded,
 * and the estimate's full audit trail.
 */
export function EstimatePrintDocument({
  isOrgCopy,
  organisation,
  branch,
  logoUrl,
  kindLabel,
  referenceNumber,
  customer,
  vehicle,
  requestsTitle,
  requests,
  people,
  approvals,
  lines,
  typeOrder,
  typeLabels,
  payments,
  auditEntries,
  bank,
  minimumDepositFraction,
  paymentReference,
}: {
  isOrgCopy: boolean;
  organisation: OrganisationInfo;
  branch: BranchInfo;
  logoUrl: string;
  kindLabel: 'Job Card' | 'Vehicle Service';
  referenceNumber: string;
  customer: { name: string; address: string | null; phone: string | null; email: string | null };
  vehicle: { summary: string; plateNumber: string | null; chassisNumber: string | null; mileageKm: number | null };
  requestsTitle: string;
  requests: string[];
  people: { technician: string | null; supervisor: string | null; department: string | null; openedBy: string | null; openedAt: Date };
  approvals: {
    validatedBy: string | null;
    validatedAt: Date | null;
    managerApprovedBy: string | null;
    managerApprovedAt: Date | null;
    customerNotifiedAt: Date | null;
  };
  lines: EstimatePrintLine[];
  /** Every type key this kind of estimate can have, in display order. */
  typeOrder: string[];
  typeLabels: Record<string, string>;
  payments: EstimatePrintPayment[];
  auditEntries: EstimatePrintAuditEntry[];
  bank: { bankName: string; accountName: string; accountNumber: string };
  minimumDepositFraction: number;
  paymentReference: string;
}) {
  const total = lines.reduce((sum, l) => sum + (l.amount ?? 0), 0);
  const minimumDeposit = Math.round(total * minimumDepositFraction * 100) / 100;
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const balance = Math.max(0, Math.round((total - totalPaid) * 100) / 100);

  // Same real three-way customer split as the email and the attached
  // PDF — Labour and Sundry kept on their own, everything else is
  // "Parts & Services". Never the internal type per line.
  let servicesTotal = 0;
  let labourTotal = 0;
  let sundryTotal = 0;
  for (const l of lines) {
    const amount = l.amount ?? 0;
    if (l.typeKey === 'LABOUR') labourTotal += amount;
    else if (l.typeKey === 'SUNDRY') sundryTotal += amount;
    else servicesTotal += amount;
  }
  const typeSubtotals = typeOrder
    .map((key) => ({ key, amount: lines.filter((l) => l.typeKey === key).reduce((s, l) => s + (l.amount ?? 0), 0) }))
    .filter((t) => t.amount > 0);

  const cell = { padding: '6px 4px' } as const;
  const cellRight = { padding: '6px 4px', textAlign: 'right' } as const;
  const columnCount = isOrgCopy ? 7 : 5;

  return (
    <div style={{ maxWidth: '780px', margin: '0 auto', padding: '32px 24px', fontFamily: 'Arial, Helvetica, sans-serif', color: '#0F172A' }}>
      <PrintOnLoad />
      <DocumentHeader
        organisation={organisation}
        branch={branch}
        logoUrl={logoUrl}
        documentTitle={isOrgCopy ? `${kindLabel} Estimate — Organisation Copy` : 'Customer Estimate'}
        referenceNumber={referenceNumber}
        statusLabel="Approved"
        accentColor="#16A34A"
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px', marginTop: '20px' }}>
        <Field label={kindLabel.toUpperCase()} value={referenceNumber} />
        <Field label="CUSTOMER" value={customer.name} />
        {customer.address ? <Field label="CUSTOMER ADDRESS" value={customer.address} /> : null}
        {customer.phone ? <Field label="CONTACT" value={customer.phone} /> : null}
        <Field label="VEHICLE" value={vehicle.summary} />
        <Field label="PLATE NO." value={vehicle.plateNumber ?? '—'} />
        <Field label="VIN / CHASSIS" value={vehicle.chassisNumber ?? '—'} />
        <Field label="MILEAGE AT CHECK-IN" value={vehicle.mileageKm != null ? `${vehicle.mileageKm.toLocaleString('en-NG')} km` : '—'} />
        {isOrgCopy ? (
          <>
            <Field label="WORKSHOP DEPARTMENT" value={people.department ?? '—'} />
            <Field label="WORKSHOP SUPERVISOR" value={people.supervisor ?? '—'} />
            <Field label="TECHNICIAN IN CHARGE" value={people.technician ?? '—'} />
            {customer.email ? <Field label="CUSTOMER EMAIL" value={customer.email} /> : null}
          </>
        ) : null}
      </div>

      {requests.length > 0 ? (
        <div style={{ marginTop: '20px' }}>
          <SectionTitle>{requestsTitle.toUpperCase()}</SectionTitle>
          <ol style={{ margin: 0, paddingLeft: '18px', fontSize: '12px' }}>
            {requests.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ol>
        </div>
      ) : null}

      <table role="presentation" style={{ width: '100%', borderCollapse: 'collapse', marginTop: '20px', fontSize: '12px' }}>
        <thead>
          <tr style={{ borderBottom: '1.5px solid #0F172A', textAlign: 'left' }}>
            <th style={cell}>S/N</th>
            <th style={cell}>Description</th>
            {/* Internal type breakdown and who entered each line are
                company-internal — Organisation Copy only, the same rule
                the customer email and PDF already follow. */}
            {isOrgCopy ? <th style={cell}>Type</th> : null}
            <th style={cellRight}>Quantity</th>
            <th style={cellRight}>Unit Price</th>
            <th style={cellRight}>Amount</th>
            {isOrgCopy ? <th style={cell}>Entered By</th> : null}
          </tr>
        </thead>
        <tbody>
          {lines.map((line, i) => (
            <tr key={line.id} style={{ borderBottom: '1px solid #E2E8F0' }}>
              <td style={cell}>{i + 1}</td>
              <td style={cell}>{line.description}</td>
              {isOrgCopy ? <td style={cell}>{line.typeLabel}</td> : null}
              <td style={cellRight}>
                {line.quantity}
                {line.unitOfMeasure ? ` ${pluralizeWord(line.quantity, line.unitOfMeasure)}` : ''}
              </td>
              <td style={cellRight}>{line.unitPrice !== null ? formatNaira(line.unitPrice) : '—'}</td>
              <td style={cellRight}>{line.amount !== null ? formatNaira(line.amount) : '—'}</td>
              {isOrgCopy ? <td style={cell}>{line.enteredBy ?? '—'}</td> : null}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: '1.5px solid #0F172A' }}>
            <td style={{ ...cell, fontWeight: 700 }} colSpan={columnCount}>
              {pluralize(lines.length, 'Item')}
            </td>
          </tr>
        </tfoot>
      </table>

      <table role="presentation" style={{ width: '100%', borderCollapse: 'collapse', marginTop: '12px', fontSize: '12px' }}>
        <tbody>
          {isOrgCopy
            ? typeSubtotals.map((t) => (
                <tr key={t.key}>
                  <td style={{ padding: '3px 0', color: '#475569', width: '60%' }}>{typeLabels[t.key] ?? t.key} subtotal</td>
                  <td style={{ padding: '3px 0', textAlign: 'right' }}>{formatNaira(t.amount)}</td>
                </tr>
              ))
            : (
                <>
                  {servicesTotal > 0 ? (
                    <tr>
                      <td style={{ padding: '3px 0', color: '#475569', width: '60%' }}>Parts &amp; Services</td>
                      <td style={{ padding: '3px 0', textAlign: 'right' }}>{formatNaira(servicesTotal)}</td>
                    </tr>
                  ) : null}
                  {labourTotal > 0 ? (
                    <tr>
                      <td style={{ padding: '3px 0', color: '#475569' }}>Labour</td>
                      <td style={{ padding: '3px 0', textAlign: 'right' }}>{formatNaira(labourTotal)}</td>
                    </tr>
                  ) : null}
                  {sundryTotal > 0 ? (
                    <tr>
                      <td style={{ padding: '3px 0', color: '#475569' }}>Sundry</td>
                      <td style={{ padding: '3px 0', textAlign: 'right' }}>{formatNaira(sundryTotal)}</td>
                    </tr>
                  ) : null}
                </>
              )}
          <tr style={{ borderTop: '1.5px solid #0F172A' }}>
            <td style={{ padding: '6px 0', fontSize: '14px', fontWeight: 700 }}>Total Estimate</td>
            <td style={{ padding: '6px 0', fontSize: '14px', fontWeight: 700, textAlign: 'right' }}>{formatNaira(total)}</td>
          </tr>
          {isOrgCopy ? (
            <>
              <tr>
                <td style={{ padding: '3px 0', color: '#475569' }}>Total Paid</td>
                <td style={{ padding: '3px 0', textAlign: 'right', fontWeight: 700 }}>{formatNaira(totalPaid)}</td>
              </tr>
              <tr>
                <td style={{ padding: '3px 0', color: '#475569' }}>Balance Remaining</td>
                <td style={{ padding: '3px 0', textAlign: 'right', fontWeight: 700 }}>{formatNaira(balance)}</td>
              </tr>
            </>
          ) : null}
        </tbody>
      </table>

      <div style={{ marginTop: '16px', backgroundColor: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: '8px', padding: '12px 16px' }}>
        <div style={{ fontSize: '10px', fontWeight: 700, color: '#B45309', letterSpacing: '0.04em' }}>
          MINIMUM DEPOSIT REQUIRED ({Math.round(minimumDepositFraction * 100)}%)
        </div>
        <div style={{ fontSize: '16px', fontWeight: 700, marginTop: '2px' }}>{formatNaira(minimumDeposit)}</div>
        <div style={{ fontSize: '11px', color: '#78350F', marginTop: '4px' }}>Work begins once this deposit is received and confirmed.</div>
      </div>

      <div style={{ marginTop: '14px', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '12px 16px', fontSize: '12px' }}>
        <SectionTitle>HOW TO PAY</SectionTitle>
        <div style={{ fontWeight: 700 }}>Option 1 — Bank transfer</div>
        <div>Bank: {bank.bankName}</div>
        <div>Account Name: {bank.accountName}</div>
        <div>Account Number: {bank.accountNumber}</div>
        <div>Payment Reference: {paymentReference}</div>
        <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>Please use this reference so we can match your payment to this record.</div>
        <div style={{ borderTop: '1px solid #E2E8F0', marginTop: '8px', paddingTop: '8px' }}>
          <div style={{ fontWeight: 700 }}>Option 2 — Pay in person</div>
          <div>Pay the cashier at our {branch.name} office; they&apos;ll confirm your payment on our system.</div>
        </div>
      </div>

      {isOrgCopy ? (
        <>
          <div style={{ marginTop: '20px' }}>
            <SectionTitle>APPROVALS</SectionTitle>
            <table role="presentation" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
              <tbody>
                <tr>
                  <td style={{ padding: '2px 0', color: '#475569', width: '30%' }}>Opened</td>
                  <td style={{ padding: '2px 0' }}>{people.openedBy ?? '—'} — {formatDateTime(people.openedAt)}</td>
                </tr>
                <tr>
                  <td style={{ padding: '2px 0', color: '#475569' }}>Validated by supervisor</td>
                  <td style={{ padding: '2px 0' }}>
                    {approvals.validatedBy ?? '—'}
                    {approvals.validatedAt ? ` — ${formatDateTime(approvals.validatedAt)}` : ''}
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: '2px 0', color: '#475569' }}>Approved by manager</td>
                  <td style={{ padding: '2px 0' }}>
                    {approvals.managerApprovedBy ?? '—'}
                    {approvals.managerApprovedAt ? ` — ${formatDateTime(approvals.managerApprovedAt)}` : ''}
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: '2px 0', color: '#475569' }}>Customer notified</td>
                  <td style={{ padding: '2px 0' }}>{approvals.customerNotifiedAt ? formatDateTime(approvals.customerNotifiedAt) : 'Not yet'}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: '16px' }}>
            <SectionTitle>PAYMENT RECORD</SectionTitle>
            {payments.length === 0 ? (
              <div style={{ fontSize: '11px', color: '#64748B' }}>No payments recorded yet.</div>
            ) : (
              <table role="presentation" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td style={{ padding: '2px 0', color: '#475569', width: '30%' }}>{formatDateTime(p.recordedAt)}</td>
                      <td style={{ padding: '2px 0' }}>
                        {PAYMENT_METHOD_LABEL[p.method] ?? p.method} — {formatNaira(p.amount)} — recorded by {p.recordedBy}
                        {p.notes ? ` — ${p.notes}` : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div style={{ marginTop: '16px' }}>
            <SectionTitle>ESTIMATE AUDIT TRAIL</SectionTitle>
            {auditEntries.length === 0 ? (
              <div style={{ fontSize: '11px', color: '#64748B' }}>No estimate activity recorded.</div>
            ) : (
              <table role="presentation" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                <tbody>
                  {auditEntries.map((e) => {
                    const detail = auditDetail(e, typeLabels);
                    return (
                      <tr key={e.id} style={{ borderBottom: '1px solid #F1F5F9', verticalAlign: 'top' }}>
                        <td style={{ padding: '3px 0', color: '#475569', width: '30%' }}>{formatDateTime(e.createdAt)}</td>
                        <td style={{ padding: '3px 0' }}>
                          <span style={{ fontWeight: 600 }}>{ESTIMATE_AUDIT_LABEL[e.action] ?? e.action}</span>
                          {e.user ? ` — ${e.user.fullName}` : ''}
                          {detail ? <div style={{ color: '#64748B' }}>{detail}</div> : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      ) : null}

      <SignatureBlock
        issuerLabel="Approved By (Workshop)"
        issuerName={approvals.managerApprovedBy ?? approvals.validatedBy}
        collectorLabel="Customer Acceptance"
        collectorName={null}
      />

      <DocumentFooter organisation={organisation} />
    </div>
  );
}
