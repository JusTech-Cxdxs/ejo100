import { listWarrantyClaims } from '@/lib/actions/warranty-claims';
import { LoadingLink } from '@/components/LoadingLink';
import { CLAIM_STATUS_LABEL, CLAIM_STATUS_CLASS, CLAIM_GROUPS } from '@/lib/warranty-claim-status';
import { formatDateOnly } from '@/lib/utils/format-date';

function naira(n: number): string {
  return `₦${n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const GROUP_LABEL: Record<string, string> = {
  draft: 'Drafts',
  approval: 'Awaiting approval',
  to_submit: 'Ready to submit',
  with_provider: 'With the provider',
  accepted: 'Accepted (to settle)',
  rejected: 'Rejected',
  settled: 'Settled',
  cancelled: 'Cancelled',
};

/** Warranty claims register — every claim, its stage, its money, and what
 * needs doing next. */
export default async function WarrantyClaimsPage({ searchParams }: { searchParams: Promise<{ q?: string; group?: string }> }) {
  const { q, group: rawGroup } = await searchParams;
  const group = rawGroup && CLAIM_GROUPS[rawGroup] ? rawGroup : null;
  const claims = await listWarrantyClaims({ q });
  const inGroup = (key: string) => claims.filter((c: (typeof claims)[number]) => CLAIM_GROUPS[key]!.includes(c.status));
  const shown = group ? inGroup(group) : claims;
  const live = claims.filter((c: (typeof claims)[number]) => c.status !== 'CANCELLED');
  const claimed = live.reduce((s: number, c: (typeof claims)[number]) => s + Number(c.claimedAmount), 0);
  const decided = claims.filter((c: (typeof claims)[number]) => ['ACCEPTED', 'PARTIALLY_ACCEPTED', 'REJECTED', 'SETTLED'].includes(c.status));
  const approved = decided.reduce((s: number, c: (typeof claims)[number]) => s + Number(c.approvedAmount ?? 0), 0);
  const recovered = claims.reduce((s: number, c: (typeof claims)[number]) => s + Number(c.settledAmount ?? 0), 0);
  const approvalRate = decided.length ? Math.round((decided.filter((c: (typeof claims)[number]) => c.status !== 'REJECTED').length / decided.length) * 100) : null;
  const now = Date.now();

  return (
    <div className="p-8">
      <LoadingLink href="/warranty" className="mb-4 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">← Back to Warranty</LoadingLink>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Warranty claims</h1>
          <p className="mt-1 max-w-3xl text-sm text-[var(--ejo-text-muted)]">
            Every claim from draft to money received: staff draft it, the Warranty HOD and the Branch Manager approve it, it goes to
            the provider, and the decision and settlement are recorded. Start a claim from the warranty it is made against.
          </p>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4"><p className="text-xs text-[var(--ejo-text-muted)]">Claimed (excl. cancelled)</p><p className="mt-1 text-xl font-bold text-[var(--ejo-text)]">{naira(claimed)}</p></div>
        <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4"><p className="text-xs text-[var(--ejo-text-muted)]">Approved by providers</p><p className="mt-1 text-xl font-bold text-[var(--ejo-text)]">{naira(approved)}</p></div>
        <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4"><p className="text-xs text-[var(--ejo-text-muted)]">Recovered (money received)</p><p className="mt-1 text-xl font-bold text-[var(--ejo-success)]">{naira(recovered)}</p></div>
        <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4"><p className="text-xs text-[var(--ejo-text-muted)]">Approval rate (decided claims)</p><p className="mt-1 text-xl font-bold text-[var(--ejo-text)]">{approvalRate === null ? '—' : `${approvalRate}%`}</p></div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <LoadingLink href={`/warranty/claims${q ? `?q=${encodeURIComponent(q)}` : ''}`} className={`rounded-full px-3 py-1 text-xs font-medium ${!group ? 'bg-[var(--ejo-primary)] text-white' : 'border border-[var(--ejo-border)] text-[var(--ejo-text)]'}`}>All ({claims.length})</LoadingLink>
        {Object.keys(CLAIM_GROUPS).map((key) => (
          <LoadingLink key={key} href={`/warranty/claims?group=${key}${q ? `&q=${encodeURIComponent(q)}` : ''}`} className={`rounded-full px-3 py-1 text-xs font-medium ${group === key ? 'bg-[var(--ejo-primary)] text-white' : 'border border-[var(--ejo-border)] text-[var(--ejo-text)]'}`}>
            {GROUP_LABEL[key]} ({inGroup(key).length})
          </LoadingLink>
        ))}
      </div>
      <form className="mb-4 flex gap-2" action="/warranty/claims">
        {group ? <input type="hidden" name="group" value={group} /> : null}
        <input type="search" name="q" defaultValue={q ?? ''} placeholder="Search by claim, warranty, part, provider reference, customer or plate…" className="w-full max-w-md rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]" />
        <button type="submit" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]">Search</button>
      </form>

      {shown.length === 0 ? (
        <p className="text-sm text-[var(--ejo-text-muted)]">{claims.length === 0 ? 'No claims yet. Open a warranty and choose "Start a claim".' : 'No claims in this view.'}</p>
      ) : (
        <div className="overflow-x-auto rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--ejo-border)] bg-[var(--ejo-bg)] text-left text-xs text-[var(--ejo-text-muted)]">
                <th className="px-3 py-2">Claim</th>
                <th className="px-3 py-2">Causal part</th>
                <th className="px-3 py-2">Customer / vehicle</th>
                <th className="px-3 py-2">Provider</th>
                <th className="px-3 py-2 text-right">Claimed</th>
                <th className="px-3 py-2 text-right">Approved / received</th>
                <th className="px-3 py-2">Deadline</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((c: (typeof claims)[number]) => {
                const open = ['DRAFT', 'PENDING_HOD', 'PENDING_MANAGER', 'APPROVED_TO_SUBMIT'].includes(c.status);
                const daysLeft = c.deadlineAt ? Math.ceil((new Date(c.deadlineAt).getTime() - now) / 86400000) : null;
                return (
                  <tr key={c.id} className="border-b border-[var(--ejo-border)] align-top last:border-0">
                    <td className="px-3 py-2">
                      <LoadingLink href={`/warranty/claims/${c.id}`} className="font-medium text-[var(--ejo-primary)] hover:underline">{c.claimNumber}</LoadingLink>
                      <div className="text-xs"><LoadingLink href={`/warranty/${c.warranty.id}`} className="text-[var(--ejo-text-muted)] hover:underline">{c.warranty.warrantyNumber}</LoadingLink></div>
                      {c.resubmissionCount > 0 ? <div className="text-xs text-[var(--ejo-warning)]">Resubmission {c.resubmissionCount}</div> : null}
                    </td>
                    <td className="px-3 py-2 text-[var(--ejo-text)]">{c.causalPart}</td>
                    <td className="px-3 py-2 text-xs text-[var(--ejo-text)]">
                      {c.customer.fullName}
                      <div className="text-[var(--ejo-text-muted)]">{c.vehicle ? [c.vehicle.make, c.vehicle.model, c.vehicle.plateNumber].filter(Boolean).join(' ') : ''}</div>
                    </td>
                    <td className="px-3 py-2 text-xs text-[var(--ejo-text)]">
                      {c.provider.name}
                      {c.providerReference ? <div className="text-[var(--ejo-text-muted)]">Ref: {c.providerReference}</div> : null}
                    </td>
                    <td className="px-3 py-2 text-right text-[var(--ejo-text)]">{naira(Number(c.claimedAmount))}</td>
                    <td className="px-3 py-2 text-right text-xs text-[var(--ejo-text)]">
                      {c.approvedAmount !== null ? naira(Number(c.approvedAmount)) : '—'}
                      {c.settledAmount !== null ? <div className="text-[var(--ejo-success)]">{naira(Number(c.settledAmount))} received</div> : null}
                    </td>
                    <td className={`px-3 py-2 text-xs ${open && daysLeft !== null && daysLeft < 0 ? 'font-medium text-[var(--ejo-error)]' : open && daysLeft !== null && daysLeft <= 5 ? 'font-medium text-[var(--ejo-warning)]' : 'text-[var(--ejo-text-muted)]'}`}>
                      {c.deadlineAt ? formatDateOnly(c.deadlineAt) : '—'}
                      {open && daysLeft !== null ? <div>{daysLeft < 0 ? `${Math.abs(daysLeft)} ${Math.abs(daysLeft) === 1 ? 'day' : 'days'} late` : `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left`}</div> : null}
                    </td>
                    <td className="px-3 py-2"><span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${CLAIM_STATUS_CLASS[c.status]}`}>{CLAIM_STATUS_LABEL[c.status]}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
