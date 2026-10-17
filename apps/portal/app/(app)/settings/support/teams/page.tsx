import { guardPage } from '@/lib/authz/server';
import { getSupportSetup } from '@/lib/actions/support-admin';
import { saveSupportQueueAction } from '@/lib/actions/support-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { SubmitButton } from '@/components/SubmitButton';
import { EditableSection, Icon, SectionCard, StatusChip } from '@/components/ui';
import { AI_MODE_LABEL, QUEUE_KIND_LABEL } from '@/lib/support/core';
import { QueueFields, SaveRow, SupportSetupFrame, btn } from '../shared';

export const metadata = { title: 'Support teams' };
export const dynamic = 'force-dynamic';

/** The support teams (queues): one row each, opening its own page; and adding a team. */
export default async function SupportTeamsPage({ searchParams }: { searchParams: Promise<{ status?: string; error?: string; edit?: string }> }) {
  await guardPage('support.manage', '/settings/support');
  const sp = await searchParams;
  const s = await getSupportSetup();
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  return (
    <SupportSetupFrame active="/settings/support/teams" icon="users" title="Teams & addresses" sp={sp}
      description="Give each kind of request its own team and address — support@, warranty@, technical@, customercare@. Mail to each address becomes numbered requests within minutes; replies go out from the same address.">
      <SectionCard icon="users" title={plural(s.queues.length, 'team', 'teams')} flush>
        {s.queues.length ? (
          <ul className="divide-y divide-[var(--ejo-border)]">
            {s.queues.map((q) => (
              <li key={q.id}>
                <LoadingLink href={`/settings/support/teams/${q.id}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-[var(--ejo-bg)] sm:px-5">
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2"><span className="font-medium text-[var(--ejo-text)]">{q.name}</span><StatusChip tone={q.active ? 'success' : 'neutral'} label={q.active ? 'Active' : 'Switched off'} />{q.isDefault ? <StatusChip tone="info" label="Default" /> : null}</span>
                    <span className="mt-0.5 block text-xs text-[var(--ejo-text-muted)]">{QUEUE_KIND_LABEL[q.kind]} · {AI_MODE_LABEL[q.aiMode].label} · {plural(q.members.length, 'colleague', 'colleagues')} · {q.mailboxes.length ? q.mailboxes.map((m) => m.address).join(', ') : 'no address'}</span>
                  </span>
                  <Icon name="sliders" size={16} className="shrink-0 text-[var(--ejo-text-muted)]" />
                </LoadingLink>
              </li>
            ))}
          </ul>
        ) : <p className="p-4 text-sm text-[var(--ejo-text-muted)]">No team yet.</p>}
      </SectionCard>

      <EditableSection id="new-queue" icon="plus" title="Add a team" description="For example: General support (support@), Customer care & complaints (customercare@), Warranty & recalls (warranty@), Technical (technical@), Parts (parts@), HR & people, Staff help."
        editing={sp.edit === 'new'} editHref="/settings/support/teams?edit=new#new-queue" cancelHref="/settings/support/teams" editLabel="Add a team"
        view={<p className="text-sm text-[var(--ejo-text-muted)]">Each team gets its own page to connect its address, choose who works it and who leads it, and change its targets and automatic reply.</p>}>
        <form action={saveSupportQueueAction} className="space-y-4">
          <QueueFields branches={s.branches} />
          <SaveRow note="You can connect its address and choose who works it on the team's page next."><SubmitButton label="Add the team" pendingLabel="Adding…" className={btn} /></SaveRow>
        </form>
      </EditableSection>
    </SupportSetupFrame>
  );
}
