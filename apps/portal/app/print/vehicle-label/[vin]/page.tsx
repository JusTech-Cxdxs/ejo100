import { PrintOnLoad } from '@/components/print/PrintOnLoad';
import { QrCode, Code128 } from '@/components/VehicleCodes';
import { loadVehiclePrint, PrintRefusal, PrintStamp } from '@/components/print/VehiclePrint';
import { formatDateOnly } from '@/lib/utils/format-date';

export const dynamic = 'force-dynamic';

/**
 * The vehicle's one label, on a sticker: windscreen (100 × 60 mm) or door
 * jamb (90 × 38 mm). The QR code opens the vehicle's page from a phone; the
 * Code 128 barcode holds the VIN for handheld scanners (bars at least
 * 0.24 mm wide on either size). Black on white; nothing else to scan.
 */
export default async function VehicleLabel({ params, searchParams }: { params: Promise<{ vin: string }>; searchParams: Promise<{ size?: string }> }) {
  const { vin } = await params;
  const { size } = await searchParams;
  const jamb = size === 'door-jamb';
  const r = await loadVehiclePrint(vin, jamb ? 'door-jamb' : 'windscreen');
  if (!r.ok) return <PrintRefusal message={r.message} />;
  const { p, scanUrl, printed, organisation } = r;
  const w = jamb ? 90 : 100;
  const h = jamb ? 38 : 60;
  return (
    <>
      <PrintOnLoad />
      <style>{`@page { size: ${w}mm ${h}mm; margin: 0 } html, body { margin: 0; background: #fff } .ejo-print-watermark { display: none }`}</style>
      <div data-label={jamb ? 'door-jamb' : 'windscreen'} style={{ width: `${w}mm`, height: `${h}mm`, boxSizing: 'border-box', padding: '2.5mm', display: 'grid', gridTemplateColumns: `${jamb ? 22 : 34}mm 1fr`, gridTemplateRows: jamb ? '1fr auto' : 'auto 1fr auto', columnGap: '2.5mm', fontFamily: 'Arial, Helvetica, sans-serif', color: '#000', background: '#fff', overflow: 'hidden', border: '0.2mm solid #000' }}>
        <div style={{ gridRow: jamb ? '1 / 2' : '1 / 3', alignSelf: 'center' }}>
          <QrCode value={scanUrl} size={`${jamb ? 22 : 34}mm`} label={`QR code: opens the page of vehicle ${p.vin}`} />
        </div>
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ fontSize: jamb ? '6pt' : '7pt', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{organisation.name}</div>
          <div style={{ fontSize: jamb ? '6pt' : '7pt', marginTop: '0.5mm' }}>{p.description ?? 'Vehicle'}{p.vehicle?.plate ? ` · ${p.vehicle.plate}` : ''}</div>
          <div style={{ fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: jamb ? '9pt' : '11pt', fontWeight: 700, letterSpacing: '0.06em', marginTop: '1mm' }}>{p.vin}</div>
          {!jamb ? <div style={{ fontSize: '6pt', marginTop: '1mm' }}>Scan the QR code with a phone to open this vehicle in EJO (signed in).</div> : null}
        </div>
        <div style={{ gridColumn: jamb ? '1 / 3' : '2 / 3', alignSelf: 'end' }}>
          <Code128 value={p.vin} width={`${jamb ? 80 : 60}mm`} height={jamb ? '7mm' : '11mm'} label={`Barcode of the VIN ${p.vin}`} showText={false} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5mm' }}>
            <span style={{ fontSize: '6pt', fontFamily: 'ui-monospace, Menlo, Consolas, monospace' }}>VIN</span>
            <PrintStamp printed={printed}>{formatDateOnly(new Date())}</PrintStamp>
          </div>
        </div>
      </div>
    </>
  );
}
