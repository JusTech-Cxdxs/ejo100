import { listWarrantyPolicies, listWarrantyProviders, getWarrantyRoles, type PolicyStateFilter } from '@/lib/actions/warranty';
import { PolicyCoverageFields } from '@/components/PolicyCoverageFields';
import { coverageLabel, REMEDY_LABEL } from '@/lib/warranty-claim-status';
import { createWarrantyPolicyFormAction, setWarrantyPolicyActiveFormAction, loadSampleWarrantyPoliciesFormAction } from '@/lib/actions/warranty-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { LineItemsInput } from '@/components/LineItemsInput';
import { pluralize } from '@/lib/utils/pluralize';
import { splitLines } from '@/lib/warranty-state';

const BANNER: Record<string, string> = {
  policy_created: 'Policy added.',
  policy_updated: 'Policy updated.',
  deletion_approved: 'Deletion approved — the policy was deleted, or archived if it had already issued warranties (those stay valid and traceable).',
};

function Items({ label, text }: { label: string; text: string | null }) {
  const items = splitLines(text);
  if (items.length === 0) return null;
  return (
    <div className="mt-2">
      <p className="text-xs font-medium text-[var(--ejo-text-muted)]">
        {label} ({items.length})
      </p>
      <ol className="mt-0.5 list-decimal pl-5 text-xs text-[var(--ejo-text)]">
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ol>
    </div>
  );
}

/** What each provider promises — searchable, filterable, each policy
 * viewable and editable, with deletion through the approval chain. */
export default async function WarrantyPoliciesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; error?: string; created?: string; q?: string; state?: string; kind?: string }>;
}) {
  const { status, error, created, q, state: rawState, kind: rawKind } = await searchParams;
  const state = (['active', 'inactive', 'sample', 'archived'] as const).includes(rawState as never) ? (rawState as PolicyStateFilter) : undefined;
  const kind = rawKind === 'ASSET' || rawKind === 'PART' ? rawKind : undefined;
  const [policies, providers, roles] = await Promise.all([listWarrantyPolicies(kind, { q, state }), listWarrantyProviders(), getWarrantyRoles()]);
  const activeProviders = providers.filter((p: (typeof providers)[number]) => p.isActive);
  const input = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';
  const label = 'mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]';
  const pill = (key: string | undefined, text: string) => {
    const href = `/warranty/policies?${[key ? `state=${key}` : null, kind ? `kind=${kind}` : null, q ? `q=${encodeURIComponent(q)}` : null].filter(Boolean).join('&')}`;
    const on = (state ?? undefined) === key;
    return (
      <LoadingLink key={text} href={href} className={`rounded-full px-3 py-1 text-xs font-medium ${on ? 'bg-[var(--ejo-primary)] text-white' : 'border border-[var(--ejo-border)] text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]'}`}>
        {text}
      </LoadingLink>
    );
  };

  return (
    <div className="p-8">
      <LoadingLink href="/warranty" className="mb-4 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">← Back to Warranty</LoadingLink>
      <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Warranty policies</h1>
      <p className="mt-1 mb-6 max-w-3xl text-sm text-[var(--ejo-text-muted)]">
        What each provider promises: duration, distance limit (whichever comes first), what is covered and not covered, and the
        conditions. Warranties already issued keep the terms they were issued with — editing a policy never rewrites history.
      </p>
      {status === 'samples_loaded' ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="success" message={`Sample policies loaded (${pluralize(Number(created ?? 0), 'new item')}). They are clearly marked "Sample" — replace them with real terms.`} /></div> : null}
      {status && BANNER[status] ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="success" message={BANNER[status]} /></div> : null}
      {error ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="error" message={error} /></div> : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        <div>
          <form className="mb-3 flex gap-2" action="/warranty/policies">
            {state ? <input type="hidden" name="state" value={state} /> : null}
            <input type="search" name="q" defaultValue={q ?? ''} placeholder="Search by code, name, brand, model or provider…" className={input} />
            <select name="kind" defaultValue={kind ?? ''} className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]">
              <option value="">Vehicle &amp; part</option>
              <option value="ASSET">Vehicle</option>
              <option value="PART">Part</option>
            </select>
            <button type="submit" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]">Search</button>
          </form>
          <div className="mb-4 flex flex-wrap gap-2">
            {pill(undefined, 'All current')}
            {pill('active', 'Active')}
            {pill('inactive', 'Inactive')}
            {pill('sample', 'Sample')}
            {pill('archived', 'Archived')}
          </div>

          <div className="space-y-3">
            {policies.length === 0 ? (
              <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5 text-sm text-[var(--ejo-text-muted)]">
                {q || state || kind ? 'No policies match this search.' : 'No policies yet. Add one, or load clearly-labelled samples to demonstrate the module.'}
                {!q && !state && !kind && roles.canApprove ? (
                  <form action={loadSampleWarrantyPoliciesFormAction} className="mt-3">
                    <FormPendingOverlay />
                    <SubmitButton label="Load sample policies" pendingLabel="Loading…" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]" />
                  </form>
                ) : null}
              </div>
            ) : null}
            {policies.map((p: (typeof policies)[number]) => (
              <div key={p.id} className={`rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] p-5 ${p.isActive ? 'bg-[var(--ejo-surface)]' : 'bg-[var(--ejo-bg)]'}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <LoadingLink href={`/warranty/policies/${p.id}`} className="text-sm font-semibold text-[var(--ejo-primary)] hover:underline">{p.name}</LoadingLink>
                    <p className="text-xs text-[var(--ejo-text-muted)]">
                      {p.code} · {p.kind === 'ASSET' ? `Vehicle${p.brand ? ` — ${[p.brand, p.model].filter(Boolean).join(' ')}` : ''}` : 'Part'} · {p.provider.name}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {p.isSample ? <span className="rounded-full bg-[var(--ejo-warning)]/15 px-2.5 py-0.5 text-xs font-medium text-[var(--ejo-warning)]">Sample terms</span> : null}
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${p.archivedAt ? 'bg-[var(--ejo-text-muted)]/15 text-[var(--ejo-text-muted)]' : p.isActive ? 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]' : 'bg-[var(--ejo-text-muted)]/15 text-[var(--ejo-text-muted)]'}`}>
                      {p.archivedAt ? 'Archived' : p.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
                <p className="mt-2 text-sm text-[var(--ejo-text)]">
                  {pluralize(p.durationMonths, 'month')}{p.distanceLimit ? ` or ${p.distanceLimit.toLocaleString('en-NG')} km, whichever comes first` : ', no distance limit'}
                </p>
                <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">{coverageLabel(p)} · Remedy: {REMEDY_LABEL[p.defaultRemedy]}</p>
                <Items label="Covered" text={p.coverageSummary} />
                <Items label="Not covered" text={p.exclusions} />
                <Items label="Conditions" text={p.conditions} />
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-[var(--ejo-text-muted)]">
                    {pluralize(p._count.warranties, 'warranty', 'warranties')} issued{p.kind === 'PART' ? ` · ${pluralize(p._count.parts, 'part')} carry it` : ''}
                  </p>
                  <div className="flex items-center gap-2">
                    <LoadingLink href={`/warranty/policies/${p.id}`} className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-1 text-xs font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]">
                      {roles.canApprove && !p.archivedAt ? 'View / Edit' : 'View'}
                    </LoadingLink>
                    {roles.canApprove && !p.archivedAt ? (
                      <form action={setWarrantyPolicyActiveFormAction}>
                        <FormPendingOverlay />
                        <input type="hidden" name="policyId" value={p.id} />
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
            <PolicyCoverageFields />
            <div><label className={label}>What is covered</label><LineItemsInput name="coverageItem" required placeholder="e.g. Engine" addLabel="+ Add covered item" /></div>
            <div><label className={label}>Not covered</label><LineItemsInput name="exclusionItem" placeholder="e.g. Brake pads" addLabel="+ Add exclusion" /></div>
            <div><label className={label}>Conditions</label><LineItemsInput name="conditionItem" placeholder="e.g. Serviced on schedule at an authorised workshop" addLabel="+ Add condition" /></div>
            <SubmitButton label="Add policy" pendingLabel="Adding…" className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90" />
          </form>
        ) : null}
      </div>
    </div>
  );
}
