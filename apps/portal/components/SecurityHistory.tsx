import { AuditTrail } from '@/components/AuditTrail';
import { securityActionLabel, securityActionDetail } from '@/lib/security-labels';
import { formatDateTime } from '@/lib/utils/format-date';
import type { getSecurityHistory } from '@/lib/actions/security';

type History = Awaited<ReturnType<typeof getSecurityHistory>>;

/** The full record of a Visit / Exit Pass: every step, and every email —
 * sent or failed — so nothing that happened is ever missing. */
export function SecurityHistory({ history }: { history: History }) {
  const card = 'rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6';
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className={card}>
        <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Audit trail</h2>
        {history.entries.length === 0 ? <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">No recorded activity yet.</p> : (
          <AuditTrail
            entries={history.entries.map((e) => ({
              id: e.id,
              actionLabel: securityActionLabel(e.action),
              userName: e.userName,
              detail: securityActionDetail(e.action, (e.metadata as Record<string, unknown> | null) ?? null),
              dateLabel: formatDateTime(e.createdAt),
            }))}
          />
        )}
      </div>
      <div className={card}>
        <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Emails ({history.emails.length})</h2>
        {history.emails.length === 0 ? <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">No emails for this record yet.</p> : (
          <ul className="mt-3 space-y-2">
            {history.emails.map((m) => (
              <li key={m.id} className="text-sm">
                <p className="text-[var(--ejo-text)]">
                  <span className={`mr-2 rounded-full px-2 py-0.5 text-[11px] font-medium ${m.sent ? 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]' : 'bg-[var(--ejo-error)]/15 text-[var(--ejo-error)]'}`}>{m.sent ? 'Sent' : 'Failed'}</span>
                  {m.subject}
                </p>
                <p className="text-xs text-[var(--ejo-text-muted)]">To {m.recipient} · {formatDateTime(m.createdAt)}{m.error ? ` · ${m.error}` : ''}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
