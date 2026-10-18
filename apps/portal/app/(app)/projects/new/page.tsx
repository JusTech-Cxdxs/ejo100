import { allows, guardAnyPage } from '@/lib/authz/server';
import { searchProjectCustomerOptions, searchProjectManagerOptions, loadProjectManagerOptions } from '@/lib/actions/projects';
import { createProjectFormAction } from '@/lib/actions/projects-form-handlers';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { SearchableSelect } from '@/components/SearchableSelect';
import { RefineTextButton } from '@/components/enyo/RefineTextButton';
import { PageHeader } from '@/components/ui';
import { PROJECT_KIND_LABEL, type ProjectKind } from '@/lib/projects-core';

const input = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';
const lbl = 'block text-xs font-medium text-[var(--ejo-text-muted)]';

/** Record a tender or an awarded contract: customer, kind, tender reference, value, dates and the manager who runs it. */
export default async function NewProjectPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await guardAnyPage(['projects.view'], '/projects');
  const { error } = await searchParams;
  const canManage = await allows('projects.manage');
  return (
    <div className="p-8">
      <PageHeader icon="handshake" back={{ href: '/projects', label: 'Back to Projects' }} title="New project" description="A tender you are bidding for, or a contract already awarded. Milestones, deliverables and linked orders are added on the project page." />
      {error ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="error" message={error} /></div> : null}
      {!canManage ? (
        <div className="max-w-2xl rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6 text-sm text-[var(--ejo-text)]">Only a Project Manager records projects.</div>
      ) : (
        <form action={createProjectFormAction} className="max-w-3xl space-y-4 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
          <FormPendingOverlay />
          <div><label className={lbl} htmlFor="name">Project name</label><input id="name" name="name" required maxLength={160} className={`${input} mt-1`} placeholder="e.g. Supply of 2,000 laptops to Lagos State schools" /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className={lbl} htmlFor="customerId">Customer</label><div className="mt-1"><SearchableSelect id="customerId" name="customerId" required search={searchProjectCustomerOptions} placeholder="Search customers (ministry, company, school)…" /></div></div>
            <div><label className={lbl} htmlFor="kind">Kind</label><select id="kind" name="kind" required defaultValue="GOVERNMENT" className={`${input} mt-1`}>{(Object.keys(PROJECT_KIND_LABEL) as ProjectKind[]).map((k) => <option key={k} value={k}>{PROJECT_KIND_LABEL[k]}</option>)}</select></div>
            <div><label className={lbl} htmlFor="tenderReference">Tender / contract reference</label><input id="tenderReference" name="tenderReference" maxLength={120} className={`${input} mt-1`} placeholder="e.g. FMoE/ICT/2026/014" /></div>
            <div><label className={lbl} htmlFor="contractValue">Contract value (₦)</label><input id="contractValue" name="contractValue" type="number" min="0" step="0.01" className={`${input} mt-1`} placeholder="0 while still a tender" /></div>
            <div><label className={lbl} htmlFor="startDate">Start date</label><input id="startDate" name="startDate" type="date" className={`${input} mt-1`} /></div>
            <div><label className={lbl} htmlFor="endDate">End date</label><input id="endDate" name="endDate" type="date" className={`${input} mt-1`} /></div>
            <div><label className={lbl} htmlFor="managerId">Project manager</label><div className="mt-1"><SearchableSelect id="managerId" name="managerId" required search={searchProjectManagerOptions} loadDefaultOptions={loadProjectManagerOptions} defaultOptionsLabel="Project managers" placeholder="Search people…" /></div></div>
            <div><label className={lbl} htmlFor="status">Starts as</label><select id="status" name="status" defaultValue="TENDER" className={`${input} mt-1`}><option value="TENDER">Tender (bidding)</option><option value="AWARDED">Awarded (contract signed)</option></select></div>
          </div>
          <div><label className={lbl} htmlFor="description">Scope (optional)</label><textarea id="description" name="description" rows={3} className={`${input} mt-1`} placeholder="What is to be supplied, where, and any special requirements (software, branding, training)." /><div className="mt-1"><RefineTextButton targetId="description" /></div></div>
          <SubmitButton label="Create project" pendingLabel="Creating…" className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90" />
        </form>
      )}
    </div>
  );
}
