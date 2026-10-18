import { SERVICE_STEPS, serviceStepIndex } from '@/lib/service-core';
import { formatDateOnly } from '@/lib/utils/format-date';

/** The job's steps strip: opened → assigned → diagnosed → repair → quality check → ready → returned. */
export function ServiceSteps({ job }: { job: { status: string; createdAt: Date; assignedAt: Date | null; diagnosedAt: Date | null; repairedAt: Date | null; qaAt: Date | null; returnedAt: Date | null; technicianName: string | null; qaByName: string | null; openedBy: { fullName: string } } }) {
  const at = serviceStepIndex(job.status);
  const cancelled = job.status === 'CANCELLED';
  const when: Record<string, { who?: string | null; at?: Date | null }> = {
    OPEN: { who: job.openedBy.fullName, at: job.createdAt },
    ASSIGNED: { who: job.technicianName, at: job.assignedAt },
    DIAGNOSED: { who: job.technicianName, at: job.diagnosedAt },
    REPAIRING: { who: job.technicianName, at: job.repairedAt },
    QA: { who: job.qaByName, at: job.qaAt },
    READY: { at: job.qaAt },
    RETURNED: { at: job.returnedAt },
  };
  return (
    <div className="mb-6 flex flex-wrap gap-2" aria-label="Progress">
      {SERVICE_STEPS.map((s, i) => {
        const done = !cancelled && (i < at || (i === at && ['RETURNED', 'CLOSED'].includes(job.status)));
        const current = !cancelled && i === at && !done;
        const info = when[s.status] ?? {};
        return (
          <div key={s.status} className={`rounded-[var(--ejo-radius-md)] border px-3 py-2 text-xs ${done ? 'border-[var(--ejo-success)]/40 bg-[var(--ejo-success)]/5' : current ? 'border-[var(--ejo-primary)] bg-[var(--ejo-primary)]/5' : 'border-[var(--ejo-border)] bg-[var(--ejo-surface)]'}`}>
            <p className="font-medium text-[var(--ejo-text)]">{done ? '✓' : `${i + 1}.`} {s.label}{current && job.status === 'AWAITING_PARTS' ? ' (awaiting parts)' : ''}</p>
            {(done || current) && info.who ? <p className="text-[var(--ejo-text-muted)]">{info.who}</p> : null}
            {(done || current) && info.at ? <p className="text-[var(--ejo-text-muted)]">{formatDateOnly(info.at)}</p> : null}
          </div>
        );
      })}
      {cancelled ? <div className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)]/40 bg-[var(--ejo-error)]/5 px-3 py-2 text-xs font-medium text-[var(--ejo-error)]">Cancelled</div> : null}
    </div>
  );
}
