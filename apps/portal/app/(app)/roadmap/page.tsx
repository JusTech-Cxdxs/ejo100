import Link from 'next/link';
import { ROADMAP } from '@/lib/roadmap';
import { RoadmapIcon } from '@/components/RoadmapIcon';

export const metadata = { title: 'Roadmap' };

/** Everything planned after Version 1, at a glance. */
export default function RoadmapPage() {
  return (
    <div className="w-full max-w-6xl p-4 sm:p-8">
      <section className="ejo-roadmap-hero ejo-rise relative overflow-hidden rounded-[var(--ejo-radius-xl)] border border-[var(--ejo-border)] p-8 sm:p-10">
        <div className="ejo-orb pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-[var(--ejo-primary)]/20 blur-3xl" aria-hidden="true" />
        <p className="relative flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ejo-warning)]"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--ejo-warning)]" />Coming next</p>
        <h1 className="relative mt-3 max-w-2xl text-3xl font-bold leading-tight text-[var(--ejo-text)] sm:text-4xl">One platform for the whole enterprise.</h1>
        <p className="relative mt-3 max-w-2xl text-sm leading-relaxed text-[var(--ejo-text-muted)]">Version 1 runs the workshop, store, warranty, security, scheduling and analytics. These are the modules planned next — each builds on the records, roles and approvals already in place, so nothing is typed twice.</p>
        <p className="relative mt-4 text-xs text-[var(--ejo-text-muted)]">{ROADMAP.length} modules planned · each page shows what it will do and how it connects</p>
      </section>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {ROADMAP.map((m, i) => (
          <Link key={m.key} href={`/roadmap/${m.key}`} className="ejo-rise group flex flex-col rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5 transition-[transform,border-color,box-shadow] hover:-translate-y-0.5 hover:border-[var(--ejo-primary)]/50 hover:shadow-lg" style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}>
            <div className="flex items-center justify-between">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)]"><RoadmapIcon icon={m.icon} size={20} /></span>
              <span className="rounded-full border border-[var(--ejo-warning)]/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--ejo-warning)]">Planned</span>
            </div>
            <h2 className="mt-4 text-base font-semibold text-[var(--ejo-text)]">{m.name}</h2>
            <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">{m.tagline}</p>
            <p className="mt-auto pt-4 text-xs font-medium text-[var(--ejo-primary)] group-hover:underline">{m.phases.reduce((n, p) => n + p.items.length, 0)} capabilities planned →</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
