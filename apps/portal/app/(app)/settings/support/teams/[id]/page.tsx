import { notFound } from 'next/navigation';
import { guardPage } from '@/lib/authz/server';
import { getSupportSetup } from '@/lib/actions/support-admin';
import { changeSupportMailboxAction, connectSupportMailboxAction, saveSupportQueueAction, setSupportQueueMembersAction } from '@/lib/actions/support-form-handlers';
import { mailAllowInsecure } from '@/lib/mail/config';
import { ConnectForm } from '@/components/mail/ConnectForm';
import { SubmitButton } from '@/components/SubmitButton';
import { SearchableChecklist } from '@/components/SearchableChecklist';
import { Icon, SectionCard, StatusChip } from '@/components/ui';
import { formatRelative } from '@/lib/utils/format-date';
import { AI_MODE_LABEL, QUEUE_KIND_LABEL } from '@/lib/support/core';
import { QueueFields, SaveRow, SupportSetupFrame, btn, btn2 } from '../../shared';

export const metadata = { title: 'Support team' };
export const dynamic = 'force-dynamic';

/** One support team: its addresses, who works it (and how many open requests each takes), and its details, targets and Enyo setting. */
export default async function SupportTeamPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ status?: string; error?: string }> }) {
  await guardPage('support.manage', '/settings/support');
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const s = await getSupportSetup();
  const q = s.queues.find((x) => x.id === id);
  if (!q) notFound();
  const insecure = mailAllowInsecure();
  return (
    <SupportSetupFrame active="/settings/support/teams" icon="users" title={q.name} sp={sp}
      description={<>{QUEUE_KIND_LABEL[q.kind]} · {AI_MODE_LABEL[q.aiMode].label}{q.isDefault ? ' · the default team' : ''}</>}>
      <div className="flex flex-wrap gap-2">
        <StatusChip tone={q.active ? 'success' : 'neutral'} label={q.active ? 'Active' : 'Switched off'} />
        <a href="#addresses" className={`${btn2} inline-flex items-center`}>Addresses</a>
        <a href="#people" className={`${btn2} inline-flex items-center`}>Who works it</a>
        <a href="#details" className={`${btn2} inline-flex items-center`}>Details & targets</a>
      </div>

      <SectionCard id="addresses" icon="mail" title="Addresses" description="Mail to these addresses becomes this team's requests; replies go out from the same address.">
        {q.mailboxes.length ? (
          <ul className="mb-4 space-y-2">
            {q.mailboxes.map((m) => (
              <li key={m.id} className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] p-3">
                <p className="flex flex-wrap items-center gap-2 break-all text-sm font-medium text-[var(--ejo-text)]"><Icon name="mail" size={15} />{m.address}
                  <StatusChip tone={m.status === 'ACTIVE' ? 'success' : m.status === 'PAUSED' ? 'neutral' : 'warning'} label={m.status === 'ACTIVE' ? 'Reading' : m.status === 'PAUSED' ? 'Paused' : 'Problem'} /></p>
                <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">{m.lastSyncAt ? `Last read ${formatRelative(m.lastSyncAt, new Date())}` : 'Not read yet'} · {m.imapHost}</p>
                {m.lastError ? <p className="mt-1 text-xs text-[var(--ejo-error)]">{m.lastError}</p> : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  {(m.status === 'PAUSED' ? ['resume', 'remove'] : ['pause', 'remove']).map((d) => (
                    <form key={d} action={changeSupportMailboxAction}>
                      <input type="hidden" name="mailboxId" value={m.id} /><input type="hidden" name="queueId" value={q.id} /><input type="hidden" name="do" value={d} />
                      <SubmitButton label={d === 'pause' ? 'Pause' : d === 'resume' ? 'Resume' : 'Remove'} pendingLabel="Saving…" className={`${btn2} ${d === 'remove' ? 'text-[var(--ejo-error)]' : ''}`} />
                    </form>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        ) : <p className="mb-4 text-sm text-[var(--ejo-text-muted)]">No address yet. Requests reach this team when colleagues move them here, from chat hand-overs, or from Get help.</p>}
        {s.mailReady ? (
          <details className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] p-3" open={!q.mailboxes.length}>
            <summary className="flex min-h-10 cursor-pointer items-center gap-2 text-sm font-medium text-[var(--ejo-primary)]"><Icon name="plus" size={15} />Connect an address to {q.name}</summary>
            <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">Create the address with your email provider (Google Workspace, Zoho, cPanel …) and an app password for it. Microsoft 365 sign-in is coming; until then use an app password where your tenant allows it.</p>
            <div className="mt-3"><ConnectForm action={connectSupportMailboxAction} defaults={{ displayName: q.name }} allowInsecure={insecure} reconnect={false} hidden={{ queueId: q.id }} addressLabel="Support address (e.g. warranty@yourcompany.com)" bare /></div>
          </details>
        ) : <p className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-warning)]/10 p-3 text-sm text-[var(--ejo-text)]">Email is not set up for this installation yet (MAILBOX_ENCRYPTION_KEY), so addresses cannot be connected.</p>}
      </SectionCard>

      <SectionCard id="people" icon="user" title="Who works this team" description="New requests go to the least busy colleague here (not those marked away), up to the number of open requests each takes.">
        <form action={setSupportQueueMembersAction} className="space-y-4">
          <input type="hidden" name="queueId" value={q.id} />
          <SearchableChecklist
            searchLabel="Search colleagues by name…"
            items={s.people.map((p) => {
              const m = q.members.find((x) => x.userId === p.id);
              return {
                key: p.id, text: p.name, checked: Boolean(m),
                render: (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded px-1 py-0.5">
                    <label className="inline-flex min-h-9 min-w-0 items-center gap-2 text-sm text-[var(--ejo-text)]"><input type="checkbox" name="member" value={p.id} defaultChecked={Boolean(m)} className="h-4 w-4 accent-[var(--ejo-primary)]" /><span className="truncate">{p.name}</span>{m?.away ? <span className="text-[11px] text-[var(--ejo-text-muted)]">(away)</span> : null}</label>
                    <label className="inline-flex shrink-0 items-center gap-1 text-[11px] text-[var(--ejo-text-muted)]">at most<input name={`capacity_${p.id}`} type="number" min={1} max={100} defaultValue={m?.capacity ?? 15} aria-label={`Most open requests for ${p.name}`} className="h-8 w-16 rounded border border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-1.5 text-sm" />open</label>
                  </div>
                ),
              };
            })}
          />
          <SaveRow note="They also need the “Work the Support centre” permission: the Customer care role has it, as do receptionists, workshop managers and branch administrators."><SubmitButton label="Save who works this team" pendingLabel="Saving…" className={btn} /></SaveRow>
        </form>
      </SectionCard>

      <SectionCard id="details" icon="settings" title="Details, targets and Enyo">
        <form action={saveSupportQueueAction} className="space-y-4">
          <QueueFields q={q} branches={s.branches} />
          <SaveRow><SubmitButton label="Save the team" pendingLabel="Saving…" className={btn} /></SaveRow>
        </form>
      </SectionCard>
    </SupportSetupFrame>
  );
}
