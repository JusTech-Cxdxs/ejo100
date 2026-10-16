import Link from 'next/link';
import { notFound } from 'next/navigation';
import { guardPage, NOT_AVAILABLE } from '@/lib/authz/server';
import { getIntegrityAlert } from '@/lib/actions/integrity';
import { reviewIntegrityAlertAction } from '@/lib/actions/integrity-form-handlers';
import { PageHeader, SectionCard } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { securityActionLabel } from '@/lib/security-labels';
import { formatDateTime } from '@/lib/utils/format-date';

export const metadata = { title: 'Integrity alert' };
export const dynamic = 'force-dynamic';

const label = (k: string) => k.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
const show = (v: unknown): string => (Array.isArray(v) ? v.map(show).join(', ') : v && typeof v === 'object' ? JSON.stringify(v) : typeof v === 'number' ? v.toLocaleString('en-NG') : String(v ?? '—'));

/** One alert: why it was raised, the facts, the record, and the review (with what was found). */
export default async function IntegrityAlertPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ status?: string; error?: string }> }) {
  await guardPage('integrity.review', '/integrity/[id]');
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const a = await getIntegrityAlert(id).catch((err: unknown) => {
    if (err instanceof Error && err.message === NOT_AVAILABLE) return null;
    throw err;
  });
  if (!a) notFound();
  const details = typeof a.evidence.details === 'string' ? a.evidence.details : null;
  const facts = Object.entries(a.evidence).filter(([k]) => k !== 'details');
  return (
    <div className="w-full max-w-4xl p-4 sm:p-8">
      <PageHeader icon="shield" title={a.title} back={{ href: '/integrity', label: 'Integrity watch' }} eyebrow={`${a.area} · ${a.ruleLabel}`}
        meta={<><span className="text-xs font-semibold text-[var(--ejo-text)]">{a.severity}</span><span className="text-xs text-[var(--ejo-text-muted)]">{a.statusLabel}</span></>} />
      {sp.error ? <FormFeedbackBanner kind="error" message={sp.error} /> : null}
      {sp.status === 'saved' ? <FormFeedbackBanner kind="success" message="Review saved." /> : null}
      <div className="space-y-6">
        <SectionCard icon="help" title="Why this was raised">
          <p className="text-sm leading-relaxed text-[var(--ejo-text)]">{a.why}</p>
          <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">A reason to look — not proof. First seen {formatDateTime(a.firstSeenAt)}{a.seenCount > 1 ? `, seen ${a.seenCount} times, last ${formatDateTime(a.lastSeenAt)}` : ''}.</p>
        </SectionCard>
        <SectionCard icon="list" title="The facts">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {a.subject ? <div><dt className="text-xs text-[var(--ejo-text-muted)]">Whose activity</dt><dd className="font-medium text-[var(--ejo-text)]">{a.subject}</dd></div> : null}
            {a.reportedBy ? <div><dt className="text-xs text-[var(--ejo-text-muted)]">Raised by</dt><dd className="font-medium text-[var(--ejo-text)]">{a.reportedBy}</dd></div> : null}
            {facts.map(([k, v]) => <div key={k}><dt className="text-xs text-[var(--ejo-text-muted)]">{label(k)}</dt><dd className="break-words text-[var(--ejo-text)]">{show(v)}</dd></div>)}
          </dl>
          {details ? <p className="mt-4 whitespace-pre-wrap break-words rounded-[var(--ejo-radius-md)] bg-[var(--ejo-bg)] p-3 text-sm text-[var(--ejo-text)]">{details}</p> : null}
          {a.href ? <p className="mt-4"><Link href={a.href} className="text-sm font-medium text-[var(--ejo-primary)] hover:underline">Open the record →</Link></p> : null}
        </SectionCard>
        <SectionCard icon="check-circle" title="Review" description={a.reviewedBy ? `Last by ${a.reviewedBy}${a.reviewedAt ? `, ${formatDateTime(a.reviewedAt)}` : ''}` : 'Not reviewed yet'}>
          {a.resolution ? <p className="mb-4 whitespace-pre-wrap rounded-[var(--ejo-radius-md)] bg-[var(--ejo-bg)] p-3 text-sm text-[var(--ejo-text)]">{a.resolution}</p> : null}
          <form action={reviewIntegrityAlertAction} className="space-y-3">
            <input type="hidden" name="id" value={a.id} />
            <fieldset className="flex flex-wrap gap-2">
              <legend className="mb-1 text-xs font-medium text-[var(--ejo-text-muted)]">What happens to it</legend>
              {([['REVIEWING', 'I am looking into it'], ['CONFIRMED', 'Confirmed — action taken'], ['DISMISSED', 'Dismissed — nothing wrong']] as const).map(([v, l]) => (
                <label key={v} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-full border border-[var(--ejo-border)] px-3 text-sm has-[:checked]:border-[var(--ejo-primary)] has-[:checked]:bg-[var(--ejo-primary)]/10">
                  <input type="radio" name="status" value={v} required defaultChecked={a.status === v} className="h-4 w-4 accent-[var(--ejo-primary)]" />{l}
                </label>
              ))}
            </fieldset>
            <label htmlFor="resolution" className="block text-xs font-medium text-[var(--ejo-text-muted)]">What you found and did (needed to confirm or dismiss)</label>
            <textarea id="resolution" name="resolution" rows={4} maxLength={1000} defaultValue={a.resolution ?? ''} className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-base text-[var(--ejo-text)] sm:text-sm" />
            <SubmitButton label="Save review" pendingLabel="Saving…" className="min-h-11 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 text-sm font-semibold text-white" />
          </form>
        </SectionCard>
        {a.history.length ? (
          <SectionCard icon="history" title="History">
            <ol className="space-y-1.5 text-sm">{a.history.map((h, i) => <li key={i} className="text-[var(--ejo-text)]">{securityActionLabel(h.action)}{h.status ? ` → ${h.status.toLowerCase()}` : ''} <span className="text-xs text-[var(--ejo-text-muted)]">· {h.by} · {formatDateTime(h.at)}</span></li>)}</ol>
          </SectionCard>
        ) : null}
      </div>
    </div>
  );
}
