import { listWarrantyProviders, getWarrantyRoles, type ProviderStateFilter } from '@/lib/actions/warranty';
import { createWarrantyProviderFormAction, setWarrantyProviderActiveFormAction } from '@/lib/actions/warranty-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { pluralize } from '@/lib/utils/pluralize';
import { PROVIDER_TYPE_LABEL } from '@/lib/warranty-claim-status';


const BANNER: Record<string, string> = {
  provider_created: 'Provider added.',
  provider_updated: 'Provider updated.',
  deletion_approved: 'Deletion approved — the provider was deleted, or archived if it was in use (its history stays valid; its active policies were deactivated).',
};

/** Who stands behind each warranty — searchable, filterable, each one
 * viewable and editable, with deletion through the approval chain. */
export default async function WarrantyProvidersPage({ searchParams }: { searchParams: Promise<{ status?: string; error?: string; q?: string; state?: string; type?: string }> }) {
  const { status, error, q, state: rawState, type: rawType } = await searchParams;
  const state = (['active', 'inactive', 'archived'] as const).includes(rawState as never) ? (rawState as ProviderStateFilter) : undefined;
  const type = rawType && PROVIDER_TYPE_LABEL[rawType] ? rawType : undefined;
  const [providers, roles] = await Promise.all([listWarrantyProviders({ q, state, type }), getWarrantyRoles()]);
  const input = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';
  const label = 'mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]';
  const pill = (key: string | undefined, text: string) => (
    <LoadingLink
      key={text}
      href={`/warranty/providers?${[key ? `state=${key}` : null, type ? `type=${type}` : null, q ? `q=${encodeURIComponent(q)}` : null].filter(Boolean).join('&')}`}
      className={`rounded-full px-3 py-1 text-xs font-medium ${state === key ? 'bg-[var(--ejo-primary)] text-white' : 'border border-[var(--ejo-border)] text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]'}`}
    >
      {text}
    </LoadingLink>
  );

  return (
    <div className="p-8">
      <LoadingLink href="/warranty" className="mb-4 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">← Back to Warranty</LoadingLink>
      <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Warranty providers</h1>
      <p className="mt-1 mb-6 max-w-3xl text-sm text-[var(--ejo-text-muted)]">
        The manufacturers, distributors, component makers and suppliers that stand behind warranties — and the claim rules each one sets
        (how long to submit a claim, how long to keep a failed part).
      </p>
      {status && BANNER[status] ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="success" message={BANNER[status]} /></div> : null}
      {error ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="error" message={error} /></div> : null}
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div>
          <form className="mb-3 flex gap-2" action="/warranty/providers">
            {state ? <input type="hidden" name="state" value={state} /> : null}
            <input type="search" name="q" defaultValue={q ?? ''} placeholder="Search by name, contact, email or phone…" className={input} />
            <select name="type" defaultValue={type ?? ''} className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]">
              <option value="">All types</option>
              {Object.entries(PROVIDER_TYPE_LABEL).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </select>
            <button type="submit" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]">Search</button>
          </form>
          <div className="mb-4 flex flex-wrap gap-2">
            {pill(undefined, 'All current')}
            {pill('active', 'Active')}
            {pill('inactive', 'Inactive')}
            {pill('archived', 'Archived')}
          </div>
          <div className="space-y-3">
            {providers.length === 0 ? <p className="text-sm text-[var(--ejo-text-muted)]">{q || state || type ? 'No providers match this search.' : 'No providers yet.'}</p> : null}
            {providers.map((p: (typeof providers)[number]) => (
              <div key={p.id} className={`rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] p-5 ${p.isActive ? 'bg-[var(--ejo-surface)]' : 'bg-[var(--ejo-bg)]'}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <LoadingLink href={`/warranty/providers/${p.id}`} className="text-sm font-semibold text-[var(--ejo-primary)] hover:underline">{p.name}</LoadingLink>
                    <p className="text-xs text-[var(--ejo-text-muted)]">{PROVIDER_TYPE_LABEL[p.type] ?? p.type}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${p.archivedAt ? 'bg-[var(--ejo-text-muted)]/15 text-[var(--ejo-text-muted)]' : p.isActive ? 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]' : 'bg-[var(--ejo-text-muted)]/15 text-[var(--ejo-text-muted)]'}`}>
                    {p.archivedAt ? 'Archived' : p.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">{[p.contactName, p.email, p.phone].filter(Boolean).join(' · ') || 'No contact recorded'}</p>
                <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
                  Claim within {p.claimSubmissionDays !== null ? pluralize(p.claimSubmissionDays, 'day') : '—'} · keep failed parts {p.partRetentionDays !== null ? pluralize(p.partRetentionDays, 'day') : '—'}
                </p>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-[var(--ejo-text-muted)]">
                    {pluralize(p._count.policies, 'policy', 'policies')} · {pluralize(p._count.warranties, 'warranty', 'warranties')} · {pluralize(p._count.claims, 'claim')}
                  </p>
                  <div className="flex items-center gap-2">
                    <LoadingLink href={`/warranty/providers/${p.id}`} className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-1 text-xs font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]">
                      {roles.canApprove && !p.archivedAt ? 'View / Edit' : 'View'}
                    </LoadingLink>
                    {roles.canApprove && !p.archivedAt ? (
                      <form action={setWarrantyProviderActiveFormAction}>
                        <FormPendingOverlay />
                        <input type="hidden" name="providerId" value={p.id} />
                        <input type="hidden" name="returnTo" value="list" />
                        <input type="hidden" name="isActive" value={p.isActive ? 'false' : 'true'} />
                        <SubmitButton label={p.isActive ? 'Deactivate' : 'Activate'} pendingLabel="Saving…" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-1 text-xs font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]" />
                      </form>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        {roles.canApprove ? (
          <form action={createWarrantyProviderFormAction} className="h-fit space-y-3 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
            <FormPendingOverlay />
            <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Add a provider</h2>
            <div><label className={label}>Name</label><input name="name" required placeholder="Foton International" className={input} /></div>
            <div>
              <label className={label}>Type</label>
              <select name="type" className={input}>{Object.entries(PROVIDER_TYPE_LABEL).map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
            </div>
            <div><label className={label}>Contact name</label><input name="contactName" className={input} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className={label}>Email</label><input name="email" type="email" className={input} /></div>
              <div><label className={label}>Phone</label><input name="phone" className={input} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className={label}>Claim within (days)</label><input name="claimSubmissionDays" type="number" min={1} className={input} /></div>
              <div><label className={label}>Keep failed parts (days)</label><input name="partRetentionDays" type="number" min={1} className={input} /></div>
            </div>
            <div><label className={label}>Notes</label><textarea name="notes" rows={2} className={input} /></div>
            <SubmitButton label="Add provider" pendingLabel="Adding…" className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90" />
          </form>
        ) : null}
      </div>
    </div>
  );
}
