import { listWarrantyPolicies, listWarrantyProviders } from '@/lib/actions/warranty';
import { createWarrantyPolicyFormAction, setWarrantyPolicyActiveFormAction, loadSampleWarrantyPoliciesFormAction } from '@/lib/actions/warranty-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { pluralize } from '@/lib/utils/pluralize';

/** What each provider promises — vehicle (asset) policies by brand/model,
 * and part policies attached to parts in Inventory. Data, not code. */
export default async function WarrantyPoliciesPage({ searchParams }: { searchParams: Promise<{ status?: string; error?: string; created?: string }> }) {
  const { status, error, created } = await searchParams;
  const [policies, providers] = await Promise.all([listWarrantyPolicies(), listWarrantyProviders()]);
  const activeProviders = providers.filter((p: (typeof providers)[number]) => p.isActive);
  const input = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';
  const label = 'mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]';

  return (
    <div className="p-8">
      <LoadingLink href="/warranty" className="mb-4 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">← Back to Warranty</LoadingLink>
      <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Warranty policies</h1>
      <p className="mt-1 mb-6 max-w-3xl text-sm text-[var(--ejo-text-muted)]">
        What each provider promises: duration, distance limit (whichever comes first), what is covered and excluded, and the conditions.
        Issued warranties keep the terms they were issued with — editing a policy never rewrites history.
      </p>
      {status === 'samples_loaded' ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="success" message={`Sample policies loaded (${pluralize(Number(created ?? 0), 'new item')}). They are clearly marked "Sample" — replace them with real terms.`} /></div> : null}
      {status === 'policy_created' ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="success" message="Policy added." /></div> : null}
      {status === 'policy_updated' ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="success" message="Policy updated." /></div> : null}
      {error ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="error" message={error} /></div> : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-3">
          {policies.length === 0 ? (
            <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5 text-sm text-[var(--ejo-text-muted)]">
              No policies yet. Add one, or load clearly-labelled samples to demonstrate the module.
              <form action={loadSampleWarrantyPoliciesFormAction} className="mt-3">
                <FormPendingOverlay />
                <SubmitButton label="Load sample policies" pendingLabel="Loading…" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]" />
              </form>
            </div>
          ) : null}
          {policies.map((p: (typeof policies)[number]) => (
            <div key={p.id} className={`rounded-[var(--ejo-radius-lg)] border p-5 ${p.isActive ? 'border-[var(--ejo-border)] bg-[var(--ejo-surface)]' : 'border-[var(--ejo-border)] bg-[var(--ejo-bg)] opacity-70'}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-[var(--ejo-text)]">{p.name}</p>
                  <p className="text-xs text-[var(--ejo-text-muted)]">
                    {p.code} · {p.kind === 'ASSET' ? `Vehicle${p.brand ? ` — ${[p.brand, p.model].filter(Boolean).join(' ')}` : ''}` : 'Part'} · {p.provider.name}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {p.isSample ? <span className="rounded-full bg-[var(--ejo-warning)]/15 px-2.5 py-0.5 text-xs font-medium text-[var(--ejo-warning)]">Sample terms</span> : null}
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${p.isActive ? 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]' : 'bg-[var(--ejo-text-muted)]/15 text-[var(--ejo-text-muted)]'}`}>{p.isActive ? 'Active' : 'Inactive'}</span>
                </div>
              </div>
              <p className="mt-2 text-sm text-[var(--ejo-text)]">
                {pluralize(p.durationMonths, 'month')}{p.distanceLimit ? ` or ${p.distanceLimit.toLocaleString('en-NG')} km, whichever comes first` : ', no distance limit'}
              </p>
              <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">Covers: {p.coverageSummary}</p>
              {p.exclusions ? <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">Not covered: {p.exclusions}</p> : null}
              {p.conditions ? <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">Conditions: {p.conditions}</p> : null}
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-[var(--ejo-text-muted)]">
                  {pluralize(p._count.warranties, 'warranty', 'warranties')} issued{p.kind === 'PART' ? ` · ${pluralize(p._count.parts, 'part')} carry it` : ''}
                </p>
                <form action={setWarrantyPolicyActiveFormAction}>
                  <FormPendingOverlay />
                  <input type="hidden" name="policyId" value={p.id} />
                  <input type="hidden" name="isActive" value={p.isActive ? 'false' : 'true'} />
                  <SubmitButton label={p.isActive ? 'Deactivate' : 'Activate'} pendingLabel="Saving…" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-1 text-xs font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]" />
                </form>
              </div>
            </div>
          ))}
        </div>

        <form action={createWarrantyPolicyFormAction} className="h-fit space-y-3 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
          <FormPendingOverlay />
          <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Add a policy</h2>
          {activeProviders.length === 0 ? (
            <p className="text-xs text-[var(--ejo-warning)]">
              Add a <LoadingLink href="/warranty/providers" className="text-[var(--ejo-primary)] hover:underline">provider</LoadingLink> first (or load the samples).
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <div><label className={label}>Code</label><input name="code" required placeholder="FOTON-VEH-36" className={input} /></div>
            <div><label className={label}>Applies to</label><select name="kind" className={input}><option value="ASSET">Vehicle</option><option value="PART">Part</option></select></div>
          </div>
          <div><label className={label}>Name</label><input name="name" required placeholder="Foton new vehicle warranty" className={input} /></div>
          <div>
            <label className={label}>Provider</label>
            <select name="providerId" required className={input}>
              {activeProviders.map((p: (typeof activeProviders)[number]) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className={label}>Brand (vehicle)</label><input name="brand" placeholder="Foton" className={input} /></div>
            <div><label className={label}>Model (optional)</label><input name="model" placeholder="Tunland" className={input} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className={label}>Months</label><input name="durationMonths" type="number" min={1} max={240} required className={input} /></div>
            <div><label className={label}>Km limit (blank = none)</label><input name="distanceLimit" type="number" min={1} className={input} /></div>
          </div>
          <div><label className={label}>What is covered</label><textarea name="coverageSummary" required rows={2} className={input} /></div>
          <div><label className={label}>Not covered</label><textarea name="exclusions" rows={2} className={input} /></div>
          <div><label className={label}>Conditions</label><textarea name="conditions" rows={2} className={input} /></div>
          <SubmitButton label="Add policy" pendingLabel="Adding…" className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90" />
          {policies.length > 0 ? (
            <p className="text-[11px] text-[var(--ejo-text-muted)]">Workshop Managers and Master Administrators manage policies.</p>
          ) : null}
        </form>
      </div>
    </div>
  );
}
