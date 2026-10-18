import { guardAnyPage } from '@/lib/authz/server';
import { getLineBoard } from '@/lib/actions/production';
import { UNIT_ON_LINE, UNIT_STAGE_LABEL, type UnitStageCode } from '@/lib/production-core';
import { formatRelative } from '@/lib/utils/format-date';
import { LoadingLink } from '@/components/LoadingLink';
import { PageHeader, SectionCard, StatTile } from '@/components/ui';

/** Today's board: units per station, who is on them, and the rework queue. */
export default async function LineBoardPage() {
  await guardAnyPage(['production.view'], '/production/line');
  const board = await getLineBoard();
  const now = new Date();
  const columns = (UNIT_ON_LINE as UnitStageCode[]).filter((s) => s !== 'REWORK');
  return (
    <div className="w-full p-4 sm:p-8">
      <PageHeader icon="activity" title="Today's line board" back={{ href: '/production', label: 'Back to Production' }} description="Where every unit is right now and who is on it. Refresh for the latest." />
      <div className="ejo-stagger mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile icon="bolt" label="On the line" value={board.onLine} tone="info" />
        <StatTile icon="plus" label="Started today" value={board.startedToday} />
        <StatTile icon="check-circle" label="Released today" value={board.releasedToday} tone="success" />
        <StatTile icon="alert" label="Rework queue" value={board.rework.length} tone={board.rework.length ? 'warning' : 'neutral'} />
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {columns.map((s) => (
          <section key={s} className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4">
            <h2 className="flex items-center justify-between text-sm font-semibold text-[var(--ejo-text)]">{UNIT_STAGE_LABEL[s]}<span className="rounded-full bg-[var(--ejo-bg)] px-2 py-0.5 text-xs tabular-nums text-[var(--ejo-text-muted)]">{board.byStage[s].length}</span></h2>
            {board.byStage[s].length === 0 ? <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">Nothing here.</p> : (
              <ul className="mt-2 space-y-2">
                {board.byStage[s].map((u) => (
                  <li key={u.id} className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-bg)] px-3 py-2 text-xs">
                    <LoadingLink href={`/production/units/${u.id}`} className="font-mono font-medium text-[var(--ejo-primary)] hover:underline">{u.serialNumber}</LoadingLink>
                    <div className="text-[var(--ejo-text)]">{u.product.name}{u.configuration ? ` — ${u.configuration.name}` : ''}</div>
                    <div className="text-[var(--ejo-text-muted)]">{u.who ? `${u.who} · ` : ''}{formatRelative(u.updatedAt, now, { short: true })}{u.buildOrder ? ` · ${u.buildOrder.number}` : ''}</div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      <SectionCard icon="alert" title="Rework queue" description="Units that failed the line check or QA, what to fix, and who built them.">
        {board.rework.length === 0 ? <p className="text-sm text-[var(--ejo-text-muted)]">Nothing in rework.</p> : (
          <ul className="divide-y divide-[var(--ejo-border)] text-sm">
            {board.rework.map((u) => (
              <li key={u.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span><LoadingLink href={`/production/units/${u.id}`} className="font-mono font-medium text-[var(--ejo-primary)] hover:underline">{u.serialNumber}</LoadingLink> · {u.product.name}{u.reworkNotes ? <span className="block text-xs text-[var(--ejo-warning-text)]">{u.reworkNotes}</span> : null}</span>
                <span className="text-xs text-[var(--ejo-text-muted)]">rework ×{u.reworkCount}{u.reworkCount >= 2 ? ' · needs the Production Manager' : ''} · built by {u.assembledByName ?? '—'} · {formatRelative(u.updatedAt, now, { short: true })}</span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {board.byStage.RELEASED.length || board.byStage.SCRAPPED.length ? (
        <p className="mt-4 text-xs text-[var(--ejo-text-muted)]">Today: {board.byStage.RELEASED.length} released to the store{board.byStage.SCRAPPED.length ? `, ${board.byStage.SCRAPPED.length} scrapped` : ''}.</p>
      ) : null}
    </div>
  );
}
