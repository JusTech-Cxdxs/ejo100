import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ROADMAP, roadmapByKey } from '@/lib/roadmap';
import { RoadmapIcon } from '@/components/RoadmapIcon';

export function generateStaticParams() {
  return ROADMAP.map((m) => ({ module: m.key }));
}

export async function generateMetadata({ params }: { params: Promise<{ module: string }> }) {
  const m = roadmapByKey.get((await params).module);
  return { title: m ? `${m.name} — coming next` : 'Roadmap' };
}

/** One planned module: what it will do, in phases, and how it connects. */
export default async function RoadmapModulePage({ params }: { params: Promise<{ module: string }> }) {
  const m = roadmapByKey.get((await params).module);
  if (!m) notFound();
  const i = ROADMAP.findIndex((x) => x.key === m.key);
  const next = ROADMAP[(i + 1) % ROADMAP.length]!;
  const total = m.phases.reduce((n, p) => n + p.items.length, 0);
  return (
    <div className="w-full max-w-5xl p-4 sm:p-8">
      <Link href="/roadmap" className="text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">← The full roadmap</Link>

      <section className="ejo-roadmap-hero ejo-rise relative mt-4 overflow-hidden rounded-[var(--ejo-radius-xl)] border border-[var(--ejo-border)] p-8 sm:p-10">
        <div className="ejo-orb pointer-events-none absolute -right-16 -top-16 h-72 w-72 rounded-full bg-[var(--ejo-primary)]/20 blur-3xl" aria-hidden="true" />
        <div className="relative flex flex-wrap items-start gap-6">
          <div className="relative flex h-20 w-20 shrink-0 items-center justify-center">
            <span className="ejo-spin absolute inset-0 rounded-full border-2 border-dashed border-[var(--ejo-primary)]/40" aria-hidden="true" />
            <span className="ejo-glow absolute inset-2 rounded-full bg-[var(--ejo-primary)]/30 blur-md" aria-hidden="true" />
            <span className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--ejo-surface)] text-[var(--ejo-primary)] shadow-sm"><RoadmapIcon icon={m.icon} size={28} /></span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ejo-warning)]"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--ejo-warning)]" />Coming next · planned</p>
            <h1 className="mt-2 text-3xl font-bold text-[var(--ejo-text)]">{m.name}</h1>
            <p className="mt-1 text-lg text-[var(--ejo-text)]">{m.tagline}</p>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--ejo-text-muted)]">{m.description}</p>
          </div>
        </div>
      </section>

      <h2 className="mt-10 text-sm font-semibold uppercase tracking-[0.12em] text-[var(--ejo-text-muted)]">What it will do · {total} capabilities</h2>
      <ol className="relative mt-4 space-y-6 border-l-2 border-[var(--ejo-border)] pl-6">
        {m.phases.map((p, pi) => (
          <li key={p.name} className="ejo-rise relative" style={{ animationDelay: `${pi * 70}ms` }}>
            <span className="absolute -left-[33px] top-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-[var(--ejo-primary)] bg-[var(--ejo-bg)]" aria-hidden="true"><span className="h-1.5 w-1.5 rounded-full bg-[var(--ejo-primary)]" /></span>
            <h3 className="text-base font-semibold text-[var(--ejo-text)]">{p.name}</h3>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {p.items.map((it) => (
                <li key={it} className="flex gap-2 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-3 py-2.5 text-sm text-[var(--ejo-text)]">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ejo-primary)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>
                  <span>{it}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>

      {m.connects.length ? (
        <section className="mt-10 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
          <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Builds on what runs today</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {m.connects.map((c) => <Link key={c.href} href={c.href} className="rounded-full border border-[var(--ejo-border)] px-3 py-1 text-sm text-[var(--ejo-text)] hover:border-[var(--ejo-primary)] hover:text-[var(--ejo-primary)]">{c.label} →</Link>)}
          </div>
        </section>
      ) : null}

      <div className="mt-8 flex justify-end">
        <Link href={`/roadmap/${next.key}`} className="text-sm font-medium text-[var(--ejo-primary)] hover:underline">Next: {next.name} →</Link>
      </div>
    </div>
  );
}
