import { guardPage } from '@/lib/authz/server';
import { getSupportSetup } from '@/lib/actions/support-admin';
import { saveSupportSettingsAction } from '@/lib/actions/support-form-handlers';
import { SubmitButton } from '@/components/SubmitButton';
import { EditableSection, ViewList } from '@/components/ui';
import { SaveRow, SupportSetupFrame, btn, input, label } from '../shared';

export const metadata = { title: 'Support follow-ups' };
export const dynamic = 'force-dynamic';

/** What happens after an answer: a reminder when the customer goes quiet, resolving, closing, and "How did we do?". */
export default async function SupportFollowUpsPage({ searchParams }: { searchParams: Promise<{ status?: string; error?: string; edit?: string }> }) {
  await guardPage('support.manage', '/settings/support');
  const sp = await searchParams;
  const s = await getSupportSetup();
  return (
    <SupportSetupFrame active="/settings/support/follow-ups" icon="bell" title="Follow-ups" sp={sp}
      description="What the Support centre does by itself after a colleague (or Enyo) has answered and is waiting for the customer.">
      <EditableSection id="followups" icon="bell" title="Waiting for the customer"
        editing={sp.edit === 'followups'} editHref="/settings/support/follow-ups?edit=followups#followups" cancelHref="/settings/support/follow-ups#followups"
        view={<ViewList rows={[
          { label: 'Remind the customer after', value: `${s.settings.nudgeAfterHours} hours without a reply` },
          { label: 'Mark resolved after', value: `${s.settings.autoResolveDays} days without a reply` },
          { label: 'Close resolved requests after', value: `${s.settings.closeAfterDays} ${s.settings.closeAfterDays === 1 ? 'day' : 'days'}` },
          { label: '“How did we do?”', value: s.settings.csatEnabled ? 'Asked a few hours after a request is resolved' : 'Not asked' },
        ]} />}>
        <form action={saveSupportSettingsAction} className="space-y-5">
          <input type="hidden" name="section" value="followups" />
          <div className="grid gap-4 sm:grid-cols-3">
            <div><label className={label} htmlFor="support-nudge">Remind the customer after (hours)</label><input id="support-nudge" name="nudgeAfterHours" type="number" min={12} max={240} required defaultValue={s.settings.nudgeAfterHours} className={input} /></div>
            <div><label className={label} htmlFor="support-resolve">Mark resolved if still no reply after (days)</label><input id="support-resolve" name="autoResolveDays" type="number" min={2} max={30} required defaultValue={s.settings.autoResolveDays} className={input} /></div>
            <div><label className={label} htmlFor="support-close">Close resolved requests after (days)</label><input id="support-close" name="closeAfterDays" type="number" min={1} max={28} required defaultValue={s.settings.closeAfterDays} className={input} /></div>
          </div>
          <label className="flex items-start gap-2 text-sm text-[var(--ejo-text)]"><input type="checkbox" name="csatEnabled" defaultChecked={s.settings.csatEnabled} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--ejo-primary)]" /><span>Ask “How did we do?” (1–5) a few hours after a request is resolved<span className="block text-xs text-[var(--ejo-text-muted)]">The answers show on Support → Analytics.</span></span></label>
          <SaveRow note="A customer who replies at any point opens the request again."><SubmitButton label="Save follow-ups" pendingLabel="Saving…" className={btn} /></SaveRow>
        </form>
      </EditableSection>
    </SupportSetupFrame>
  );
}
