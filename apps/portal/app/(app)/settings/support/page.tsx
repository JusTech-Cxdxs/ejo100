import { guardPage } from '@/lib/authz/server';
import { getSupportSetup } from '@/lib/actions/support-admin';
import {
  changeSupportMailboxAction, connectSupportMailboxAction, saveSupportQueueAction, saveSupportSettingsAction, setSupportQueueMembersAction,
} from '@/lib/actions/support-form-handlers';
import { mailAllowInsecure } from '@/lib/mail/config';
import { PageHeader, SectionCard, StatusChip, Icon } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { ConnectForm } from '@/components/mail/ConnectForm';
import { formatRelative } from '@/lib/utils/format-date';
import { AI_MODES, AI_MODE_LABEL, DEFAULT_TARGETS, PRIORITIES, PRIORITY_LABEL, QUEUE_KINDS, QUEUE_KIND_LABEL, type Targets } from '@/lib/support/core';

export const metadata = { title: 'Support centre set-up' };
export const dynamic = 'force-dynamic';

const input = 'min-h-11 w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';
const label = 'mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]';
const btn = 'min-h-11 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-5 text-sm font-medium text-white hover:brightness-110';
const btn2 = 'min-h-10 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 text-sm font-medium text-[var(--ejo-text)] hover:border-[var(--ejo-primary)]/50';
const DAYS: [string, string][] = [['1', 'Monday'], ['2', 'Tuesday'], ['3', 'Wednesday'], ['4', 'Thursday'], ['5', 'Friday'], ['6', 'Saturday'], ['7', 'Sunday']];

const STATUS: Record<string, string> = {
  queue_saved: 'Team saved.', members_saved: 'Saved who works this team.', mailbox_connected: 'Mailbox connected. New mail to it becomes support requests within a few minutes.',
  mailbox_pause: 'Mailbox paused: it is not read or sent from until you resume it.', mailbox_resume: 'Mailbox resumed.', mailbox_remove: 'Mailbox removed and its stored password deleted.',
  settings_saved: 'Hours and rules saved.',
};

function TargetsFields({ t }: { t: Targets }) {
  return (
    <fieldset className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] p-3">
      <legend className="px-1 text-xs font-medium text-[var(--ejo-text-muted)]">Targets (first answer in minutes, solution in hours; urgent counts every hour, the rest opening hours only)</legend>
      <div className="grid gap-3 sm:grid-cols-4">
        {PRIORITIES.map((p) => (
          <div key={p} className="space-y-1.5">
            <p className="text-xs font-semibold text-[var(--ejo-text)]">{PRIORITY_LABEL[p]}</p>
            <label className="block text-[11px] text-[var(--ejo-text-muted)]">First answer (min)<input name={`${p}_first`} type="number" min={5} max={86400} defaultValue={t[p].first} className={input} /></label>
            <label className="block text-[11px] text-[var(--ejo-text-muted)]">Solved within (h)<input name={`${p}_resolve`} type="number" min={1} max={1440} step="0.5" defaultValue={Math.round((t[p].resolve / 60) * 10) / 10} className={input} /></label>
          </div>
        ))}
      </div>
    </fieldset>
  );
}

function QueueFields({ q, branches }: { q?: { id: string; name: string; kind: string; description: string | null; branchId: string | null; aiMode: string; autoAcknowledge: boolean; isDefault: boolean; active: boolean; signature: string | null; targets: Targets }; branches: { id: string; name: string }[] }) {
  return (
    <>
      {q ? <input type="hidden" name="id" value={q.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className={label} htmlFor={`qn-${q?.id ?? 'new'}`}>Team name</label><input id={`qn-${q?.id ?? 'new'}`} name="name" required maxLength={60} defaultValue={q?.name ?? ''} placeholder="Warranty" className={input} /></div>
        <div><label className={label} htmlFor={`qk-${q?.id ?? 'new'}`}>What it handles</label>
          <select id={`qk-${q?.id ?? 'new'}`} name="kind" defaultValue={q?.kind ?? 'general'} className={input}>{QUEUE_KINDS.map((k) => <option key={k} value={k}>{QUEUE_KIND_LABEL[k]}</option>)}</select></div>
        <div><label className={label} htmlFor={`qb-${q?.id ?? 'new'}`}>Branch</label>
          <select id={`qb-${q?.id ?? 'new'}`} name="branchId" defaultValue={q?.branchId ?? ''} className={input}><option value="">The whole organisation</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
        <div><label className={label} htmlFor={`qa-${q?.id ?? 'new'}`}>How Enyo helps</label>
          <select id={`qa-${q?.id ?? 'new'}`} name="aiMode" defaultValue={q?.aiMode ?? 'SUGGEST'} className={input}>{AI_MODES.map((m) => <option key={m} value={m}>{AI_MODE_LABEL[m].label}</option>)}</select></div>
      </div>
      <ul className="space-y-1 text-xs text-[var(--ejo-text-muted)]">{AI_MODES.map((m) => <li key={m}><span className="font-medium text-[var(--ejo-text)]">{AI_MODE_LABEL[m].label}:</span> {AI_MODE_LABEL[m].help}</li>)}</ul>
      <div><label className={label} htmlFor={`qd-${q?.id ?? 'new'}`}>Description (optional)</label><input id={`qd-${q?.id ?? 'new'}`} name="description" maxLength={300} defaultValue={q?.description ?? ''} className={input} /></div>
      <div><label className={label} htmlFor={`qs-${q?.id ?? 'new'}`}>Signature under replies (optional)</label><textarea id={`qs-${q?.id ?? 'new'}`} name="signature" rows={2} maxLength={300} defaultValue={q?.signature ?? ''} placeholder={'Warranty team\nKCG Motors'} className={input} /></div>
      <TargetsFields t={q?.targets ?? DEFAULT_TARGETS} />
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-[var(--ejo-text)]">
        <label className="inline-flex min-h-10 items-center gap-2"><input type="checkbox" name="autoAcknowledge" defaultChecked={q?.autoAcknowledge ?? true} className="h-4 w-4 accent-[var(--ejo-primary)]" />Send an acknowledgement with the reference and when to expect an answer</label>
        <label className="inline-flex min-h-10 items-center gap-2"><input type="checkbox" name="isDefault" defaultChecked={q?.isDefault ?? false} className="h-4 w-4 accent-[var(--ejo-primary)]" />Default team (chat hand-overs and anything not sorted)</label>
        {q ? (
          <label className="inline-flex min-h-10 items-center gap-2"><select name="active" defaultValue={q.active ? 'on' : 'off'} className="min-h-10 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 text-sm"><option value="on">Active</option><option value="off">Switched off</option></select></label>
        ) : null}
      </div>
    </>
  );
}

/**
 * Support centre set-up (administrators): teams with their own email
 * addresses, who works each and how much, opening hours and holidays,
 * targets, Enyo's part, reminders, closing and the satisfaction question.
 */
export default async function SupportSetupPage({ searchParams }: { searchParams: Promise<{ status?: string; error?: string }> }) {
  await guardPage('support.manage', '/settings/support');
  const sp = await searchParams;
  const s = await getSupportSetup();
  const insecure = mailAllowInsecure();
  return (
    <div className="w-full max-w-6xl p-4 sm:p-8">
      <PageHeader hero icon="inbox" eyebrow="Settings · Customer support" title="Support centre set-up" back={{ href: '/settings#support', label: 'Settings' }}
        description="Give each kind of request its own team and address — support@, warranty@, technical@, customercare@ — with its own targets and Enyo’s part. Mail to each address becomes numbered requests within minutes; replies go out from the same address." />
      {sp.error ? <FormFeedbackBanner kind="error" message={sp.error} /> : null}
      {sp.status && STATUS[sp.status] ? <FormFeedbackBanner kind="success" message={STATUS[sp.status]!} /> : null}

      <SectionCard icon="info" title="How it works" className="mb-6">
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-[var(--ejo-text)]">
          <li>Create the addresses with your email provider (Google Workspace, Zoho, cPanel …) and an app password for each. Microsoft 365 sign-in is coming; until then use an app password where your tenant allows it.</li>
          <li>Add a team below and connect its address. Every few minutes new mail becomes a request with a SUP number; the customer gets an acknowledgement saying when to expect an answer.</li>
          <li>Enyo reads each request: topic, urgency, mood and a summary. In “Enyo answers general questions” teams it replies by itself only when it is sure and the question is general — never about someone’s own records, money, complaints, safety or the law — labelled as the AI, with “Solved” and “Talk to a person” buttons.</li>
          <li>Colleagues on a team share new requests (the least busy first, not those marked away). Late and urgent ones go to the top and ring the bell.</li>
          <li>Answers colleagues give become suggestions for Enyo to learn from; an administrator approves each on the Enyo learning page.</li>
        </ol>
        {!s.mailReady ? <p className="mt-3 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-warning)]/10 p-3 text-sm text-[var(--ejo-warning-text)]">Email is not set up for this installation yet (MAILBOX_ENCRYPTION_KEY), so addresses cannot be connected. Chat hand-overs and requests colleagues log work already.</p> : null}
      </SectionCard>

      <div className="space-y-6">
        {s.queues.map((q) => (
          <section key={q.id} id={`queue-${q.id}`} className="scroll-mt-24 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4 sm:p-6">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-[var(--ejo-text)]">{q.name}</h2>
              <StatusChip tone={q.active ? 'success' : 'neutral'} label={q.active ? 'Active' : 'Switched off'} />
              {q.isDefault ? <StatusChip tone="info" label="Default" /> : null}
              <span className="text-xs text-[var(--ejo-text-muted)]">{QUEUE_KIND_LABEL[q.kind]} · {AI_MODE_LABEL[q.aiMode].label} · {q.members.length} colleague{q.members.length === 1 ? '' : 's'} · {q.mailboxes.length} address{q.mailboxes.length === 1 ? '' : 'es'}</span>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <h3 className="mb-2 text-sm font-semibold text-[var(--ejo-text)]">Addresses</h3>
                {q.mailboxes.length ? (
                  <ul className="mb-3 space-y-2">
                    {q.mailboxes.map((m) => (
                      <li key={m.id} className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] p-3">
                        <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-[var(--ejo-text)]"><Icon name="mail" size={15} />{m.address}
                          <StatusChip tone={m.status === 'ACTIVE' ? 'success' : m.status === 'PAUSED' ? 'neutral' : 'warning'} label={m.status === 'ACTIVE' ? 'Reading' : m.status === 'PAUSED' ? 'Paused' : 'Problem'} /></p>
                        <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">{m.lastSyncAt ? `Last read ${formatRelative(m.lastSyncAt, new Date())}` : 'Not read yet'} · {m.imapHost}</p>
                        {m.lastError ? <p className="mt-1 text-xs text-[var(--ejo-error)]">{m.lastError}</p> : null}
                        <div className="mt-2 flex flex-wrap gap-2">
                          {(m.status === 'PAUSED' ? ['resume', 'remove'] : ['pause', 'remove']).map((d) => (
                            <form key={d} action={changeSupportMailboxAction}>
                              <input type="hidden" name="mailboxId" value={m.id} /><input type="hidden" name="do" value={d} />
                              <SubmitButton label={d === 'pause' ? 'Pause' : d === 'resume' ? 'Resume' : 'Remove'} pendingLabel="Saving…" className={`${btn2} ${d === 'remove' ? 'text-[var(--ejo-error)]' : ''}`} />
                            </form>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : <p className="mb-3 text-sm text-[var(--ejo-text-muted)]">No address yet. Requests reach this team when colleagues move them here or log them.</p>}
                {s.mailReady ? (
                  <details className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] p-3">
                    <summary className="flex min-h-10 cursor-pointer items-center gap-2 text-sm font-medium text-[var(--ejo-primary)]"><Icon name="plus" size={15} />Connect an address to {q.name}</summary>
                    <div className="mt-3"><ConnectForm action={connectSupportMailboxAction} defaults={{ displayName: q.name }} allowInsecure={insecure} reconnect={false} hidden={{ queueId: q.id }} addressLabel="Support address (e.g. warranty@yourcompany.com)" bare /></div>
                  </details>
                ) : null}

                <h3 className="mb-2 mt-5 text-sm font-semibold text-[var(--ejo-text)]">Who works this team</h3>
                <form action={setSupportQueueMembersAction} className="space-y-2">
                  <input type="hidden" name="queueId" value={q.id} />
                  <div className="max-h-72 space-y-1 overflow-y-auto rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] p-2">
                    {s.people.map((p) => {
                      const m = q.members.find((x) => x.userId === p.id);
                      return (
                        <div key={p.id} className="flex items-center justify-between gap-3 rounded px-1 py-0.5">
                          <label className="inline-flex min-h-9 min-w-0 items-center gap-2 text-sm text-[var(--ejo-text)]"><input type="checkbox" name="member" value={p.id} defaultChecked={Boolean(m)} className="h-4 w-4 accent-[var(--ejo-primary)]" /><span className="truncate">{p.name}</span>{m?.away ? <span className="text-[11px] text-[var(--ejo-text-muted)]">(away)</span> : null}</label>
                          <label className="inline-flex shrink-0 items-center gap-1 text-[11px] text-[var(--ejo-text-muted)]">at most<input name={`capacity_${p.id}`} type="number" min={1} max={100} defaultValue={m?.capacity ?? 15} className="h-8 w-16 rounded border border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-1.5 text-sm" />open</label>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-[var(--ejo-text-muted)]">They also need the “Work the Support centre” permission (receptionists, workshop managers and branch administrators have it).</p>
                  <SubmitButton label="Save who works this team" pendingLabel="Saving…" className={btn2} />
                </form>
              </div>

              <details className="group rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] p-3 lg:self-start" open={!q.mailboxes.length && !q.members.length}>
                <summary className="flex min-h-10 cursor-pointer items-center gap-2 text-sm font-medium text-[var(--ejo-text)]"><Icon name="settings" size={15} />Team details, targets and Enyo</summary>
                <form action={saveSupportQueueAction} className="mt-3 space-y-3"><QueueFields q={q} branches={s.branches} /><SubmitButton label="Save the team" pendingLabel="Saving…" className={btn} /></form>
              </details>
            </div>
          </section>
        ))}

        <section id="new-queue" className="scroll-mt-24 rounded-[var(--ejo-radius-lg)] border border-dashed border-[var(--ejo-border)] p-4 sm:p-6">
          <details open={!s.queues.length}>
            <summary className="flex min-h-10 cursor-pointer items-center gap-2 text-base font-semibold text-[var(--ejo-primary)]"><Icon name="plus" size={17} />Add a team</summary>
            <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">For example: General support (support@), Warranty &amp; recalls (warranty@), Technical (technical@), Customer care &amp; complaints (customercare@), Parts (parts@).</p>
            <form action={saveSupportQueueAction} className="mt-4 space-y-3"><QueueFields branches={s.branches} /><SubmitButton label="Add the team" pendingLabel="Adding…" className={btn} /></form>
          </details>
        </section>

        <SectionCard icon="clock" title="Opening hours and rules" id="hours" description="Targets count opening hours only (urgent requests count every hour). Lagos time.">
          <form action={saveSupportSettingsAction} className="space-y-5">
            <div className="space-y-1.5">
              {DAYS.map(([d, name]) => {
                const h = s.settings.hours[d as keyof typeof s.settings.hours];
                return (
                  <div key={d} className="flex flex-wrap items-center gap-3 text-sm">
                    <label className="inline-flex w-36 min-h-10 items-center gap-2 text-[var(--ejo-text)]"><input type="checkbox" name={`open_${d}`} defaultChecked={Boolean(h)} className="h-4 w-4 accent-[var(--ejo-primary)]" />{name}</label>
                    <input type="time" name={`from_${d}`} defaultValue={h?.[0] ?? '08:00'} aria-label={`${name} opens`} className="h-10 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2" />
                    <span className="text-[var(--ejo-text-muted)]">to</span>
                    <input type="time" name={`to_${d}`} defaultValue={h?.[1] ?? '17:00'} aria-label={`${name} closes`} className="h-10 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2" />
                  </div>
                );
              })}
            </div>
            <div><label className={label} htmlFor="support-holidays">Public holidays and closed days (YYYY-MM-DD, separated by commas)</label><textarea id="support-holidays" name="holidays" rows={2} defaultValue={s.settings.holidays.join(', ')} placeholder="2026-10-01, 2026-12-25, 2026-12-26" className={input} /></div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div><label className={label} htmlFor="support-threshold">Enyo must be at least this sure to answer by itself (%)</label><input id="support-threshold" name="aiThreshold" type="number" min={50} max={99} defaultValue={Math.round(s.settings.aiThreshold * 100)} className={input} /></div>
              <div><label className={label} htmlFor="support-nudge">Remind a customer who has not replied after (hours)</label><input id="support-nudge" name="nudgeAfterHours" type="number" min={12} max={240} defaultValue={s.settings.nudgeAfterHours} className={input} /></div>
              <div><label className={label} htmlFor="support-resolve">Mark resolved when still no reply after (days)</label><input id="support-resolve" name="autoResolveDays" type="number" min={2} max={30} defaultValue={s.settings.autoResolveDays} className={input} /></div>
              <div><label className={label} htmlFor="support-close">Close resolved requests after (days)</label><input id="support-close" name="closeAfterDays" type="number" min={1} max={28} defaultValue={s.settings.closeAfterDays} className={input} /></div>
            </div>
            <label className="inline-flex min-h-10 items-center gap-2 text-sm text-[var(--ejo-text)]"><input type="checkbox" name="csatEnabled" defaultChecked={s.settings.csatEnabled} className="h-4 w-4 accent-[var(--ejo-primary)]" />Ask “How did we do?” (1–5) a few hours after a request is resolved</label>
            <SubmitButton label="Save hours and rules" pendingLabel="Saving…" className={btn} />
          </form>
        </SectionCard>
      </div>
    </div>
  );
}
