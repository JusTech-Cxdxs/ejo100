import { listWarrantyProviders } from '@/lib/actions/warranty';
import { createWarrantyProviderFormAction } from '@/lib/actions/warranty-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { pluralize } from '@/lib/utils/pluralize';

const TYPE_LABEL: Record<string, string> = {
  MANUFACTURER: 'Manufacturer (OEM)',
  DISTRIBUTOR: 'Distributor',
  COMPONENT_MAKER: 'Component maker',
  SUPPLIER: 'Supplier',
  INTERNAL: 'Our own (workshop / goodwill)',
};

/** Who stands behind each warranty — and who claims are recovered from. */
export default async function WarrantyProvidersPage({ searchParams }: { searchParams: Promise<{ status?: string; error?: string }> }) {
  const { status, error } = await searchParams;
  const providers = await listWarrantyProviders();
  const input = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';
  const label = 'mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]';
  return (
    <div className="p-8">
      <LoadingLink href="/warranty" className="mb-4 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">← Back to Warranty</LoadingLink>
      <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Warranty providers</h1>
      <p className="mt-1 mb-6 max-w-3xl text-sm text-[var(--ejo-text-muted)]">
        The manufacturers, distributors, component makers and suppliers that stand behind warranties — and the claim rules each one sets
        (how long to submit a claim, how long to keep a failed part).
      </p>
      {status === 'provider_created' ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="success" message="Provider added." /></div> : null}
      {error ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="error" message={error} /></div> : null}
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-3">
          {providers.length === 0 ? <p className="text-sm text-[var(--ejo-text-muted)]">No providers yet.</p> : null}
          {providers.map((p: (typeof providers)[number]) => (
            <div key={p.id} className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
              <p className="text-sm font-semibold text-[var(--ejo-text)]">{p.name}</p>
              <p className="text-xs text-[var(--ejo-text-muted)]">{TYPE_LABEL[p.type] ?? p.type}{p.isActive ? '' : ' · Inactive'}</p>
              <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">
                {[p.contactName, p.email, p.phone].filter(Boolean).join(' · ') || 'No contact recorded'}
              </p>
              <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
                Claim within {p.claimSubmissionDays !== null ? pluralize(p.claimSubmissionDays, 'day') : '—'} · keep failed parts {p.partRetentionDays !== null ? pluralize(p.partRetentionDays, 'day') : '—'}
              </p>
              <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">{pluralize(p._count.policies, 'policy', 'policies')} · {pluralize(p._count.warranties, 'warranty', 'warranties')}</p>
              {p.notes ? <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">{p.notes}</p> : null}
            </div>
          ))}
        </div>
        <form action={createWarrantyProviderFormAction} className="h-fit space-y-3 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
          <FormPendingOverlay />
          <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Add a provider</h2>
          <div><label className={label}>Name</label><input name="name" required placeholder="Foton International" className={input} /></div>
          <div>
            <label className={label}>Type</label>
            <select name="type" className={input}>
              {Object.entries(TYPE_LABEL).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
            </select>
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
      </div>
    </div>
  );
}
