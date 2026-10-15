import type { Metadata } from 'next';
import { currentAssist, NOT_DURING_ASSIST } from '@/lib/authz/server';
import { getMyMailbox, getMyMailDigest, listMyMail, readMyMessage, type MailDetail, type MailListItem, type MailView } from '@/lib/actions/mail';
import { messageFlagsFormAction } from '@/lib/actions/mail-form-handlers';
import { PageHeader, HeaderAction, EmptyState, Icon } from '@/components/ui';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { LoadingLink } from '@/components/LoadingLink';
import { SubmitButton } from '@/components/SubmitButton';
import { MailSync } from '@/components/mail/MailSync';
import { NOT_SET_UP } from '@/lib/mail/config';
import { CATEGORY_LABEL, PRIORITY_LABEL } from '@/lib/mail/brief-core';
import { addressLabel, formatSize } from '@/lib/mail/parse-core';
import { formatLagos, plural, relativeTime } from '@/lib/reminders-rules';
import { friendlyError } from '@/lib/errors';

export const metadata: Metadata = { title: 'Mail' };

const STATUS: Record<string, string> = {
  sent: 'Sent.',
  disconnected: 'Mailbox disconnected. Its settings, password and stored copies were deleted here. Nothing changed in the mailbox itself.',
  consent_given: 'Thank you. Enyo will sort and summarise new mail. You can withdraw this any time in Mail settings.',
  consent_declined: 'Understood. Enyo will not read your email. You can change this any time in Mail settings.',
};

const VIEWS: { key: MailView; label: string; icon: 'inbox' | 'mail' | 'star' | 'bell' }[] = [
  { key: 'inbox', label: 'Inbox', icon: 'inbox' },
  { key: 'unread', label: 'Unread', icon: 'mail' },
  { key: 'flagged', label: 'Flagged', icon: 'star' },
  { key: 'today', label: 'Needs you today', icon: 'bell' },
];

function href(p: { view?: MailView; q?: string; m?: string; before?: string }): string {
  const s = new URLSearchParams();
  if (p.view && p.view !== 'inbox') s.set('view', p.view);
  if (p.q) s.set('q', p.q);
  if (p.before) s.set('before', p.before);
  if (p.m) s.set('m', p.m);
  const q = s.toString();
  return `/mail${q ? `?${q}` : ''}`;
}

const shortWhen = (d: Date) => {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
  const day = d.toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
  return day === today
    ? d.toLocaleTimeString('en-GB', { timeZone: 'Africa/Lagos', hour: 'numeric', minute: '2-digit', hour12: true }).replace(/\s?([ap])m/i, (_, x: string) => ` ${x.toLowerCase()}m`)
    : d.toLocaleDateString('en-GB', { timeZone: 'Africa/Lagos', day: 'numeric', month: 'short' });
};

/**
 * The person's own work mailbox: folders (with unread counts) | messages |
 * the message and Enyo's brief. Phones show one pane at a time. Text only —
 * remote HTML is never shown.
 */
export default async function MailPage({ searchParams }: { searchParams: Promise<{ view?: string; q?: string; m?: string; before?: string; status?: string; error?: string }> }) {
  const sp = await searchParams;
  if (await currentAssist()) {
    return (
      <div className="p-4 sm:p-8">
        <PageHeader icon="mail" title="Mail" />
        <EmptyState icon="lock" title="Not available during an assisted session">{NOT_DURING_ASSIST} A person&apos;s mail is only ever shown to them.</EmptyState>
      </div>
    );
  }
  const box = await getMyMailbox();
  if (box.feature === 'not_set_up' || !box.account) {
    return (
      <div className="p-4 sm:p-8">
        <PageHeader icon="mail" title="Mail" description="Read and answer your work email here, next to your jobs — with Enyo's help if you want it." />
        {sp.status && STATUS[sp.status] ? <div className="max-w-3xl" role="status"><FormFeedbackBanner kind="success" message={STATUS[sp.status]!} /></div> : null}
        {box.feature === 'not_set_up' ? (
          <EmptyState icon="settings" title={NOT_SET_UP}>Ask your administrator to set it up. Until then, keep using your usual mail app.</EmptyState>
        ) : (
          <EmptyState icon="mail" title="Connect your work mailbox" action={<HeaderAction href="/mail/connect" icon="mail">Connect mailbox</HeaderAction>}>
            Gmail, Zoho and your organisation&apos;s own (cPanel) mailboxes work with an app password. Only you can see your mail here — nobody else, administrators included.
          </EmptyState>
        )}
      </div>
    );
  }

  const view: MailView = (['unread', 'flagged', 'today'] as const).includes(sp.view as never) ? (sp.view as MailView) : 'inbox';
  const q = (sp.q ?? '').trim().slice(0, 100);
  const selectedId = typeof sp.m === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(sp.m) ? sp.m : null;
  // The open message first (it is marked read), then the list and counts reflect that.
  const selected = selectedId ? await readMyMessage(selectedId).then((d) => ({ ok: true as const, d })).catch((err) => ({ ok: false as const, message: friendlyError(err, 'This message could not be opened.', 'mail-page') })) : null;
  const [list, digest] = await Promise.all([listMyMail({ view, q, before: sp.before }), getMyMailDigest()]);
  const account = box.account;
  const counts: Record<MailView, number> = { inbox: list.counts.all, unread: list.counts.unread, flagged: list.counts.flagged, today: list.counts.today };
  const lastSync = account.lastSyncAt ? relativeTime(account.lastSyncAt) : null;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        icon="mail"
        title="Mail"
        description={<span className="break-all">{account.displayName ? `${account.displayName} · ` : ''}{account.address}</span>}
        actions={<><HeaderAction href="/mail/compose" icon="plus">New message</HeaderAction><HeaderAction href="/mail/settings" icon="settings" variant="secondary">Mail settings</HeaderAction></>}
        meta={<MailSync lastSync={lastSync} />}
      />
      {sp.status && STATUS[sp.status] ? <div className="max-w-3xl" role="status"><FormFeedbackBanner kind="success" message={STATUS[sp.status]!} /></div> : null}
      {sp.error ? <div className="max-w-3xl" role="alert"><FormFeedbackBanner kind="error" message={sp.error} /></div> : null}
      {account.status === 'ERROR' && account.lastError ? (
        <div className="max-w-3xl" role="alert"><FormFeedbackBanner kind="warning" message={`${account.lastError} If your password changed, update it in Mail settings.`} /></div>
      ) : null}
      {box.aiAvailable && !account.aiConsent ? (
        <p className="mb-4 max-w-3xl rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-4 py-3 text-sm text-[var(--ejo-text-muted)]">
          <Icon name="sparkles" size={15} className="mr-1 inline text-[var(--ejo-primary)]" />
          Enyo can sort your mail and give each message a one-line summary. <LoadingLink href="/mail/settings#enyo" className="font-medium text-[var(--ejo-primary)] hover:underline">Choose in Mail settings</LoadingLink>
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[200px_minmax(0,1fr)] xl:grid-cols-[210px_minmax(260px,0.9fr)_minmax(0,1.6fr)]">
        {/* Folders and today's digest */}
        <aside className={`min-w-0 space-y-4 ${selectedId ? 'hidden lg:block' : ''}`} aria-label="Mail folders">
          <nav aria-label="Folders" className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
            {VIEWS.map((v) => {
              const active = v.key === view;
              return (
                <LoadingLink key={v.key} href={href({ view: v.key, q })} aria-current={active ? 'page' : undefined}
                  className={`flex min-h-11 shrink-0 items-center justify-between gap-3 rounded-[var(--ejo-radius-md)] px-3 text-sm font-medium transition-colors ${active ? 'bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)]' : 'text-[var(--ejo-text-muted)] hover:bg-[var(--ejo-surface)] hover:text-[var(--ejo-text)]'}`}>
                  <span className="flex items-center gap-2"><Icon name={v.icon} size={16} />{v.label}</span>
                  {v.key !== 'inbox' && counts[v.key] > 0 ? <span className="rounded-full bg-[var(--ejo-primary)]/15 px-2 text-[11px] font-semibold text-[var(--ejo-primary)]">{counts[v.key]}</span> : null}
                </LoadingLink>
              );
            })}
          </nav>
          <section aria-labelledby="todays-mail" className="hidden rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-3 lg:block">
            <h2 id="todays-mail" className="text-xs font-semibold uppercase tracking-wide text-[var(--ejo-text-muted)]">Today&apos;s mail</h2>
            <p className="mt-1 text-sm text-[var(--ejo-text)]">{plural(digest.unread, 'unread message')}</p>
            {digest.needsYou.length ? (
              <ul className="mt-2 space-y-2">
                {digest.needsYou.map((n) => (
                  <li key={n.id}>
                    <LoadingLink href={href({ view, q, m: n.id })} className="block rounded-[var(--ejo-radius-md)] px-1 py-1 text-xs hover:bg-[var(--ejo-bg)]">
                      <span className="block truncate font-medium text-[var(--ejo-text)]">{n.subject}</span>
                      <span className="block truncate text-[var(--ejo-text-muted)]">{n.summary ?? n.from}</span>
                    </LoadingLink>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">Nothing marked as needing you today.</p>}
          </section>
        </aside>

        {/* Message list */}
        <section className={`min-w-0 ${selectedId ? 'hidden xl:block' : ''}`} aria-label="Messages">
          <form action="/mail" method="get" role="search" className="mb-3 flex gap-2">
            {view !== 'inbox' ? <input type="hidden" name="view" value={view} /> : null}
            <label htmlFor="mail-search" className="sr-only">Search your mail</label>
            <input id="mail-search" name="q" type="search" defaultValue={q} placeholder="Search by sender, subject, JC- number, plate…" maxLength={100} enterKeyHint="search"
              className="min-h-11 w-full min-w-0 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 text-base text-[var(--ejo-text)] sm:text-sm" />
            <button type="submit" className="min-h-11 shrink-0 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-3 text-sm font-medium text-[var(--ejo-text)] hover:text-[var(--ejo-primary)]">Search</button>
          </form>
          {q ? <p className="mb-2 text-xs text-[var(--ejo-text-muted)]">{plural(list.items.length, 'message')} matching “{q}” · <LoadingLink href={href({ view })} className="text-[var(--ejo-primary)] hover:underline">Clear</LoadingLink></p> : null}
          {list.items.length ? (
            <ul className="divide-y divide-[var(--ejo-border)] overflow-hidden rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)]">
              {list.items.map((m) => <MessageRow key={m.id} m={m} active={m.id === selectedId} link={href({ view, q, before: sp.before, m: m.id })} showBrief={account.aiConsent} />)}
            </ul>
          ) : (
            <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)]">
              <EmptyState compact icon="inbox" title={q ? 'Nothing matches' : view === 'inbox' ? (account.lastSyncAt ? 'No messages in the last 30 days' : 'Fetching your mail…') : 'Nothing here'}>
                {q ? 'Try other words, or search all folders from the Inbox.' : view === 'inbox' ? 'New mail appears here. Press Refresh to check now.' : 'You are all caught up.'}
              </EmptyState>
            </div>
          )}
          {list.more && list.items.length ? (
            <LoadingLink href={href({ view, q, before: list.items[list.items.length - 1]!.receivedAt.toISOString() })} className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-[var(--ejo-primary)] hover:underline">Older messages</LoadingLink>
          ) : null}
        </section>

        {/* Reading pane */}
        <section className={`min-w-0 ${selectedId ? '' : 'hidden xl:block'} lg:col-span-1 lg:col-start-2 xl:col-start-auto`} aria-label="Message">
          {selectedId ? (
            <LoadingLink href={href({ view, q, before: sp.before })} className="mb-3 inline-flex min-h-11 items-center gap-1.5 text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-primary)] xl:hidden">
              <Icon name="arrow-left" size={15} />Back to {VIEWS.find((v) => v.key === view)!.label.toLowerCase()}
            </LoadingLink>
          ) : null}
          {selected === null ? (
            <div className="rounded-[var(--ejo-radius-lg)] border border-dashed border-[var(--ejo-border)] p-8 text-center text-sm text-[var(--ejo-text-muted)]">Choose a message to read it.</div>
          ) : !selected.ok ? (
            <div role="alert"><FormFeedbackBanner kind="error" message={selected.message} /></div>
          ) : (
            <Reading d={selected.d} consent={account.aiConsent} aiAvailable={box.aiAvailable} back={href({ view, q, before: sp.before, m: selected.d.id })} />
          )}
        </section>
      </div>
    </div>
  );
}

function MessageRow({ m, active, link, showBrief }: { m: MailListItem; active: boolean; link: string; showBrief: boolean }) {
  return (
    <li>
      <LoadingLink href={link} aria-current={active ? 'true' : undefined}
        className={`block px-3 py-3 transition-colors ${active ? 'bg-[var(--ejo-primary)]/10' : 'hover:bg-[var(--ejo-bg)]'}`}>
        <div className="flex items-baseline justify-between gap-2">
          <span className={`flex min-w-0 items-center gap-1.5 truncate text-sm ${m.seen ? 'text-[var(--ejo-text-muted)]' : 'font-semibold text-[var(--ejo-text)]'}`}>
            {!m.seen ? <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--ejo-primary)]" aria-label="Unread" /> : null}
            <span className="truncate">{m.fromName ?? m.fromAddress}</span>
          </span>
          <span className="shrink-0 text-[11px] text-[var(--ejo-text-muted)]">{shortWhen(m.receivedAt)}</span>
        </div>
        <p className={`mt-0.5 flex items-center gap-1.5 truncate text-sm ${m.seen ? 'text-[var(--ejo-text)]' : 'font-medium text-[var(--ejo-text)]'}`}>
          {m.flagged ? <span className="text-[var(--ejo-warning)]" aria-label="Flagged"><Icon name="star" size={13} /></span> : null}
          {showBrief && m.aiPriority === 1 ? <span className="shrink-0 rounded-full bg-[var(--ejo-warning)]/15 px-1.5 text-[10px] font-semibold text-[var(--ejo-warning-text)]">Today</span> : null}
          {m.hasAttachments ? <span className="sr-only">Has attachments.</span> : null}
          <span className="truncate">{m.subject}</span>
        </p>
        <p className="mt-0.5 line-clamp-2 break-words text-xs text-[var(--ejo-text-muted)]">{showBrief && m.aiSummary ? m.aiSummary : m.snippet}</p>
      </LoadingLink>
    </li>
  );
}

function Reading({ d, consent, aiAvailable, back }: { d: MailDetail; consent: boolean; aiAvailable: boolean; back: string }) {
  const small = 'inline-flex min-h-10 items-center gap-1.5 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 text-xs font-medium text-[var(--ejo-text)] transition-colors hover:border-[var(--ejo-primary)]/60 hover:text-[var(--ejo-primary)]';
  const flagForm = (field: 'seen' | 'flagged', value: '0' | '1', label: string, returnTo: string) => (
    <form action={messageFlagsFormAction}>
      <input type="hidden" name="messageId" value={d.id} />
      <input type="hidden" name={field} value={value} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <SubmitButton label={label} pendingLabel="…" className={small} />
    </form>
  );
  return (
    <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_280px]">
      <article className="min-w-0 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4 sm:p-5">
        <h2 className="break-words text-lg font-semibold text-[var(--ejo-text)]">{d.subject}</h2>
        <dl className="mt-2 space-y-0.5 text-xs text-[var(--ejo-text-muted)]">
          <div className="flex gap-1"><dt className="shrink-0">From:</dt><dd className="min-w-0 break-all text-[var(--ejo-text)]">{addressLabel({ address: d.fromAddress, name: d.fromName ?? undefined })}</dd></div>
          {d.to.length ? <div className="flex gap-1"><dt className="shrink-0">To:</dt><dd className="min-w-0 break-all">{d.to.map(addressLabel).join(', ')}</dd></div> : null}
          {d.cc.length ? <div className="flex gap-1"><dt className="shrink-0">Cc:</dt><dd className="min-w-0 break-all">{d.cc.map(addressLabel).join(', ')}</dd></div> : null}
          <div className="flex gap-1"><dt className="shrink-0">Received:</dt><dd>{formatLagos(d.receivedAt)}</dd></div>
        </dl>
        <div className="mt-3 flex flex-wrap gap-2">
          <LoadingLink href={`/mail/compose?inReplyTo=${d.id}`} className={small}><Icon name="arrow-left" size={14} />Reply</LoadingLink>
          <LoadingLink href={`/mail/compose?inReplyTo=${d.id}&all=1`} className={small}>Reply all</LoadingLink>
          <LoadingLink href={`/mail/compose?forward=${d.id}`} className={small}><Icon name="arrow-right" size={14} />Forward</LoadingLink>
          {flagForm('seen', '0', 'Mark unread', back.replace(/([?&])m=[^&]+&?/, '$1').replace(/[?&]$/, ''))}
          {d.flagged ? flagForm('flagged', '0', 'Remove flag', back) : flagForm('flagged', '1', 'Flag', back)}
          <LoadingLink href={`/reminders/new?${new URLSearchParams({ title: `Follow up: ${d.subject}`.slice(0, 160) }).toString()}`} className={small}><Icon name="clock" size={14} />Remind me</LoadingLink>
        </div>
        {d.suspicious ? (
          <p className="mt-3 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-warning)]/30 bg-[var(--ejo-warning)]/10 px-3 py-2 text-xs text-[var(--ejo-warning-text)]">
            This email contains wording that tries to give instructions to an assistant. Enyo treats it as text only and ignores it. Be careful with any links or requests in it.
          </p>
        ) : null}
        {/* Plain text only: the email's own HTML is never shown. */}
        <div className="mt-4 whitespace-pre-wrap break-words border-t border-[var(--ejo-border)] pt-4 text-sm leading-relaxed text-[var(--ejo-text)]">{d.body || '(This message has no text.)'}</div>
        {d.attachments.length ? (
          <div className="mt-4 border-t border-[var(--ejo-border)] pt-3">
            <h3 className="text-xs font-semibold text-[var(--ejo-text-muted)]">{plural(d.attachments.length, 'attachment')} — open them in your mail app</h3>
            <ul className="mt-1 space-y-1">{d.attachments.map((a, i) => <li key={`${a.name}-${i}`} className="flex items-center gap-2 text-xs text-[var(--ejo-text)]"><Icon name="file" size={14} /><span className="break-all">{a.name}</span><span className="text-[var(--ejo-text-muted)]">{formatSize(a.size)}</span></li>)}</ul>
          </div>
        ) : null}
        {d.thread.length ? (
          <div className="mt-4 border-t border-[var(--ejo-border)] pt-3">
            <h3 className="text-xs font-semibold text-[var(--ejo-text-muted)]">In this conversation</h3>
            <ul className="mt-1 space-y-1">
              {d.thread.map((t) => (
                <li key={t.id}><LoadingLink href={`/mail?m=${t.id}`} className="block min-h-10 rounded-[var(--ejo-radius-md)] px-2 py-1.5 text-xs hover:bg-[var(--ejo-bg)]"><span className="font-medium text-[var(--ejo-text)]">{t.fromName ?? t.fromAddress}</span> <span className="text-[var(--ejo-text-muted)]">· {shortWhen(t.receivedAt)} · {t.snippet}</span></LoadingLink></li>
              ))}
            </ul>
          </div>
        ) : null}
      </article>

      <aside aria-label="Enyo's brief" className="order-first h-fit rounded-[var(--ejo-radius-lg)] 2xl:order-none border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--ejo-text)]"><Icon name="sparkles" size={16} className="text-[var(--ejo-primary)]" />Enyo&apos;s brief</h3>
        {!aiAvailable ? (
          <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">Enyo for email is switched off for your organisation.</p>
        ) : !consent ? (
          <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">Enyo does not read your email unless you allow it. <LoadingLink href="/mail/settings#enyo" className="font-medium text-[var(--ejo-primary)] hover:underline">Choose in Mail settings</LoadingLink></p>
        ) : !d.brief ? (
          <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">Not briefed yet. New messages are briefed when your mail is checked.</p>
        ) : (
          <div className="mt-2 space-y-3">
            <p className="text-sm text-[var(--ejo-text)]">{d.brief.summary}</p>
            <div className="flex flex-wrap gap-1.5">
              {d.brief.category ? <span className="rounded-full bg-[var(--ejo-info)]/15 px-2 py-0.5 text-[11px] font-semibold text-[var(--ejo-info)]">{CATEGORY_LABEL[d.brief.category]}</span> : null}
              {d.brief.priority === 1 || d.brief.priority === 2 || d.brief.priority === 3 ? (
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${d.brief.priority === 1 ? 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning-text)]' : 'bg-[var(--ejo-text-muted)]/15 text-[var(--ejo-text-muted)]'}`}>{PRIORITY_LABEL[d.brief.priority as 1 | 2 | 3]}</span>
              ) : null}
            </div>
            {d.brief.refs.length ? (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ejo-text-muted)]">Mentioned</p>
                <ul className="mt-1 space-y-1">{d.brief.refs.map((r) => <li key={`${r.kind}:${r.value}`}><LoadingLink href={r.href} className="text-xs font-medium text-[var(--ejo-primary)] hover:underline">{r.label}</LoadingLink></li>)}</ul>
              </div>
            ) : null}
            {d.brief.actions.length ? (
              <div className="flex flex-wrap gap-2">{d.brief.actions.map((a) => <LoadingLink key={`${a.kind}-${a.label}`} href={a.href} className={small}>{a.label}</LoadingLink>)}</div>
            ) : null}
            <p className="text-[11px] text-[var(--ejo-text-muted)]">Written by Enyo from this email. Check before acting on it.</p>
          </div>
        )}
      </aside>
    </div>
  );
}
