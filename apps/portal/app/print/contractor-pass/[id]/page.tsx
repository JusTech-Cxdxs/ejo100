import { notFound } from 'next/navigation';
import { getContractorPass } from '@/lib/actions/security';
import { getOrganisation } from '@/lib/actions/organisation';
import { PrintOnLoad } from '@/components/print/PrintOnLoad';
import { PassSheet, PassLine } from '@/components/print/PassSheet';
import { CONTRACTOR_STATUS_LABEL, lagosDay } from '@/lib/security-rules';
import { formatDateTime } from '@/lib/utils/format-date';

/** Contractor pass — Organisation copy (gate file) or Contractor copy (the
 * team lead keeps it and shows it at the gate each day). */
export default async function ContractorPassPrint({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ variant?: string }> }) {
  const { id } = await params;
  const { variant } = await searchParams;
  const isOrg = variant !== 'client';
  const [p, org] = await Promise.all([getContractorPass(id), getOrganisation()]);
  if (!p) notFound();
  const valid = p.status === 'APPROVED' && p.state !== 'ENDED';
  return (
    <>
      <PrintOnLoad />
      <PassSheet copyLabel={isOrg ? 'Organisation copy' : 'Contractor copy'} orgName={org?.name ?? 'Kewalram Chanrai Group'} subName={p.branch.name} title="CONTRACTOR PASS" note={isOrg ? undefined : 'Show this pass at the gate on each working day. The team signs in and out with Security every day.'}>
        <div style={{ textAlign: 'center', fontWeight: 700, fontSize: '1.2em', marginBottom: '4px' }}>{p.passNumber}{valid ? '' : ` — NOT VALID (${CONTRACTOR_STATUS_LABEL[p.state]})`}</div>
        <PassLine label="Company" value={p.company} />
        <PassLine label="Work" value={p.work} />
        <PassLine label="Where" value={p.workArea} />
        <PassLine label={p.teamSize > 1 ? 'Lead' : 'Name'} value={p.leadName} />
        {p.teamSize > 1 ? <PassLine label={`Team (${p.teamSize})`} value={p.memberNames.join(', ')} /> : null}
        <PassLine label="Valid" value={`${lagosDay(p.validFrom)} to ${lagosDay(p.validUntil)}`} />
        <PassLine label="Hours" value="8 am – 5 pm" />
        <PassLine label="Approved by" value={p.managerApprovedBy ? `${p.managerApprovedBy.fullName} (Manager)` : null} />
        {isOrg ? (
          <>
            <PassLine label="Responsible" value={p.host.fullName} />
            <PassLine label="Phone" value={p.phone} />
            <PassLine label="Requested" value={`${p.requestedBy.fullName} · ${formatDateTime(p.createdAt)}`} />
          </>
        ) : null}
        <div style={{ marginTop: '12px', textAlign: 'center' }}>
          <div style={{ borderBottom: '1px dotted #64748B', minHeight: '1.6em' }} />
          <div style={{ fontSize: '0.85em' }}>Team lead — signature</div>
        </div>
      </PassSheet>
    </>
  );
}
