import { createDepartmentFormAction, renameDepartmentFormAction, setDepartmentActiveFormAction } from '@/lib/actions/structure-form-handlers';
import { SubmitButton } from '@/components/SubmitButton';
import { SYSTEM_DEPARTMENTS } from '@/lib/structure-rules';

type Dept = { id: string; name: string; slug: string; isActive: boolean; people: number; system: boolean };

const input = 'min-w-0 flex-1 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-1.5 text-sm text-[var(--ejo-text)]';
const ghost = 'rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-2.5 py-1 text-xs font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]';

/** A branch's departments: who works in each, rename, switch off / on, add. */
export function DepartmentsPanel({ branchId, departments, returnTo }: { branchId: string; departments: Dept[]; returnTo: string }) {
  const why = new Map(SYSTEM_DEPARTMENTS.map((d) => [d.slug, d.why]));
  return (
    <div>
      <ul className="divide-y divide-[var(--ejo-border)] overflow-hidden rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)]">
        {departments.length === 0 ? <li className="px-4 py-3 text-sm text-[var(--ejo-text-muted)]">No departments yet.</li> : null}
        {departments.map((d) => (
          <li key={d.id} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${d.isActive ? '' : 'bg-[var(--ejo-bg)] opacity-70'}`}>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-[var(--ejo-text)]">
                {d.name}
                {d.system ? <span className="rounded-full bg-[var(--ejo-primary)]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--ejo-primary)]" title={why.get(d.slug)}>System</span> : null}
                {!d.isActive ? <span className="rounded-full bg-[var(--ejo-text-muted)]/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--ejo-text-muted)]">Switched off</span> : null}
              </p>
              <p className="text-xs text-[var(--ejo-text-muted)]">{d.people} {d.people === 1 ? 'person' : 'people'}{d.system ? ` · ${why.get(d.slug) ?? ''}` : ''}</p>
            </div>
            <details className="relative">
              <summary className={`${ghost} cursor-pointer list-none`}>Rename</summary>
              <form action={renameDepartmentFormAction} className="absolute right-0 z-30 mt-1 flex w-72 gap-2 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-2 shadow-lg">
                <input type="hidden" name="departmentId" value={d.id} /><input type="hidden" name="returnTo" value={returnTo} />
                <input name="name" defaultValue={d.name} required minLength={2} maxLength={80} aria-label={`New name for ${d.name}`} className={input} />
                <SubmitButton label="Save" pendingLabel="…" className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-3 py-1.5 text-xs font-medium text-white" />
              </form>
            </details>
            {d.system ? null : (
              <form action={setDepartmentActiveFormAction}>
                <input type="hidden" name="departmentId" value={d.id} /><input type="hidden" name="active" value={d.isActive ? 'false' : 'true'} /><input type="hidden" name="returnTo" value={returnTo} />
                <SubmitButton label={d.isActive ? 'Switch off' : 'Switch on'} pendingLabel="…" className={`${ghost} ${d.isActive ? 'text-[var(--ejo-error)]' : 'text-[var(--ejo-success)]'}`} />
              </form>
            )}
          </li>
        ))}
      </ul>
      <form action={createDepartmentFormAction} className="mt-3 flex flex-wrap gap-2">
        <input type="hidden" name="branchId" value={branchId} /><input type="hidden" name="returnTo" value={returnTo} />
        <input name="name" required minLength={2} maxLength={80} placeholder="New department, e.g. Finance, Human Resources, Sales" aria-label="New department name" className={input} />
        <SubmitButton label="Add department" pendingLabel="Adding…" className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-3 py-1.5 text-sm font-medium text-white" />
      </form>
    </div>
  );
}
