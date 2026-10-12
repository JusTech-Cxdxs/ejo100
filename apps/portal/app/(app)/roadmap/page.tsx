import Link from 'next/link';
import { ROADMAP, ROADMAP_GROUPS, type RoadmapModule } from '@/lib/roadmap';
import { RoadmapIcon } from '@/components/RoadmapIcon';

export const metadata = { title: 'Roadmap' };

function capabilities(m: RoadmapModule) {
  return m.phases.reduce((n, p) => n + p.items.length, 0);
}

/** Everything planned after Version 1, grouped by area, with the next phase first. */
export default function RoadmapPage() {
  let shown = 0;
  return (
    <div className="w-full max-w-6xl p-4 sm:p-8">
      <section className="ejo-roadmap-hero ejo-rise relative overflow-hidden rounded-[var(--ejo-radius-xl)] border border-[var(--ejo-border)] p-6 sm:p-10">
        <div className="ejo-orb pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-[var(--ejo-primary)]/20 blur-3xl" aria-hidden="true" />
        <p className="relative flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ejo-warning-text)]"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--ejo-warning)]" />Coming next</p>
        <h1 className="relative mt-3 max-w-2xl text-3xl font-bold leading-tight text-[var(--ejo-text)] sm:text-4xl">One platform for the whole enterprise.</h1>
        <p className="relative mt-3 max-w-2xl text-sm leading-relaxed text-[var(--ejo-text-muted)]">Version 1 runs the workshop, customers, store, warranty, security, scheduling and analytics. These are the modules planned next. Each builds on the records, roles and approvals already in place, so nothing is typed twice. The AI phase comes first.</p>
        <p className="relative mt-4 text-xs text-[var(--ejo-text-muted)]">{ROADMAP.length} modules planned · each page shows what it will do, how it will work and what it connects to</p>
      </section>

      {ROADMAP_GROUPS.map((g) => {
        const modules = ROADMAP.filter((m) => m.group === g.key);
        if (!modules.length) return null;
        return (
          <section key={g.key} className="mt-10" aria-labelledby={`group-${g.key}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id={`group-${g.key}`} className={`text-sm font-semibold uppercase tracking-[0.12em] ${g.key === 'next' ? 'text-[var(--ejo-primary)]' : 'text-[var(--ejo-text-muted)]'}`}>{g.name}</h2>
              <p className="text-xs text-[var(--ejo-text-muted)]">{g.blurb}</p>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {modules.map((m) => {
                const delay = Math.min(shown++, 12) * 40;
                return (
                  <Link key={m.key} href={`/roadmap/${m.key}`} className={`ejo-rise group flex flex-col rounded-[var(--ejo-radius-lg)] border bg-[var(--ejo-surface)] p-5 transition-[transform,border-color,box-shadow] hover:-translate-y-0.5 hover:border-[var(--ejo-primary)]/50 hover:shadow-lg ${m.next ? 'border-[var(--ejo-primary)]/40' : 'border-[var(--ejo-border)]'}`} style={{ animationDelay: `${delay}ms` }}>
                    <div className="flex items-center justify-between">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)]"><RoadmapIcon icon={m.icon} size={20} /></span>
                      {m.next ? (
                        <span className="rounded-full border border-[var(--ejo-primary)]/50 bg-[var(--ejo-primary)]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--ejo-primary)]">Next</span>
                      ) : (
                        <span className="rounded-full border border-[var(--ejo-warning)]/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--ejo-warning-text)]">Planned</span>
                      )}
                    </div>
                    <h3 className="mt-4 text-base font-semibold text-[var(--ejo-text)]">{m.name}</h3>
                    <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">{m.tagline}</p>
                    <p className="mt-auto pt-4 text-xs font-medium text-[var(--ejo-primary)] group-hover:underline">{capabilities(m)} capabilities planned →</p>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
