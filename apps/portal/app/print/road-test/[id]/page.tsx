import { notFound } from 'next/navigation';
import { getRoadTest } from '@/lib/actions/security';
import { getOrganisation } from '@/lib/actions/organisation';
import { PrintOnLoad } from '@/components/print/PrintOnLoad';
import { PassSheet, PassLine } from '@/components/print/PassSheet';
import { ROAD_TEST_STATUS_LABEL, durationText } from '@/lib/security-rules';
import { formatDateTime } from '@/lib/utils/format-date';

/** Road Test Permit — Organisation copy (gate file) or Driver copy (kept in
 * the vehicle while out). */
export default async function RoadTestPrint({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ variant?: string }> }) {
  const { id } = await params;
  const { variant } = await searchParams;
  const isOrg = variant !== 'client';
  const [r, org] = await Promise.all([getRoadTest(id), getOrganisation()]);
  if (!r) notFound();
  const valid = ['APPROVED', 'OUT', 'RETURNED'].includes(r.status);
  const km = r.startOdometer !== null && r.endOdometer !== null ? r.endOdometer - r.startOdometer : null;
  return (
    <>
      <PrintOnLoad />
      <PassSheet copyLabel={isOrg ? 'Organisation copy' : 'Driver copy'} orgName={org?.name ?? 'Kewalram Chanrai Group'} subName={r.branch.name} title="ROAD TEST PERMIT" note={isOrg ? undefined : 'Keep this permit in the vehicle during the road test and return through the gate by the expected time.'}>
        <div style={{ textAlign: 'center', fontWeight: 700, fontSize: '1.2em', marginBottom: '4px' }}>{r.permitNumber}{valid ? '' : ` — NOT VALID (${ROAD_TEST_STATUS_LABEL[r.status]})`}</div>
        <PassLine label="Vehicle" value={[r.vehicle.make, r.vehicle.model].filter(Boolean).join(' ') || 'Vehicle'} />
        <PassLine label="Plate" value={r.vehicle.plateNumber} />
        <PassLine label="Record" value={r.jobCard?.jobNumber ?? r.vehicleService?.serviceNumber ?? null} />
        <PassLine label="Driver" value={r.driver.fullName} />
        <PassLine label="Checking" value={r.purpose} />
        <PassLine label="Route" value={r.route} />
        <PassLine label="Duration" value={durationText(r.expectedDurationMinutes)} />
        <PassLine label="Approved by" value={r.managerApprovedBy ? `${r.managerApprovedBy.fullName} (Manager)` : null} />
        <PassLine label="Time out" value={r.gateOutAt ? formatDateTime(r.gateOutAt) : null} />
        <PassLine label="Odometer out" value={r.startOdometer !== null ? `${r.startOdometer.toLocaleString('en-NG')} km` : null} />
        <PassLine label="Time in" value={r.gateInAt ? formatDateTime(r.gateInAt) : null} />
        <PassLine label="Odometer in" value={r.endOdometer !== null ? `${r.endOdometer.toLocaleString('en-NG')} km` : null} />
        {km !== null ? <PassLine label="Distance" value={`${km.toLocaleString('en-NG')} km`} /> : null}
        {isOrg ? (
          <>
            <PassLine label="Requested by" value={`${r.requestedBy.fullName} · ${formatDateTime(r.createdAt)}`} />
            {r.gateOutBy ? <PassLine label="Out recorded by" value={r.gateOutBy.fullName} /> : null}
            {r.gateInBy ? <PassLine label="In recorded by" value={r.gateInBy.fullName} /> : null}
            {r.returnNotes ? <PassLine label="Notes" value={r.returnNotes} /> : null}
          </>
        ) : null}
        <div style={{ marginTop: '12px', textAlign: 'center' }}>
          <div style={{ borderBottom: '1px dotted #64748B', minHeight: '1.6em' }} />
          <div style={{ fontSize: '0.85em' }}>Driver — signature</div>
        </div>
      </PassSheet>
    </>
  );
}
