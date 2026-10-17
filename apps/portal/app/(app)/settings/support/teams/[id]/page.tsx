import { notFound } from 'next/navigation';
import { guardPage } from '@/lib/authz/server';
import { getSupportSetup } from '@/lib/actions/support-admin';
import { changeSupportMailboxAction, connectSupportMailboxAction, saveSupportQueueAction, setSupportQueueMembersAction } from '@/lib/actions/support-form-handlers';
import { mailAllowInsecure } from '@/lib/mail/config';
import { ConnectForm } from '@/components/mail/ConnectForm';
import { SubmitButton } from '@/components/SubmitButton';
import { SearchableChecklist } from '@/components/SearchableChecklist';
import { EditableSection, Icon, StatusChip, ViewList } from '@/components/ui';
import { formatRelative } from '@/lib/utils/format-date';
import { AI_MODE_LABEL, QUEUE_KIND_LABEL } from '@/lib/support/core';
import { QueueFields, SaveRow, SupportSetupFrame, TargetsView, btn, btn2 } from '../../shared';

export const metadata = { title: 'Support team' };
export const dynamic = 'force-dynamic';

/**
 * One support team, read first and changed on purpose (each part has its own
 * Edit): its addresses and automatic reply, who works it (how many open
 * requests each takes, who leads it), and its details, targets and Enyo
 * setting.
 */
export default async function SupportTeamPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ status?: string; error?: string; edit?: string }> }) {
  await guardPage('support.manage', '/settings/support');
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const s = await getSupportSetup();
  const q = s.queues.find((x) => x.id === id);
  if (!q) notFound();
  const insecure = mailAllowInsecure();
  const here = `/settings/support/teams/${q.id}`;
  const branch = q.branchId ? s.branches.find((b) => b.id === q.branchId)?.name ?? 'A branch' : 'The whole organisation';
  const leads = q.members.filter((m) => m.isLead);
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

  return (
    <SupportSetupFrame active="/settings/support/teams" icon="users" title={q.name} sp={sp}
      description={<>{QUEUE_KIND_LABEL[q.kind]} · {AI_MODE_LABEL[q.aiMode].label}{q.isDefault ? ' · the default team' : ''}</>}>
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip tone={q.active ? 'success' : 'neutral'} label={q.active ? 'Active' : 'Switched off'} />
        <span className="text-xs text-[var(--ejo-text-muted)]">{plural(q.members.length, 'colleague', 'colleagues')} · {plural(leads.length, 'lead', 'leads')} · {plural(q.mailboxes.length, 'address', 'addresses')}</span>
      </div>

      <EditableSection id="addresses" icon="mail" title="Addresses and automatic reply" description="Mail to these addresses becomes this team’s requests; replies go out from the same address."
        editing={sp.edit === 'address'} editHref={`${here}?edit=address#addresses`} cancelHref={`${here}#addresses`} editLabel="Connect an address"
        view={(
          <div className="space-y-4">
            {q.mailboxes.length ? (
              <ul className="space-y-2">
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
            ) : <p className="text-sm text-[var(--ejo-text-muted)]">No address yet. Requests reach this team when colleagues move them here, from chat hand-overs, from the customer portal, or from Get help.</p>}
            <div className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ejo-text-muted)]">Automatic reply</p>
              {q.autoAcknowledge ? (
                <>
                  <p className="mt-1 text-sm text-[var(--ejo-text)]">On: everyone who emails this team gets an acknowledgement at once with the reference number and when to expect an answer.</p>
                  {q.ackMessage ? <p className="mt-2 whitespace-pre-wrap rounded-[var(--ejo-radius-md)] bg-[var(--ejo-bg)] p-2.5 text-sm text-[var(--ejo-text)]">“{q.ackMessage}”</p> : <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">No team message of its own yet — add one under Details (Edit).</p>}
                </>
              ) : <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">Off: no acknowledgement is sent. Turn it on under Details (Edit).</p>}
            </div>
          </div>
        )}>
        {s.mailReady ? (
          <>
            <p className="mb-3 text-xs text-[var(--ejo-text-muted)]">Create the address with your email provider (Google Workspace, Zoho, cPanel …) and an app password for it. Microsoft 365 sign-in is coming; until then use an app password where your tenant allows it.</p>
            <ConnectForm action={connectSupportMailboxAction} defaults={{ displayName: q.name }} allowInsecure={insecure} reconnect={false} hidden={{ queueId: q.id }} addressLabel="Support address (e.g. warranty@yourcompany.com)" bare />
          </>
        ) : <p className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-warning)]/10 p-3 text-sm text-[var(--ejo-text)]">Email is not set up for this installation yet (MAILBOX_ENCRYPTION_KEY), so addresses cannot be connected.</p>}
      </EditableSection>

      <EditableSection id="people" icon="user" title="Who works this team" description="New requests go to the least busy colleague here who is not away and has room; each is emailed when a request becomes theirs. Leads are emailed when nobody can take one, and when a request is late."
        editing={sp.edit === 'people'} editHref={`${here}?edit=people#people`} cancelHref={`${here}#people`} editLabel="Change who works it"
        view={q.members.length ? (
          <ul className="divide-y divide-[var(--ejo-border)] rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)]">
            {q.members.map((m) => (
              <li key={m.userId} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 font-medium text-[var(--ejo-text)]">{m.name}</span>
                {m.isLead ? <StatusChip tone="brand" label="Lead" /> : null}
                {m.away ? <StatusChip tone="neutral" label="Away" /> : null}
                <span className="text-xs text-[var(--ejo-text-muted)]">at most {m.capacity} open</span>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-[var(--ejo-text-muted)]">Nobody yet: new requests wait without an owner and the support managers are emailed. Choose who works it.</p>}>
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
                    <span className="inline-flex shrink-0 items-center gap-3">
                      <label className="inline-flex items-center gap-1 text-[11px] text-[var(--ejo-text-muted)]"><input type="checkbox" name="lead" value={p.id} defaultChecked={Boolean(m?.isLead)} className="h-4 w-4 accent-[var(--ejo-primary)]" />Lead</label>
                      <label className="inline-flex items-center gap-1 text-[11px] text-[var(--ejo-text-muted)]">at most<input name={`capacity_${p.id}`} type="number" min={1} max={100} defaultValue={m?.capacity ?? 15} aria-label={`Most open requests for ${p.name}`} className="h-8 w-16 rounded border border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-1.5 text-sm" />open</label>
                    </span>
                  </div>
                ),
              };
            })}
          />
          <SaveRow note="They also need the “Work the Support centre” permission: the Customer care roles have it, as do receptionists, workshop managers and branch administrators. A lead must also be ticked as working the team."><SubmitButton label="Save who works this team" pendingLabel="Saving…" className={btn} /></SaveRow>
        </form>
      </EditableSection>

      <EditableSection id="details" icon="settings" title="Details, targets and Enyo"
        editing={sp.edit === 'details'} editHref={`${here}?edit=details#details`} cancelHref={`${here}#details`}
        view={(
          <div className="space-y-5">
            <ViewList rows={[
              { label: 'Team name', value: q.name },
              { label: 'What it handles', value: QUEUE_KIND_LABEL[q.kind] },
              { label: 'Branch', value: branch },
              { label: 'How Enyo helps', value: <>{AI_MODE_LABEL[q.aiMode].label}<span className="block text-xs text-[var(--ejo-text-muted)]">{AI_MODE_LABEL[q.aiMode].help}</span></> },
              { label: 'Automatic reply', value: q.autoAcknowledge ? 'On' : 'Off' },
              { label: 'Default team', value: q.isDefault ? 'Yes — chat hand-overs and anything not sorted come here' : 'No' },
              { label: 'Status', value: q.active ? 'Active' : 'Switched off' },
              { label: 'Description', value: q.description || '—' },
              { label: 'Signature under replies', value: q.signature ? <span className="whitespace-pre-wrap">{q.signature}</span> : '—' },
            ]} />
            <div>
              <p className="mb-1 text-xs font-medium text-[var(--ejo-text-muted)]">Targets (urgent counts every hour; the rest opening hours only)</p>
              <TargetsView t={q.targets} />
            </div>
          </div>
        )}>
        <form action={saveSupportQueueAction} className="space-y-4">
          <QueueFields q={q} branches={s.branches} />
          <SaveRow><SubmitButton label="Save the team" pendingLabel="Saving…" className={btn} /></SaveRow>
        </form>
      </EditableSection>
    </SupportSetupFrame>
  );
}
