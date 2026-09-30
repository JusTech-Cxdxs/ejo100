import { notFound } from 'next/navigation';
import { getVisit } from '@/lib/actions/security';
import { getOrganisation } from '@/lib/actions/organisation';
import { PrintOnLoad } from '@/components/print/PrintOnLoad';
import { PassSheet, PassLine } from '@/components/print/PassSheet';
import { durationText, VEHICLE_TYPE_LABEL } from '@/lib/security-rules';
import { formatDateTime } from '@/lib/utils/format-date';

/** Visitor pass — Organisation copy (gate file, with internal details) or
 * Visitor copy (worn on the premises; no staff names). */
export default async function VisitorPassPrint({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ variant?: string }> }) {
  const { id } = await params;
  const { variant } = await searchParams;
  const isOrg = variant !== 'client';
  const [v, org] = await Promise.all([getVisit(id), getOrganisation()]);
  if (!v || !v.passNumber) notFound();
  const validUntil = v.checkedInAt ? new Date(new Date(v.checkedInAt).getTime() + v.expectedDurationMinutes * 60000) : null;
  return (
    <>
      <PrintOnLoad />
      <PassSheet copyLabel={isOrg ? 'Organisation copy' : 'Visitor copy'} orgName={org?.name ?? 'Kewalram Chanrai Group'} subName={v.branch.name} title="VISITOR PASS" note={isOrg ? undefined : 'Wear this pass at all times while on the premises and return it to Security when you leave.'}>
        <div style={{ textAlign: 'center', fontWeight: 700, fontSize: '1.3em', marginBottom: '4px' }}>{v.passNumber}</div>
        <PassLine label="Visitor" value={v.visitorName} />
        <PassLine label="Company" value={v.company} />
        <PassLine label="Visiting" value={v.host.fullName} />
        <PassLine label="Purpose" value={v.purpose} />
        <PassLine label="Came by" value={v.vehicleType === 'ON_FOOT' ? 'On foot' : `${VEHICLE_TYPE_LABEL[v.vehicleType] ?? 'Vehicle'} ${v.vehiclePlate ?? ''}`} />
        <PassLine label="Time in" value={v.checkedInAt ? formatDateTime(v.checkedInAt) : null} />
        <PassLine label="Valid until" value={validUntil ? `${formatDateTime(validUntil)} (${durationText(v.expectedDurationMinutes)})` : null} />
        {isOrg ? (
          <>
            <PassLine label="Visit no." value={v.visitNumber} />
            <PassLine label="Phone" value={v.phone} />
            <PassLine label="ID" value={[v.idType, v.idNumber].filter(Boolean).join(' ') || null} />
            <PassLine label="Checked in by" value={v.checkedInBy?.fullName} />
            <PassLine label="Received" value={v.receivedAt ? `${formatDateTime(v.receivedAt)}${v.receivedBy ? ` · ${v.receivedBy.fullName}` : ''}` : 'Not yet'} />
            {v.checkedOutAt ? <PassLine label="Time out" value={`${formatDateTime(v.checkedOutAt)}${v.checkedOutBy ? ` · ${v.checkedOutBy.fullName}` : ''}`} /> : null}
          </>
        ) : null}
        {v.status === 'CHECKED_OUT' ? <div style={{ textAlign: 'center', fontWeight: 700, marginTop: '6px' }}>CHECKED OUT — PASS NO LONGER VALID</div> : null}
      </PassSheet>
    </>
  );
}
