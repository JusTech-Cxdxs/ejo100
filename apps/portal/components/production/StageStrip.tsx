import { UNIT_STAGE_LABEL, UNIT_STAGE_ORDER, type UnitStageCode } from '@/lib/production-core';

/**
 * The traveller's stage strip: ASSEMBLY → SOFTWARE → LINE_CHECK → QA →
 * PACKING → RELEASED, with the current station highlighted. Rework and
 * scrap are shown as a note beside the strip, since they sit off the line.
 */
export function StageStrip({ stage, reworkCount }: { stage: UnitStageCode; reworkCount: number }) {
  const at = stage === 'REWORK' ? UNIT_STAGE_ORDER.indexOf('LINE_CHECK') : stage === 'SCRAPPED' ? -1 : UNIT_STAGE_ORDER.indexOf(stage);
  return (
    <div className="mb-6">
      <ol className="flex flex-wrap gap-2" aria-label="Stations">
        {UNIT_STAGE_ORDER.map((s, i) => {
          const done = at > i || stage === 'RELEASED';
          const current = at === i && stage !== 'RELEASED';
          return (
            <li
              key={s}
              aria-current={current ? 'step' : undefined}
              className={`rounded-[var(--ejo-radius-md)] border px-3 py-2 text-xs ${done ? 'border-[var(--ejo-success)]/40 bg-[var(--ejo-success)]/5 text-[var(--ejo-text)]' : current ? 'border-[var(--ejo-primary)] bg-[var(--ejo-primary)]/10 font-semibold text-[var(--ejo-primary)]' : 'border-[var(--ejo-border)] bg-[var(--ejo-surface)] text-[var(--ejo-text-muted)]'}`}
            >
              {done ? '✓ ' : `${i + 1}. `}{UNIT_STAGE_LABEL[s]}
            </li>
          );
        })}
      </ol>
      {stage === 'REWORK' ? <p className="mt-2 text-xs font-medium text-[var(--ejo-warning-text)]">In rework (time {reworkCount}) — back to the line check once it is done.</p> : null}
      {stage === 'SCRAPPED' ? <p className="mt-2 text-xs font-medium text-[var(--ejo-error)]">Scrapped — this unit left the line.</p> : null}
    </div>
  );
}
