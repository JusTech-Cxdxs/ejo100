import { notFound } from 'next/navigation';
import { getExitPass } from '@/lib/actions/security';
import { getOrganisation } from '@/lib/actions/organisation';
import { PrintOnLoad } from '@/components/print/PrintOnLoad';
import { PassSheet, PassLine } from '@/components/print/PassSheet';
import { EXIT_PASS_STATUS_LABEL } from '@/lib/security-rules';
import { formatDateOnly, formatDateTime } from '@/lib/utils/format-date';

/** The Employee Exit Pass — the paper form, printed from the record. */
export default async function ExitPassPrint({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [p, org] = await Promise.all([getExitPass(id), getOrganisation()]);
  if (!p) notFound();
  const valid = ['APPROVED', 'OUT', 'RETURNED', 'CLOSED'].includes(p.status);
  const box = (on: boolean) => `[ ${on ? '✓' : ' '} ]`;
  return (
    <>
      <PrintOnLoad />
      <PassSheet
        copies={['Organisation copy', 'Holder copy']}
        orgName={org?.name ?? 'Kewalram Chanrai Group'}
        subName={p.branch.name}
        title="Employee Exit Pass"
        note="NOTE: The Security Officers will not permit or allow any Employee on duty to go out during working hour(s) without the Employee Exit pass approval."
      >
        <div style={{ textAlign: 'center', fontWeight: 700, marginBottom: '4px' }}>{p.passNumber}{valid ? '' : ` — NOT VALID (${EXIT_PASS_STATUS_LABEL[p.status]})`}</div>
        <PassLine label="Date" value={formatDateOnly(p.createdAt)} />
        {p.people.map((x, i) => (
          <div key={x.id} style={{ marginTop: i ? '6px' : 0, paddingTop: i ? '4px' : 0, borderTop: i ? '1px dashed #94A3B8' : 'none' }}>
            <PassLine label="Employee ID" value={x.employeeId ?? (x.userId ? '—' : 'Not on staff')} />
            <PassLine label="Employee Name" value={x.name} />
            <PassLine label="Designation" value={x.designation} />
            <PassLine label="Department" value={x.department} />
          </div>
        ))}
        <PassLine label="Reason" value={p.reason} />
        <div style={{ display: 'flex', justifyContent: 'space-between', margin: '4px 0' }}>
          <span>{box(p.returning)} Return</span>
          <span>{box(!p.returning)} No Return</span>
        </div>
        <PassLine label="Time out" value={p.gateOutAt ? formatDateTime(p.gateOutAt) : p.expectedOutAt ? `(planned) ${formatDateTime(p.expectedOutAt)}` : null} />
        <PassLine label="Time in" value={p.gateInAt ? formatDateTime(p.gateInAt) : p.returning && p.expectedReturnAt ? `(expected) ${formatDateTime(p.expectedReturnAt)}` : null} />
        <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ borderBottom: '1px dotted #64748B', minHeight: '1.3em', fontWeight: 600 }}>{p.headApprovedBy?.fullName ?? ''}</div>
            <div style={{ fontSize: '0.85em' }}>Authorized by<br />(Department Head)</div>
            {p.headApprovedAt ? <div style={{ fontSize: '0.8em', color: '#475569' }}>{formatDateTime(p.headApprovedAt)}</div> : null}
          </div>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ borderBottom: '1px dotted #64748B', minHeight: '1.3em', fontWeight: 600 }}>{p.managerApprovedBy?.fullName ?? ''}</div>
            <div style={{ fontSize: '0.85em' }}>Approved by<br />(Manager)</div>
            {p.managerApprovedAt ? <div style={{ fontSize: '0.8em', color: '#475569' }}>{formatDateTime(p.managerApprovedAt)}</div> : null}
          </div>
        </div>
      </PassSheet>
    </>
  );
}
