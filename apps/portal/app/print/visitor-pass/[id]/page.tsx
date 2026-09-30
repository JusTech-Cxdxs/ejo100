import { notFound } from 'next/navigation';
import { getVisit } from '@/lib/actions/security';
import { getOrganisation } from '@/lib/actions/organisation';
import { PrintOnLoad } from '@/components/print/PrintOnLoad';
import { PassSheet, PassLine } from '@/components/print/PassSheet';
import { durationText, VEHICLE_TYPE_LABEL } from '@/lib/security-rules';
import { formatDateTime } from '@/lib/utils/format-date';

/** The visitor pass — issued at check-in, returned at the gate on exit. */
export default async function VisitorPassPrint({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [v, org] = await Promise.all([getVisit(id), getOrganisation()]);
  if (!v || !v.passNumber) notFound();
  const validUntil = v.checkedInAt ? new Date(new Date(v.checkedInAt).getTime() + v.expectedDurationMinutes * 60000) : null;
  return (
    <>
      <PrintOnLoad />
      <PassSheet copies={['Organisation copy', 'Visitor copy']} orgName={org?.name ?? 'Kewalram Chanrai Group'} subName={v.branch.name} title="VISITOR PASS" note="Wear this pass at all times while on the premises and return it to Security when you leave.">
        <div style={{ textAlign: 'center', fontWeight: 700, fontSize: '1.3em', marginBottom: '4px' }}>{v.passNumber}</div>
        <PassLine label="Visitor" value={v.visitorName} />
        <PassLine label="Company" value={v.company} />
        <PassLine label="Visiting" value={v.host.fullName} />
        <PassLine label="Purpose" value={v.purpose} />
        <PassLine label="Came by" value={v.vehicleType === 'ON_FOOT' ? 'On foot' : `${VEHICLE_TYPE_LABEL[v.vehicleType] ?? 'Vehicle'} ${v.vehiclePlate ?? ''}`} />
        <PassLine label="Time in" value={v.checkedInAt ? formatDateTime(v.checkedInAt) : null} />
        <PassLine label="Valid until" value={validUntil ? `${formatDateTime(validUntil)} (${durationText(v.expectedDurationMinutes)})` : null} />
        <PassLine label="Visit no." value={v.visitNumber} />
        {v.status === 'CHECKED_OUT' ? <div style={{ textAlign: 'center', fontWeight: 700, marginTop: '6px' }}>CHECKED OUT {v.checkedOutAt ? formatDateTime(v.checkedOutAt) : ''} — PASS NO LONGER VALID</div> : null}
      </PassSheet>
    </>
  );
}
