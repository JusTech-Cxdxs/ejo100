import { getSecurityRoles, listExitPasses } from '@/lib/actions/security';
import { LoadingLink } from '@/components/LoadingLink';
import { SecurityNav } from '@/components/SecurityNav';
import { EXIT_PASS_STATUS_LABEL, STATUS_CHIP } from '@/lib/security-rules';
import { formatDateTimeCompact } from '@/lib/utils/format-date';
import { LiveSearchInput } from '@/components/LiveSearchInput';

export default async function ExitPassesPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  const { tab, q } = await searchParams;
  const roles = await getSecurityRoles();
  const canSeeAll = roles.isGate || roles.isManager || roles.isMaster;
  const scope = tab === 'to_decide' ? 'to_decide' : tab === 'all' && canSeeAll ? 'all' : 'mine';
  const [passes, mine, toDecide, everything] = await Promise.all([listExitPasses(scope, q), listExitPasses('mine', q), listExitPasses('to_decide', q), canSeeAll ? listExitPasses('all', q) : Promise.resolve([])]);
  const tabs = [['mine', 'My passes', mine.length], ['to_decide', 'To decide', toDecide.length], ...(canSeeAll ? [['all', 'All passes', everything.length]] : [])] as [string, string, number][];
  return (
    <div className="p-4 sm:p-8">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Employee exit passes</h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--ejo-text-muted)]">Security will not permit any employee on duty to go out during working hours without an approved exit pass.</p>
        </div>
        <LoadingLink href="/security/exit-passes/new" className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90">+ Request an exit pass</LoadingLink>
      </div>
      <SecurityNav active="/security/exit-passes" />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {tabs.map(([k, l, n]) => (
          <LoadingLink key={k} href={`/security/exit-passes?tab=${k}${q ? `&q=${encodeURIComponent(q)}` : ''}`} className={`rounded-full px-3 py-1 text-xs font-medium ${scope === k ? 'bg-[var(--ejo-primary)] text-white' : 'border border-[var(--ejo-border)] text-[var(--ejo-text)]'}`}>{l} ({n})</LoadingLink>
        ))}
        <form className="flex w-full gap-2 sm:ml-auto sm:w-auto">
          <input type="hidden" name="tab" value={scope} />
          <LiveSearchInput name="q" defaultValue={q ?? ''} placeholder="Search pass number, name, reason…" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-1.5 text-sm text-[var(--ejo-text)]" />
        </form>
      </div>
      <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
        {passes.length === 0 ? <p className="text-sm text-[var(--ejo-text-muted)]">{scope === 'to_decide' ? 'Nothing is waiting for your decision.' : 'No exit passes yet.'}</p> : (
          <ul className="divide-y divide-[var(--ejo-border)]">
            {passes.map((p) => (
              <li key={p.id} className="flex flex-wrap items-start justify-between gap-2 py-3 text-sm">
                <span className="min-w-0">
                  <LoadingLink href={`/security/exit-passes/${p.id}`} className="font-medium text-[var(--ejo-primary)] hover:underline">{p.passNumber}</LoadingLink>
                  <span className="ml-2 text-[var(--ejo-text)]">{p.people.map((x) => x.name).join(', ')}</span>
                  <span className="block text-xs text-[var(--ejo-text-muted)]">
                    {p.reason} · {p.returning ? `returning${p.expectedReturnAt ? ` by ${formatDateTimeCompact(p.expectedReturnAt)}` : ''}` : 'not returning'} · requested by {p.requestedBy.fullName}
                  </span>
                  <span className="block text-xs text-[var(--ejo-text-muted)]">
                    {p.gateOutAt ? `Out ${formatDateTimeCompact(p.gateOutAt)}` : ''}{p.gateInAt ? ` · in ${formatDateTimeCompact(p.gateInAt)}` : ''}
                  </span>
                </span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CHIP[p.status]}`}>{EXIT_PASS_STATUS_LABEL[p.status]}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
