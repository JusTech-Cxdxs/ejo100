import { allows, guardAnyPage } from '@/lib/authz/server';
import { getConfiguration, searchConfigurationsForSelect } from '@/lib/actions/catalogue';
import { createBuildOrderFormAction } from '@/lib/actions/production-form-handlers';
import { SearchableSelect } from '@/components/SearchableSelect';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { RefineTextButton } from '@/components/enyo/RefineTextButton';
import { EmptyState, PageHeader } from '@/components/ui';
import { btn, input, label } from '@/components/production/styles';

/** Plan a build order: pick the configuration, how many, to stock or for an order, when it is due, and any instructions for the line. */
export default async function NewBuildOrderPage({ searchParams }: { searchParams: Promise<{ error?: string; configurationId?: string }> }) {
  await guardAnyPage(['production.view'], '/production/build-orders/new');
  const { error, configurationId } = await searchParams;
  const canPlan = await allows('production.build_order.manage');
  const preset = configurationId ? await getConfiguration(configurationId) : null;
  return (
    <div className="w-full p-4 sm:p-8">
      <PageHeader icon="clipboard" title="New build order" back={{ href: '/production/build-orders', label: 'Back to Build orders' }} description="Ask the line for N units of a configuration. Planning then checks materials against the bill of materials, and the Production Manager releases it to the line." />
      {error ? <FormFeedbackBanner kind="error" message={error} /> : null}
      {!canPlan ? (
        <EmptyState icon="lock" title="Only Production Planning creates build orders">Ask the Production Planner or the Production Manager to plan this build.</EmptyState>
      ) : (
        <form action={createBuildOrderFormAction} className="max-w-2xl space-y-5 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
          <FormPendingOverlay />
          <div>
            <label className={label} htmlFor="configurationId">Configuration</label>
            <SearchableSelect
              id="configurationId" name="configurationId" required
              search={searchConfigurationsForSelect} loadDefaultOptions={searchConfigurationsForSelect.bind(null, '')} defaultOptionsLabel="Configurations" minQueryLength={0}
              placeholder="Search by product, SKU or configuration…"
              defaultValue={preset?.id} defaultLabel={preset ? `${preset.product.name} — ${preset.name}` : undefined}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div><label className={label} htmlFor="quantity">Quantity</label><input id="quantity" name="quantity" type="number" min={1} max={100000} required defaultValue={1} className={input} /></div>
            <div>
              <label className={label} htmlFor="purpose">Purpose</label>
              <select id="purpose" name="purpose" className={input} defaultValue="TO_STOCK"><option value="TO_STOCK">To stock (from forecasts)</option><option value="FOR_ORDER">For an order</option></select>
            </div>
            <div>
              <label className={label} htmlFor="priority">Priority</label>
              <select id="priority" name="priority" className={input} defaultValue="3"><option value="1">1 — urgent</option><option value="2">2 — high</option><option value="3">3 — normal</option><option value="4">4 — low</option><option value="5">5 — when free</option></select>
            </div>
            <div><label className={label} htmlFor="dueDate">Due date (optional)</label><input id="dueDate" name="dueDate" type="date" className={input} /></div>
          </div>
          <div>
            <div className="flex items-center justify-between"><label className={label} htmlFor="instructions">Instructions for the line (optional)</label><RefineTextButton targetId="instructions" label="instructions" compact /></div>
            <textarea id="instructions" name="instructions" rows={3} className={input} maxLength={2000} placeholder="Customer software, asset tags, branding, packaging…" />
          </div>
          <SubmitButton label="Create build order" pendingLabel="Creating…" className={btn} />
        </form>
      )}
    </div>
  );
}
