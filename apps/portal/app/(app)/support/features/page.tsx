import Link from 'next/link';
import { getPrincipal } from '@/lib/authz/server';
import { guideFor, highlightsFor } from '@/lib/help/features';
import { ROLE_LABELS } from '@/lib/authz/catalogue';
import { AskEnyoButton } from '@/components/enyo/AskEnyoButton';
import { GuideBrowser } from '@/components/support/GuideBrowser';
import { PageHeader, SectionCard } from '@/components/ui';

export const metadata = { title: 'What I can do here' };
export const dynamic = 'force-dynamic';

const TAG_TONE: Record<string, string> = {
  Enyo: 'bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)]', Everyday: 'bg-[var(--ejo-info)]/10 text-[var(--ejo-info)]', Workshop: 'bg-[var(--ejo-warning)]/12 text-[var(--ejo-warning-text,var(--ejo-warning))]',
  Leadership: 'bg-[var(--ejo-success)]/12 text-[var(--ejo-success)]', Support: 'bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)]', IT: 'bg-[var(--ejo-text-muted)]/12 text-[var(--ejo-text)]',
};

/**
 * What I can do here — the features people miss, and every how-to for their
 * own role, searchable. Built from the person's permissions, so each person
 * sees their own list (an executive sees analytics, a technician the workshop).
 */
export default async function FeaturesPage() {
  const p = await getPrincipal();
  const highlights = highlightsFor(p);
  const groups = guideFor(p);
  const roles = p.roleSlugs.map((s) => ROLE_LABELS[s]).filter(Boolean);
  return (
    <div className="w-full max-w-6xl space-y-6 p-4 sm:p-8">
      <PageHeader hero icon="sparkles" eyebrow="Help" title="What I can do here"
        description={<>The features made for {roles.length ? <strong>{roles.join(', ')}</strong> : 'your role'}, including the ones that are easy to miss, and step-by-step help for everything you can open.</>}
        actions={<AskEnyoButton question="Train me on my role: what should I learn first?" label="Train me on my role" />} />

      <section aria-labelledby="highlights-title">
        <h2 id="highlights-title" className="mb-3 text-base font-semibold text-[var(--ejo-text)]">Worth knowing</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {highlights.map((h) => (
            <article key={h.id} className="flex flex-col rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4" data-testid={`feature-${h.id}`}>
              <span className={`w-fit rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${TAG_TONE[h.tag] ?? ''}`}>{h.tag}</span>
              <h3 className="mt-2 text-sm font-semibold text-[var(--ejo-text)]">{h.title}</h3>
              <p className="mt-1 flex-1 text-sm text-[var(--ejo-text-muted)]">{h.text}</p>
              <p className="mt-2 text-xs text-[var(--ejo-text-muted)]"><span className="font-medium text-[var(--ejo-text)]">Where:</span> {h.where}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href={h.href} className="inline-flex min-h-9 items-center rounded-full border border-[var(--ejo-border)] px-3 text-xs font-medium text-[var(--ejo-text)] hover:border-[var(--ejo-primary)]/50">Open</Link>
                {h.try ? <AskEnyoButton question={h.try} label="Try it with Enyo" /> : null}
              </div>
            </article>
          ))}
        </div>
      </section>

      <SectionCard icon="help" title="How do I…" description="Every task your role can open, with the steps. Search, or ask Enyo to walk you through.">
        <GuideBrowser groups={groups} />
      </SectionCard>
    </div>
  );
}
