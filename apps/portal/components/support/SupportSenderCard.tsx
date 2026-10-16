import Link from 'next/link';
import { SectionCard } from '@/components/ui';
import { formatDateTime } from '@/lib/utils/format-date';
import type { SenderView } from '@/lib/support/context-core';
import { CopyLinkButton } from './CopyLinkButton';

/**
 * "Who is writing" on a support request: customer, colleague or both; whether
 * it is proven; why they cannot sign in (with the reason, for colleagues
 * only); their records — the staff page and the customer-portal link to send
 * them — and for a colleague their roles, recent errors (with references),
 * refused pages and the how-to guides that fit.
 */
export function SupportSenderCard({ s }: { s: SenderView }) {
  const muted = 'text-xs text-[var(--ejo-text-muted)]';
  return (
    <SectionCard icon="user" title="Who is writing" description={s.kindLabel}>
      <div className="space-y-4 text-sm">
        <p className={s.proven ? 'font-medium text-[var(--ejo-success)]' : 'text-[var(--ejo-warning-text)]'}>{s.provenLabel}</p>

        {s.login ? (
          <div className={`rounded-[var(--ejo-radius-md)] border p-2.5 ${s.login.needsPerson ? 'border-[var(--ejo-warning)]/40 bg-[var(--ejo-warning)]/[0.07]' : 'border-[var(--ejo-border)] bg-[var(--ejo-bg)]'}`}>
            <p className="text-xs font-semibold text-[var(--ejo-text)]">Signing in</p>
            <p className="mt-0.5 text-xs leading-relaxed text-[var(--ejo-text)]">{s.login.text}</p>
          </div>
        ) : null}

        {s.records.length ? (
          <div>
            <p className="text-xs font-semibold text-[var(--ejo-text)]">Their records</p>
            <ul className="mt-1.5 space-y-2">
              {s.records.map((r) => (
                <li key={r.key} className="leading-snug">
                  <Link href={r.href} prefetch={false} className="font-medium text-[var(--ejo-primary)] hover:underline">{r.label}</Link>
                  <span className={`block ${muted}`}>{r.detail}</span>
                  {r.customerUrl ? <CopyLinkButton url={r.customerUrl} label="Copy their portal link" /> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {s.staff ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-[var(--ejo-text)]">As a colleague</p>
            <p className="text-xs text-[var(--ejo-text)]">{s.staff.roles.join(', ') || 'No role'}{s.staff.where ? ` · ${s.staff.where}` : ''}{s.staff.active ? '' : ' · deactivated'}</p>
            <p className={muted}>{s.staff.lastSignIn ? `Last signed in ${formatDateTime(s.staff.lastSignIn)}` : 'No sign-in recorded'}{s.staff.failedRecently ? ` · ${s.staff.failedRecently} failed sign-in${s.staff.failedRecently === 1 ? '' : 's'} this week` : ''}</p>
            {s.staff.work ? <p className={muted}>{s.staff.work}</p> : null}
            {s.staff.errors.length ? (
              <ul className="space-y-1">
                {s.staff.errors.map((e) => (
                  <li key={e.ref} className="text-xs">
                    <span className="font-medium text-[var(--ejo-error)]">Error {e.href ? <Link href={e.href} prefetch={false} className="underline">{e.ref}</Link> : e.ref}</span>
                    <span className="text-[var(--ejo-text-muted)]"> · {e.path ?? 'a page'} · {formatDateTime(e.at)}</span>
                    <span className="block break-words text-[var(--ejo-text-muted)]">{e.message}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {s.staff.denied.length ? <p className={muted}>Refused pages this week: {s.staff.denied.map((d) => d.page).join(', ')}</p> : null}
            {s.staff.guides.length ? (
              <p className="text-xs">How-to guides that fit: {s.staff.guides.map((g, i) => <span key={g.href + i}>{i ? ', ' : ''}<Link href={g.href} prefetch={false} className="text-[var(--ejo-primary)] hover:underline">{g.title}</Link></span>)}</p>
            ) : null}
          </div>
        ) : null}

        {s.customerLinks.length || s.staffLinks.length ? (
          <details>
            <summary className="flex min-h-10 cursor-pointer items-center text-xs font-medium text-[var(--ejo-primary)]">Links to send them</summary>
            <ul className="mt-1 space-y-1.5">
              {(s.kind === 'staff' ? s.staffLinks : s.customerLinks).map((l) => (
                <li key={l.url} className="text-xs"><span className="text-[var(--ejo-text)]">{l.label}</span> <CopyLinkButton url={l.url} label="Copy" /></li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </SectionCard>
  );
}
