import { notFound } from 'next/navigation';
import { getRefund } from '@/lib/actions/refunds';
import { getOrganisation } from '@/lib/actions/organisation';
import { DocumentHeader, SignatureBlock, DocumentFooter } from '@/components/print/DocumentHeader';
import { PrintOnLoad } from '@/components/print/PrintOnLoad';
import { formatDateTime } from '@/lib/utils/format-date';

function naira(n: number): string {
  return `₦${n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: '10px', color: '#94A3B8', fontWeight: 600, letterSpacing: '0.02em' }}>{label}</div>
      <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A', marginTop: '1px' }}>{value}</div>
    </div>
  );
}

/**
 * Refund receipt — Organisation Copy by default, Customer Copy with
 * ?variant=client. One receipt per refund payment (RF-number); the
 * customer signs "Received By" on handover.
 */
export default async function PrintRefundPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ variant?: string }> }) {
  const { id } = await params;
  const { variant } = await searchParams;
  const isOrgCopy = variant !== 'client';
  const [refund, organisation] = await Promise.all([getRefund(id), getOrganisation()]);
  if (!refund || !organisation) notFound();
  const record = refund.jobCard ?? refund.vehicleService;
  if (!record) notFound();
  const recordLabel = refund.jobCard ? 'Job Card' : 'Vehicle Service';
  const recordNumber = refund.jobCard?.jobNumber ?? refund.vehicleService?.serviceNumber ?? '—';
  const paid = record.payments.reduce((s: number, p: { amount: unknown }) => s + Number(p.amount), 0);
  const refunded = record.refunds.reduce((s: number, r: { amount: unknown }) => s + Number(r.amount), 0);
  const remaining = Math.max(0, Math.round((paid - refunded) * 100) / 100);
  const vehicle = [record.vehicle.year, record.vehicle.make, record.vehicle.model].filter(Boolean).join(' ') || 'Vehicle';

  return (
    <div style={{ maxWidth: '780px', margin: '0 auto', padding: '32px 24px', fontFamily: 'Arial, Helvetica, sans-serif', color: '#0F172A' }}>
      <PrintOnLoad />
      <DocumentHeader
        organisation={organisation}
        branch={record.branch}
        logoUrl={`${process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://ejo100-portal.vercel.app'}/images/logo/logo.png`}
        documentTitle={isOrgCopy ? 'Refund Receipt — Organisation Copy' : 'Refund Receipt'}
        referenceNumber={refund.referenceNumber}
        statusLabel="Refunded"
        accentColor="#16A34A"
      />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px', marginTop: '20px' }}>
        <Field label="CUSTOMER" value={record.customer.fullName} />
        <Field label={recordLabel.toUpperCase()} value={recordNumber} />
        <Field label="VEHICLE" value={vehicle} />
        <Field label="PLATE NO." value={record.vehicle.plateNumber ?? '—'} />
        <Field label="AMOUNT REFUNDED" value={naira(Number(refund.amount))} />
        <Field label="PAID BY" value={refund.method === 'CASH' ? 'Cash' : 'Bank Transfer'} />
        <Field label="RECEIVED BY" value={refund.paidToName} />
        <Field label="DATE" value={formatDateTime(new Date(refund.recordedAt))} />
        {refund.notes ? <Field label="REFERENCE / NOTE" value={refund.notes} /> : null}
        <Field label="REASON" value={refund.reason} />
      </div>

      <table role="presentation" style={{ width: '100%', borderCollapse: 'collapse', marginTop: '20px', fontSize: '12px' }}>
        <tbody>
          <tr>
            <td style={{ padding: '4px 0', color: '#475569', width: '60%' }}>Total paid by the customer</td>
            <td style={{ padding: '4px 0', textAlign: 'right', fontWeight: 700 }}>{naira(paid)}</td>
          </tr>
          <tr>
            <td style={{ padding: '4px 0', color: '#475569' }}>Total refunded to date</td>
            <td style={{ padding: '4px 0', textAlign: 'right', fontWeight: 700 }}>{naira(refunded)}</td>
          </tr>
          <tr style={{ borderTop: '1.5px solid #0F172A' }}>
            <td style={{ padding: '6px 0', fontWeight: 700 }}>{remaining > 0 ? 'Still to be refunded' : 'Fully refunded'}</td>
            <td style={{ padding: '6px 0', textAlign: 'right', fontWeight: 700 }}>{naira(remaining)}</td>
          </tr>
        </tbody>
      </table>

      {isOrgCopy ? (
        <p style={{ marginTop: '16px', fontSize: '11px', color: '#475569' }}>
          Recorded by {refund.recordedBy.fullName} on {formatDateTime(new Date(refund.recordedAt))}. Authorised through the approved cancellation of {recordLabel} {recordNumber}.
        </p>
      ) : null}

      <SignatureBlock issuerLabel="Refunded By (Finance)" issuerName={refund.recordedBy.fullName} collectorLabel="Received By" collectorName={refund.paidToName} />
      <DocumentFooter organisation={organisation} />
    </div>
  );
}
