import { guardPage } from '@/lib/authz/server';
import { getSupportSetup } from '@/lib/actions/support-admin';
import { saveSupportSettingsAction } from '@/lib/actions/support-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { SubmitButton } from '@/components/SubmitButton';
import { EditableSection, Icon, SectionCard, StatusChip } from '@/components/ui';
import { AI_MODES, AI_MODE_LABEL } from '@/lib/support/core';
import { SaveRow, SupportSetupFrame, btn, input, label } from '../shared';

export const metadata = { title: 'Enyo in the Support centre' };
export const dynamic = 'force-dynamic';

/** Enyo's part in support: how sure it must be, what each team lets it do, and what it never does. */
export default async function SupportEnyoPage({ searchParams }: { searchParams: Promise<{ status?: string; error?: string; edit?: string }> }) {
  await guardPage('support.manage', '/settings/support');
  const sp = await searchParams;
  const s = await getSupportSetup();
  return (
    <SupportSetupFrame active="/settings/support/enyo" icon="sparkles" title="Enyo’s part" sp={sp}
      description="What the AI assistant may do in each team, how sure it must be, and what always stays with people.">
      <EditableSection id="enyo" icon="sliders" title="How sure Enyo must be to answer by itself" description="Only in teams set to “Enyo answers general questions”. Below this, it drafts for a colleague instead."
        editing={sp.edit === 'enyo'} editHref="/settings/support/enyo?edit=enyo#enyo" cancelHref="/settings/support/enyo#enyo"
        view={<p className="text-sm text-[var(--ejo-text)]"><span className="text-2xl font-semibold text-[var(--ejo-primary)]">{Math.round(s.settings.aiThreshold * 100)}%</span> <span className="text-[var(--ejo-text-muted)]">— Enyo sends an answer by itself only when at least this sure, and only from answers people approved.</span></p>}>
        <form action={saveSupportSettingsAction} className="space-y-4">
          <input type="hidden" name="section" value="enyo" />
          <div className="max-w-xs"><label className={label} htmlFor="support-threshold">At least (%)</label><input id="support-threshold" name="aiThreshold" type="number" min={50} max={99} required defaultValue={Math.round(s.settings.aiThreshold * 100)} className={input} /></div>
          <p className="text-xs text-[var(--ejo-text-muted)]">75–85% suits most organisations. Higher means fewer automatic answers and more drafts for people.</p>
          <SaveRow><SubmitButton label="Save" pendingLabel="Saving…" className={btn} /></SaveRow>
        </form>
      </EditableSection>

      <SectionCard icon="users" title="What each team lets Enyo do" description="Change it on the team’s page." flush>
        <ul className="divide-y divide-[var(--ejo-border)]">
          {s.queues.map((q) => (
            <li key={q.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 sm:px-5">
              <LoadingLink href={`/settings/support/teams/${q.id}#details`} className="font-medium text-[var(--ejo-primary)] hover:underline">{q.name}</LoadingLink>
              <StatusChip tone={q.aiMode === 'AUTO' ? 'brand' : q.aiMode === 'SUGGEST' ? 'info' : 'neutral'} label={AI_MODE_LABEL[q.aiMode].label} />
            </li>
          ))}
          {!s.queues.length ? <li className="p-4 text-sm text-[var(--ejo-text-muted)]">No team yet.</li> : null}
        </ul>
        <ul className="space-y-1 border-t border-[var(--ejo-border)] px-4 py-3 text-xs text-[var(--ejo-text-muted)] sm:px-5">{AI_MODES.map((m) => <li key={m}><span className="font-medium text-[var(--ejo-text)]">{AI_MODE_LABEL[m].label}:</span> {AI_MODE_LABEL[m].help}</li>)}</ul>
      </SectionCard>

      <SectionCard icon="shield" title="Always with people, whatever the setting">
        <ul className="grid gap-2 text-sm text-[var(--ejo-text)] sm:grid-cols-2">
          {['Money: refunds, charges, disputes', 'Complaints and unhappy customers', 'Safety: accidents, brakes, breakdowns', 'Anything about the law', 'A person’s own records, unless they are proven to be that person', 'Turning anyone’s access on or off', 'Approving, paying, promising or cancelling anything', 'When the customer asks for a person'].map((t) => (
            <li key={t} className="flex gap-2"><Icon name="lock" size={14} className="mt-0.5 shrink-0 text-[var(--ejo-warning)]" />{t}</li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-[var(--ejo-text-muted)]">Check Enyo’s answers on <LoadingLink href="/crm/support/enyo" className="font-medium text-[var(--ejo-primary)] hover:underline">Enyo’s replies</LoadingLink> and approve good answers on <LoadingLink href="/enyo/learning" className="font-medium text-[var(--ejo-primary)] hover:underline">Enyo learning</LoadingLink>. The AI connection itself is on <LoadingLink href="/settings/enyo" className="font-medium text-[var(--ejo-primary)] hover:underline">Settings → Enyo</LoadingLink>.</p>
      </SectionCard>
    </SupportSetupFrame>
  );
}
