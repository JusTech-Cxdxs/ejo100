import Link from 'next/link';
import { notFound } from 'next/navigation';
import { guardAnyPage } from '@/lib/authz/server';
import { getCutover } from '@/lib/actions/data-exchange-cutover';
import { ENTITIES } from '@/lib/data-exchange/fields';
import { STEP_WORDS, type StepState } from '@/lib/data-exchange/cutover';
import { importStatus } from '@/lib/data-exchange/status';
import { formatDateTimeCompact } from '@/lib/utils/format-date';
import { PageHeader, SectionCard, StatusChip } from '@/components/ui';
import type { Tone } from '@/components/ui/tones';
import { CutoverSignOff, CutoverStepMark } from '@/components/data-exchange/CutoverActions';

export const dynamic = 'force-dynamic';

const TONE: Record<StepState, Tone> = { DONE: 'success', AWAITING_FINANCE: 'warning', AWAITING_APPROVAL: 'warning', IN_PROGRESS: 'info', UNDONE: 'neutral', NOT_NEEDED: 'neutral', NOT_STARTED: 'neutral' };
const nf = (n: number) => n.toLocaleString('en-NG');
const MARK_WORDS = { not_needed: 'Marked not needed', needed: 'Marked needed again', signed_off: 'Signed off as cut over', reopened: 'Reopened' } as const;

/** One branch's cut-over: each file in order, where it stands, the next one to do, and the sign-off. */
export default async function BranchCutoverPage({ params }: { params: Promise<{ branchId: string }> }) {
  await guardAnyPage(['dataexchange.import.run', 'dataexchange.import.approve'], '/data-exchange/cutover');
  const { branchId } = await params;
  const page = await getCutover(branchId);
  if (!page) notFound();
  const { branch, view, may, history } = page;
  return (
    <div className="w-full space-y-6 p-4 sm:p-8">
      <PageHeader icon="check-circle" back={{ href: '/data-exchange/cutover', label: 'Back to the cut-over checklist' }} eyebrow={branch.typeWords} title={`Cut-over: ${branch.name}`}
        description="Load the files in this order: each names what the one before brought in. Records of the whole organisation (staff, customers, vehicles, suppliers, warranties) are loaded once and count for every branch." />

      <SectionCard icon="check-circle" title={view.signedOff ? 'Cut over' : `${view.settled} of ${view.total} steps settled`}
        description={view.signedOff ? `Signed off by ${view.signedOff.by}, ${formatDateTimeCompact(view.signedOff.at)}. The checklist as it stood is kept with the sign-off in the audit trail.` : view.next ? `Next: ${ENTITIES[view.next].label}.` : view.blockers.length ? 'Waiting on the steps under way.' : 'Every step is settled: the branch can be signed off.'}>
        <div data-testid="cutover-summary" className="flex flex-wrap items-end justify-between gap-4">
          <div className="h-2 w-full max-w-sm overflow-hidden rounded-full bg-[var(--ejo-border)]" role="progressbar" aria-label={`${view.settled} of ${view.total} steps settled`} aria-valuemin={0} aria-valuemax={view.total} aria-valuenow={view.settled}>
            <div className="h-full bg-[var(--ejo-primary)]" style={{ width: `${view.total ? Math.round((view.settled / view.total) * 100) : 0}%` }} />
          </div>
          {may.signOff ? <CutoverSignOff branchId={branch.id} branchName={branch.name} ready={!view.blockers.length} signedOff={Boolean(view.signedOff)} /> : null}
        </div>
      </SectionCard>

      <ol className="space-y-3">
        {view.steps.map((s, i) => {
          const e = ENTITIES[s.entity];
          const loaded = s.state === 'DONE' || s.state === 'AWAITING_FINANCE';
          return (
            <li key={s.entity} data-testid="cutover-step" data-entity={s.entity} data-state={s.state}
              className={`rounded-[var(--ejo-radius-md)] border bg-[var(--ejo-surface)] p-4 ${view.next === s.entity && !view.signedOff ? 'border-[var(--ejo-primary)]' : 'border-[var(--ejo-border)]'}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--ejo-text)]"><span className="tabular-nums text-[var(--ejo-text-muted)]">{i + 1}.</span> {e.label}{s.essential ? '' : <span className="ml-1 text-xs font-normal text-[var(--ejo-text-muted)]">(if the branch has any)</span>}</p>
                  <p className="mt-0.5 text-xs text-[var(--ejo-text-muted)]">{s.why}{s.scope === 'organisation' ? ' Loaded once for the whole organisation.' : ''}</p>
                </div>
                <StatusChip label={STEP_WORDS[s.state]} tone={TONE[s.state]} />
              </div>
              {loaded ? <p className="mt-2 text-xs text-[var(--ejo-text)]">{nf(s.added)} added{s.filled ? ` · ${nf(s.filled)} filled in` : ''}{s.loadedAt ? ` · last loaded ${formatDateTimeCompact(s.loadedAt)}` : ''}</p> : null}
              {s.notNeeded ? <p className="mt-2 text-xs text-[var(--ejo-text)]">Not needed: “{s.notNeeded.reason}” — {s.notNeeded.by}, {formatDateTimeCompact(s.notNeeded.at)}</p> : null}
              {s.waitingFor ? <p className="mt-2 text-xs text-[var(--ejo-warning)]">Load the {ENTITIES[s.waitingFor].plural} first: each {e.noun} is linked to its {ENTITIES[s.waitingFor].noun}.</p> : null}
              {s.imports.length ? (
                <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                  {s.imports.map((j) => <Link key={j.id} href={`/data-exchange/imports/${j.id}`} className="font-medium text-[var(--ejo-primary)] hover:underline">{j.number} · {importStatus(j.status).label}</Link>)}
                </p>
              ) : null}
              {!view.signedOff ? (
                <div className="mt-3 flex flex-wrap items-start gap-2">
                  {may.run && !loaded && s.state !== 'AWAITING_APPROVAL' && s.state !== 'IN_PROGRESS' && s.state !== 'NOT_NEEDED' ? <Link href={`/data-exchange/new?entity=${s.entity}`} className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">Import {e.plural}</Link> : null}
                  {!loaded ? <a href={`/data-exchange/templates/${s.entity}`} className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-1.5 text-xs font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]">Excel template</a> : null}
                  {may.mark && (s.state === 'NOT_STARTED' || s.state === 'UNDONE' || s.state === 'NOT_NEEDED') ? <CutoverStepMark branchId={branch.id} entity={s.entity} label={e.plural} notNeeded={s.state === 'NOT_NEEDED'} /> : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>

      {history.length ? (
        <SectionCard icon="history" title="History" description="Every mark and sign-off, newest first (from the audit trail; nothing is ever edited).">
          <ul className="space-y-1 text-sm">
            {history.map((h, i) => (
              <li key={i} className="text-[var(--ejo-text)]">
                <span className="text-[var(--ejo-text-muted)]">{formatDateTimeCompact(h.at)}</span> · {MARK_WORDS[h.action]}{h.entity && ENTITIES[h.entity as keyof typeof ENTITIES] ? `: ${ENTITIES[h.entity as keyof typeof ENTITIES].label}` : ''}{h.reason ? ` — “${h.reason}”` : ''} · {h.by}
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}
    </div>
  );
}
