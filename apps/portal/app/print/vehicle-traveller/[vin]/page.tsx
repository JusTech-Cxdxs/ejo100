import { PrintOnLoad } from '@/components/print/PrintOnLoad';
import { DocumentHeader, DocumentFooter } from '@/components/print/DocumentHeader';
import { QrCode, Code128 } from '@/components/VehicleCodes';
import { loadVehiclePrint, PrintRefusal, PrintStamp } from '@/components/print/VehiclePrint';
import { portalBaseUrl } from '@/lib/portal-url';
import { formatDateOnly } from '@/lib/utils/format-date';

export const dynamic = 'force-dynamic';

const cell: React.CSSProperties = { border: '1px solid #CBD5E1', padding: '4px 6px', fontSize: '10.5px', verticalAlign: 'top' };
const head: React.CSSProperties = { ...cell, background: '#F1F5F9', fontWeight: 700, color: '#334155', textAlign: 'left' };
const day = (s: string) => formatDateOnly(new Date(`${s}T12:00:00Z`));

/**
 * The traveller sheet: one A4 page that goes down the line with the vehicle.
 * Its label codes at the top (scan to open the vehicle), then every stage —
 * kit arrival and QC, each station, QA, PDI, yard — with what is already
 * recorded and blank lines to sign as the vehicle moves on. For the plant:
 * inspectors' names appear here, never on customer papers.
 */
export default async function TravellerSheet({ params }: { params: Promise<{ vin: string }> }) {
  const { vin } = await params;
  const r = await loadVehiclePrint(vin, 'traveller');
  if (!r.ok) return <PrintRefusal message={r.message} />;
  const { p, scanUrl, printed, organisation, branch } = r;
  const stages = p.stages.filter((s) => s.key !== 'sale');
  return (
    <div style={{ maxWidth: '780px', margin: '0 auto', padding: '24px', fontFamily: 'Arial, Helvetica, sans-serif', color: '#0F172A' }}>
      <PrintOnLoad />
      <style>{'@page { size: A4; margin: 12mm } tr { break-inside: avoid }'}</style>
      <DocumentHeader organisation={organisation} branch={branch} logoUrl={`${portalBaseUrl()}/images/logo/logo.png`} documentTitle="Vehicle Traveller Sheet" referenceNumber={p.vin} statusLabel={p.now ? `Now: ${p.now}` : undefined} accentColor="#16A34A" />
      <div style={{ display: 'flex', gap: '16px', alignItems: 'center', justifyContent: 'space-between', marginTop: '14px', padding: '10px', border: '1px solid #CBD5E1' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '3px 10px', fontSize: '12px' }}>
          <b>VIN</b><span style={{ fontFamily: 'ui-monospace, Menlo, Consolas, monospace', letterSpacing: '0.05em' }}>{p.vin}</span>
          <b>Model</b><span>{p.description ?? '—'}</span>
          <b>Engine no.</b><span>{p.vehicle?.engineNumber ?? '—'}</span>
          <b>Plate</b><span>{p.vehicle?.plate ?? '—'}</span>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <Code128 value={p.vin} width="62mm" height="12mm" label={`Barcode of the VIN ${p.vin}`} />
          <QrCode value={scanUrl} size="26mm" label={`QR code: opens the page of vehicle ${p.vin}`} />
        </div>
      </div>
      {stages.map((s) => (
        <table key={s.key} style={{ width: '100%', borderCollapse: 'collapse', marginTop: '12px' }}>
          <thead>
            <tr><th colSpan={5} style={{ ...head, background: '#E8F5EC', fontSize: '11.5px' }}>{s.label}</th></tr>
            <tr><th style={{ ...head, width: '30%' }}>Station / check</th><th style={{ ...head, width: '13%' }}>Date</th><th style={{ ...head, width: '12%' }}>Result</th><th style={{ ...head, width: '22%' }}>Done by</th><th style={head}>Signature / notes</th></tr>
          </thead>
          <tbody>
            {s.entries.map((e) => (
              <tr key={e.id}><td style={cell}>{e.stage ?? '—'}</td><td style={cell}>{day(e.date)}</td><td style={cell}>{e.result ?? ''}</td><td style={cell}>{e.inspector ?? ''}</td><td style={cell}>{[e.reference, e.notes].filter(Boolean).join(' · ')}</td></tr>
            ))}
            {Array.from({ length: Math.max(1, (s.key === 'station' ? 6 : 2) - s.entries.length) }, (_, i) => (
              <tr key={`blank-${i}`}><td style={{ ...cell, height: '20px' }} /><td style={cell} /><td style={cell} /><td style={cell} /><td style={cell} /></tr>
            ))}
          </tbody>
        </table>
      ))}
      <p style={{ marginTop: '10px', fontSize: '10px', color: '#475569' }}>Rows already filled come from EJO (the plant’s registers). Write new checks on the blank lines; they are entered in EJO at the end of the shift. One label per vehicle: the codes above are the vehicle’s own. <PrintStamp printed={printed}>Printed {formatDateOnly(new Date())}</PrintStamp></p>
      <DocumentFooter organisation={organisation} />
    </div>
  );
}
