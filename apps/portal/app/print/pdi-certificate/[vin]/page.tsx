import { PrintOnLoad } from '@/components/print/PrintOnLoad';
import { DocumentHeader, DocumentFooter } from '@/components/print/DocumentHeader';
import { QrCode, Code128 } from '@/components/VehicleCodes';
import { loadVehiclePrint, PrintRefusal, PrintStamp } from '@/components/print/VehiclePrint';
import { pdiVerdict } from '@/lib/vehicle-life';
import { portalBaseUrl } from '@/lib/portal-url';
import { formatDateOnly } from '@/lib/utils/format-date';

export const dynamic = 'force-dynamic';

const day = (s: string) => formatDateOnly(new Date(`${s}T12:00:00Z`));
const cell: React.CSSProperties = { border: '1px solid #CBD5E1', padding: '5px 8px', fontSize: '11px' };

/**
 * The PDI certificate the customer receives with the vehicle: the vehicle,
 * its label codes, each PDI check and its result, and the verdict. It
 * certifies only when every check's latest result is a pass; otherwise it
 * prints plainly as "not a certificate". No staff names: the department signs.
 */
export default async function PdiCertificate({ params }: { params: Promise<{ vin: string }> }) {
  const { vin } = await params;
  const r = await loadVehiclePrint(vin, 'pdi-certificate');
  if (!r.ok) return <PrintRefusal message={r.message} />;
  const { p, scanUrl, printed, organisation, branch } = r;
  // A PDI recorded on screen decides (passed only once a second person accepted it, SAP usage decision A);
  // otherwise the plant's PDI register rows do.
  const day0 = (d: Date) => d.toISOString().slice(0, 10);
  const v = p.pdi
    ? { state: p.pdi.status === 'PASSED' ? 'passed' as const : 'not-passed' as const, date: day0(p.pdi.at), checks: p.pdi.items.map((it, i) => ({ id: String(i), stage: `${it.section}: ${it.label}`, result: it.result === 'OK' ? 'OK' : it.result === 'NOT_OK' ? 'Not OK' : it.result === 'NA' ? 'N/A' : '—', tone: it.result === 'OK' || it.result === 'NA' ? 'pass' as const : 'fail' as const, date: day0(p.pdi!.at) })) }
    : pdiVerdict(p.stages);
  const passed = v.state === 'passed';
  return (
    <div style={{ maxWidth: '780px', margin: '0 auto', padding: '32px 24px', fontFamily: 'Arial, Helvetica, sans-serif', color: '#0F172A', position: 'relative' }}>
      <PrintOnLoad />
      <style>{'@page { size: A4; margin: 14mm }'}</style>
      <DocumentHeader organisation={organisation} branch={branch} logoUrl={`${portalBaseUrl()}/images/logo/logo.png`} documentTitle="Pre-Delivery Inspection Certificate" referenceNumber={p.pdi ? `${p.vin} · ${p.pdi.number}` : p.vin} statusLabel={passed ? 'PDI passed' : v.state === 'not-recorded' ? 'PDI not recorded' : 'PDI not passed'} accentColor="#16A34A" />
      {!passed ? (
        <p role="alert" style={{ marginTop: '14px', padding: '10px 12px', border: '2px solid #B91C1C', color: '#B91C1C', fontWeight: 700, fontSize: '13px', textAlign: 'center' }}>
          NOT A CERTIFICATE — {v.state === 'not-recorded' ? 'no pre-delivery inspection is recorded for this vehicle yet.' : p.pdi && p.pdi.status !== 'PASSED' ? 'the pre-delivery inspection has not been completed and approved yet.' : 'the pre-delivery inspection has checks that have not passed.'}
        </p>
      ) : null}
      <div style={{ display: 'flex', gap: '16px', alignItems: 'center', justifyContent: 'space-between', marginTop: '18px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', fontSize: '13px' }}>
          <b>VIN</b><span style={{ fontFamily: 'ui-monospace, Menlo, Consolas, monospace', letterSpacing: '0.05em' }}>{p.vin}</span>
          <b>Model</b><span>{p.description ?? '—'}</span>
          <b>Engine no.</b><span>{p.vehicle?.engineNumber ?? '—'}</span>
          <b>Plate</b><span>{p.vehicle?.plate ?? '—'}</span>
          <b>Inspected</b><span>{v.date ? day(v.date) : '—'}</span>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <Code128 value={p.vin} width="60mm" height="12mm" label={`Barcode of the VIN ${p.vin}`} />
          <QrCode value={scanUrl} size="26mm" label={`QR code of vehicle ${p.vin}`} />
        </div>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '18px' }}>
        <thead><tr><th style={{ ...cell, background: '#F1F5F9', textAlign: 'left' }}>Check</th><th style={{ ...cell, background: '#F1F5F9', textAlign: 'left', width: '18%' }}>Result</th><th style={{ ...cell, background: '#F1F5F9', textAlign: 'left', width: '18%' }}>Date</th></tr></thead>
        <tbody>
          {v.checks.length ? v.checks.map((c) => (
            <tr key={c.id}><td style={cell}>{c.stage ?? 'Pre-delivery inspection'}</td><td style={{ ...cell, fontWeight: 700, color: c.tone === 'pass' ? '#15803D' : '#B91C1C' }}>{c.result ?? '—'}</td><td style={cell}>{day(c.date)}</td></tr>
          )) : <tr><td colSpan={3} style={{ ...cell, color: '#475569' }}>No checks recorded.</td></tr>}
        </tbody>
      </table>
      {passed ? <p style={{ marginTop: '14px', fontSize: '12px' }}>This vehicle has passed its pre-delivery inspection: every check above was completed and passed before handover.</p> : null}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px', marginTop: '40px', fontSize: '11px' }}>
        <div><div style={{ borderBottom: '1px solid #64748B', height: '28px' }} /><div style={{ marginTop: '4px' }}>For the PDI department — signature and stamp</div></div>
        <div><div style={{ borderBottom: '1px solid #64748B', height: '28px' }} /><div style={{ marginTop: '4px' }}>Received by the customer — signature and date</div></div>
      </div>
      <p style={{ marginTop: '14px', fontSize: '9px', color: '#475569' }}>The codes above identify this vehicle in {organisation.name}’s records; quote the VIN when you contact us. <PrintStamp printed={printed}>Printed {formatDateOnly(new Date())}</PrintStamp></p>
      <DocumentFooter organisation={organisation} />
    </div>
  );
}
