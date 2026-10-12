import { guardPage } from '@/lib/authz/server';
import { getStructure } from '@/lib/actions/structure';
import { createBusinessUnitFormAction, renameBusinessUnitFormAction, createBranchFormAction, createDepartmentFormAction } from '@/lib/actions/structure-form-handlers';
import { SubmitButton } from '@/components/SubmitButton';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { LoadingLink } from '@/components/LoadingLink';
import { STRUCTURE_STATUS } from '@/lib/structure-messages';
import { SYSTEM_DEPARTMENTS } from '@/lib/structure-rules';

const card = 'rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)]';
const input = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';
const label = 'mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]';
const primary = 'rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90';

function Stat({ value, name }: { value: number; name: string }) {
  return (
    <div className={`${card} px-5 py-4`}>
      <p className="text-2xl font-bold text-[var(--ejo-text)]">{value}</p>
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--ejo-text-muted)]">{name}</p>
    </div>
  );
}

/**
 * The organisation at a glance: business units → branches → departments,
 * with how many people work in each — and where each is added or changed.
 */
export default async function StructurePage({ searchParams }: { searchParams: Promise<{ error?: string; status?: string }> }) {
  await guardPage('admin.structure.manage', '/structure');
  const { error, status } = await searchParams;
  const s = await getStructure();
  const branches = s.units.flatMap((u) => u.branches);
  const departments = branches.flatMap((b) => b.departments.filter((d) => d.isActive));
  const people = branches.reduce((n, b) => n + b.people, 0);

  return (
    <div className="w-full max-w-6xl p-4 sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ejo-primary)]">{s.organisation?.name ?? 'Organisation'}</p>
      <h1 className="mt-1 text-2xl font-bold text-[var(--ejo-text)]">Organisation structure</h1>
      <p className="mt-1 max-w-3xl text-sm text-[var(--ejo-text-muted)]">How the organisation is laid out — business units, the branches under each, and the departments in every branch — with the people in each. Staff are placed into a branch and department on the Users page. Every change here is recorded in the audit trail.</p>

      {error ? <div className="mt-4"><FormFeedbackBanner kind="error" message={error} /></div> : null}
      {status && STRUCTURE_STATUS[status] ? <div className="mt-4"><FormFeedbackBanner kind="success" message={STRUCTURE_STATUS[status]!} /></div> : null}

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat value={s.units.length} name={s.units.length === 1 ? 'Business unit' : 'Business units'} />
        <Stat value={branches.length} name={branches.length === 1 ? 'Branch' : 'Branches'} />
        <Stat value={departments.length} name={departments.length === 1 ? 'Department' : 'Departments'} />
        <Stat value={people} name="Active people" />
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-2">
        <details className={`${card} p-4`}>
          <summary className="cursor-pointer text-sm font-semibold text-[var(--ejo-text)]">+ Add a business unit</summary>
          <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">A division of the group — e.g. Automobile, Manufacturing, Foods. Branches sit under a business unit.</p>
          <form action={createBusinessUnitFormAction} className="mt-3 flex gap-2">
            <input type="hidden" name="returnTo" value="/structure" />
            <input name="name" required minLength={2} maxLength={80} placeholder="Business unit name" aria-label="Business unit name" className={input} />
            <SubmitButton label="Add" pendingLabel="Adding…" className={primary} />
          </form>
        </details>
        <details className={`${card} p-4`}>
          <summary className="cursor-pointer text-sm font-semibold text-[var(--ejo-text)]">+ Open a new branch</summary>
          <form action={createBranchFormAction} className="mt-3 grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="returnTo" value="/structure" />
            <div className="sm:col-span-2"><label className={label} htmlFor="bu">Business unit</label>
              <select id="bu" name="businessUnitId" required defaultValue="" className={input}>
                <option value="" disabled>Choose…</option>
                {s.units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div><label className={label} htmlFor="bn">Branch name</label><input id="bn" name="name" required minLength={2} maxLength={80} placeholder="e.g. Ikeja Branch" className={input} /></div>
            <div><label className={label} htmlFor="bc">Short code (optional)</label><input id="bc" name="code" maxLength={12} placeholder="e.g. IKJ" className={input} /></div>
            <div><label className={label} htmlFor="bcity">City / area</label><input id="bcity" name="city" required minLength={2} maxLength={80} placeholder="e.g. Ikeja" className={input} /></div>
            <div><label className={label} htmlFor="bstate">State</label><input id="bstate" name="state" required minLength={2} maxLength={80} placeholder="e.g. Lagos State" className={input} /></div>
            <label className="flex items-start gap-2 text-xs text-[var(--ejo-text-muted)] sm:col-span-2">
              <input type="checkbox" name="standardDepartments" defaultChecked className="mt-0.5 h-4 w-4" />
              <span>Create the standard departments ({SYSTEM_DEPARTMENTS.map((d) => d.name).join(', ')}) — needed for Job Cards, Vehicle Services and the Store at this branch.</span>
            </label>
            <div className="sm:col-span-2"><SubmitButton label="Open branch" pendingLabel="Opening…" className={primary} /></div>
          </form>
        </details>
      </div>

      <div className="mt-8 space-y-6">
        {s.units.length === 0 ? <p className="text-sm text-[var(--ejo-text-muted)]">No business units yet — add the first one above.</p> : null}
        {s.units.map((u) => (
          <section key={u.id} className={`${card} p-5`} aria-label={u.name}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ejo-text-muted)]">Business unit</p>
                <h2 className="text-lg font-bold text-[var(--ejo-text)]">{u.name}</h2>
                <p className="text-xs text-[var(--ejo-text-muted)]">{u.branches.length} {u.branches.length === 1 ? 'branch' : 'branches'} · {u.branches.reduce((n, b) => n + b.people, 0)} people</p>
              </div>
              <details className="relative">
                <summary className="cursor-pointer list-none rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-1.5 text-xs font-medium text-[var(--ejo-text)]">Rename</summary>
                <form action={renameBusinessUnitFormAction} className="absolute right-0 z-10 mt-1 flex w-72 gap-2 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-2 shadow-lg">
                  <input type="hidden" name="businessUnitId" value={u.id} /><input type="hidden" name="returnTo" value="/structure" />
                  <input name="name" defaultValue={u.name} required minLength={2} maxLength={80} aria-label={`New name for ${u.name}`} className={input} />
                  <SubmitButton label="Save" pendingLabel="…" className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-3 py-1.5 text-xs font-medium text-white" />
                </form>
              </details>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {u.branches.length === 0 ? <p className="text-sm text-[var(--ejo-text-muted)]">No branches yet — open one above.</p> : null}
              {u.branches.map((b) => (
                <article key={b.id} className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold text-[var(--ejo-text)]">{b.name}{b.code ? <span className="ml-2 font-mono text-[11px] text-[var(--ejo-text-muted)]">{b.code}</span> : null}</h3>
                      <p className="text-xs text-[var(--ejo-text-muted)]">{b.city.name}, {b.city.state.name} · {b.people} {b.people === 1 ? 'person' : 'people'}</p>
                    </div>
                    <LoadingLink href={`/branches/${b.id}`} className="shrink-0 text-xs font-medium text-[var(--ejo-primary)] hover:underline">Manage →</LoadingLink>
                  </div>
                  <ul className="mt-3 flex flex-wrap gap-1.5">
                    {b.departments.filter((d) => d.isActive).map((d) => (
                      <li key={d.id} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-2.5 py-1 text-xs text-[var(--ejo-text)]">
                        {d.name}<span className="rounded-full bg-[var(--ejo-primary)]/10 px-1.5 text-[10px] font-semibold text-[var(--ejo-primary)]">{d.people}</span>
                      </li>
                    ))}
                    {b.departments.filter((d) => d.isActive).length === 0 ? <li className="text-xs text-[var(--ejo-text-muted)]">No departments yet.</li> : null}
                  </ul>
                  <form action={createDepartmentFormAction} className="mt-3 flex gap-2">
                    <input type="hidden" name="branchId" value={b.id} /><input type="hidden" name="returnTo" value="/structure" />
                    <input name="name" required minLength={2} maxLength={80} placeholder="Add a department…" aria-label={`New department in ${b.name}`} className="min-w-0 flex-1 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-3 py-1.5 text-xs text-[var(--ejo-text)]" />
                    <SubmitButton label="Add" pendingLabel="…" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-1.5 text-xs font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]" />
                  </form>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
