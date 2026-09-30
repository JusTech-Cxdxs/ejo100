import { notFound } from 'next/navigation';
import { getVehicleGateExit } from '@/lib/actions/security';
import { getOrganisation } from '@/lib/actions/organisation';
import { PrintOnLoad } from '@/components/print/PrintOnLoad';
import { PassSheet, PassLine } from '@/components/print/PassSheet';
import { formatDateTime } from '@/lib/utils/format-date';

/** The gate slip for a vehicle released by the Workshop — the
 * organisation keeps one copy; the customer signs the acknowledgement. */
export default async function VehicleExitSlip({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ variant?: string }> }) {
  const { id } = await params;
  const { variant } = await searchParams;
  const isOrg = variant !== 'client';
  const [x, org] = await Promise.all([getVehicleGateExit(id), getOrganisation()]);
  if (!x) notFound();
  const rec = x.jobCard
    ? { number: x.jobCard.jobNumber, released: x.jobCard.checkedOutAt, collector: x.jobCard.collectedByName, customer: x.jobCard.customer.fullName }
    : x.vehicleService
      ? { number: x.vehicleService.serviceNumber, released: x.vehicleService.collectedAt, collector: x.vehicleService.collectedByName, customer: x.vehicleService.customer.fullName }
      : null;
  return (
    <>
      <PrintOnLoad />
      <PassSheet copyLabel={isOrg ? 'Organisation copy' : 'Customer copy'} orgName={org?.name ?? 'Kewalram Chanrai Group'} subName={x.branch.name} title="VEHICLE GATE PASS" note="This vehicle was released by the Workshop and checked out through the gate by Security.">
        <div style={{ textAlign: 'center', fontWeight: 700, fontSize: '1.2em', marginBottom: '4px' }}>{x.exitNumber}</div>
        <PassLine label="Vehicle" value={[x.vehicle.make, x.vehicle.model].filter(Boolean).join(' ') || 'Vehicle'} />
        <PassLine label="Plate" value={x.vehicle.plateNumber} />
        <PassLine label="VIN" value={x.vehicle.chassisNumber} />
        <PassLine label="Record" value={rec?.number ?? null} />
        <PassLine label="Customer" value={rec?.customer ?? null} />
        <PassLine label="Released" value={rec?.released ? formatDateTime(rec.released) : null} />
        <PassLine label="Collected by" value={x.driverName ?? rec?.collector ?? null} />
        <PassLine label="Left the gate" value={formatDateTime(x.exitedAt)} />
        {isOrg ? <PassLine label="Confirmed by" value={x.exitedBy.fullName} /> : null}
        {isOrg && x.notes ? <PassLine label="Notes" value={x.notes} /> : null}
        <div style={{ marginTop: '12px', textAlign: 'center' }}>
          <div style={{ borderBottom: '1px dotted #64748B', minHeight: '1.6em' }} />
          <div style={{ fontSize: '0.85em' }}>{isOrg ? 'Collected by — signature' : 'Vehicle received in good condition — signature'}</div>
        </div>
      </PassSheet>
    </>
  );
}
