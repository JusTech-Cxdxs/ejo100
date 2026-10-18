import { allows, guardAnyPage } from '@/lib/authz/server';
import { getProductionSummary } from '@/lib/actions/production';
import { BUILD_STATUS_LABEL, UNIT_ON_LINE, UNIT_STAGE_LABEL, type BuildOrderStatusCode, type UnitStageCode } from '@/lib/production-core';
import { LoadingLink } from '@/components/LoadingLink';
import { HeaderAction, NavCard, PageHeader, StatTile, type IconName } from '@/components/ui';

const SECTIONS: { name: string; href: string; desc: string; icon: IconName; needs?: 'plan' }[] = [
  { name: 'Build orders', href: '/production/build-orders', icon: 'clipboard', desc: 'What the line has been asked to build, to stock or for an order: materials, release, units, completion.' },
  { name: 'Units', href: '/production/units', icon: 'bolt', desc: 'Every unit by serial, at its station on the line or released to the store.' },
  { name: "Today's line board", href: '/production/line', icon: 'activity', desc: 'Units per station right now, who is on them, and the rework queue.' },
  { name: 'New build order', href: '/production/build-orders/new', icon: 'plus', desc: 'Ask the line for N units of a configuration.', needs: 'plan' },
];

const OPEN: BuildOrderStatusCode[] = ['PLANNED', 'MATERIALS_CHECKED', 'RELEASED', 'IN_PROGRESS', 'QA', 'ON_HOLD'];

/** Production home: build orders by status, units at each stage today, QA pass rate this week. */
export default async function ProductionPage() {
  await guardAnyPage(['production.view'], '/production');
  const [s, canPlan] = await Promise.all([getProductionSummary(), allows('production.build_order.manage')]);
  return (
    <div className="w-full p-4 sm:p-8">
      <PageHeader
        hero
        live
        icon="bolt"
        eyebrow="Module · Production"
        title="Production"
        description="The assembly line: build orders, material issues, and every unit's traveller from assembly to release — so a serial can be traced to its components, image, tester and date forever."
        actions={canPlan ? <HeaderAction href="/production/build-orders/new">New build order</HeaderAction> : undefined}
      />

      <div className="ejo-stagger mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatTile icon="clipboard" label="Open build orders" value={s.open} href="/production/build-orders?status=open" />
        <StatTile icon="bolt" label="Units on the line" value={s.unitsOnLine} href="/production/units?stage=line" tone="info" />
        <StatTile icon="activity" label="Units moved today" value={s.movedToday} href="/production/line" />
        <StatTile icon="check-circle" label="QA pass rate this week" value={s.qaPassRate} suffix={s.qaPassRate === null ? '' : '%'} hint={s.qaTested ? `${s.qaTested} tested` : 'Nothing tested yet'} tone={s.qaPassRate !== null && s.qaPassRate < 90 ? 'warning' : 'success'} emphasis />
        <StatTile icon="alert" label="In rework" value={s.reworkQueue} href="/production/units?stage=REWORK" tone={s.reworkQueue ? 'warning' : 'neutral'} />
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <section className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
          <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Build orders by status</h2>
          <ul className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
            {OPEN.concat(['COMPLETED']).map((st) => (
              <li key={st}>
                <LoadingLink href={`/production/build-orders?status=${st}`} className="flex items-center justify-between rounded-[var(--ejo-radius-md)] bg-[var(--ejo-bg)] px-3 py-2 hover:ring-1 hover:ring-[var(--ejo-primary)]">
                  <span className="text-[var(--ejo-text-muted)]">{BUILD_STATUS_LABEL[st]}</span>
                  <span className="font-semibold tabular-nums text-[var(--ejo-text)]">{s.statuses[st] ?? 0}</span>
                </LoadingLink>
              </li>
            ))}
          </ul>
          {s.dueSoon ? <p className="mt-3 text-xs text-[var(--ejo-warning-text)]">{s.dueSoon} open build {s.dueSoon === 1 ? 'order is' : 'orders are'} due within 7 days.</p> : null}
        </section>
        <section className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
          <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Units at each station</h2>
          <ul className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
            {(UNIT_ON_LINE as UnitStageCode[]).map((st) => (
              <li key={st}>
                <LoadingLink href={`/production/units?stage=${st}`} className="flex items-center justify-between rounded-[var(--ejo-radius-md)] bg-[var(--ejo-bg)] px-3 py-2 hover:ring-1 hover:ring-[var(--ejo-primary)]">
                  <span className="text-[var(--ejo-text-muted)]">{UNIT_STAGE_LABEL[st]}</span>
                  <span className="font-semibold tabular-nums text-[var(--ejo-text)]">{s.stages[st] ?? 0}</span>
                </LoadingLink>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="ejo-stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {SECTIONS.filter((x) => x.needs !== 'plan' || canPlan).map((x) => <NavCard key={x.href} href={x.href} icon={x.icon} title={x.name} description={x.desc} />)}
      </div>
    </div>
  );
}
