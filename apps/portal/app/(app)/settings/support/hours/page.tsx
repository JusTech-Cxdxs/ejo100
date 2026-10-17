import { guardPage } from '@/lib/authz/server';
import { getSupportSetup } from '@/lib/actions/support-admin';
import { saveSupportSettingsAction } from '@/lib/actions/support-form-handlers';
import { SubmitButton } from '@/components/SubmitButton';
import { SectionCard, StatusChip } from '@/components/ui';
import { holidayEntries } from '@/lib/support/holidays';
import { SaveRow, SupportSetupFrame, btn, label } from '../shared';

export const metadata = { title: 'Support hours and holidays' };
export const dynamic = 'force-dynamic';

const DAYS: [string, string][] = [['1', 'Monday'], ['2', 'Tuesday'], ['3', 'Wednesday'], ['4', 'Thursday'], ['5', 'Friday'], ['6', 'Saturday'], ['7', 'Sunday']];
const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/**
 * Opening hours (targets count these hours only; urgent requests count every
 * hour) and closed days: Nigeria's public holidays are worked out every year
 * by the system — nobody types them in. The administrator only adds the
 * organisation's own closed days or opens on a holiday.
 */
export default async function SupportHoursPage({ searchParams }: { searchParams: Promise<{ status?: string; error?: string }> }) {
  await guardPage('support.manage', '/settings/support');
  const sp = await searchParams;
  const s = await getSupportSetup();
  const year = Number(new Date(Date.now() + 3_600_000).toISOString().slice(0, 4));
  const today = new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);
  const calendarOn = Boolean(s.settings.holidayCalendar);
  const entries = holidayEntries(s.settings.holidayCalendar, s.settings.customHolidays, s.settings.holidaysOff, [year, year + 1]);
  const upcoming = entries.filter((e) => e.date >= today);
  // Everything stored but not shown as a box below is sent back unchanged, so saving never loses a day.
  const shownCustom = new Set(upcoming.filter((e) => e.source === 'custom').map((e) => e.date));
  const shownCalendar = new Set(upcoming.filter((e) => e.source === 'calendar').map((e) => e.date));
  const keepCustom = s.settings.customHolidays.filter((d) => !shownCustom.has(d));
  const keepOpen = s.settings.holidaysOff.filter((d) => !shownCalendar.has(d));

  return (
    <SupportSetupFrame active="/settings/support/hours" icon="clock" title="Hours & holidays" sp={sp}
      description="Targets count opening hours only (urgent requests count every hour), in Lagos time. Public holidays are worked out automatically each year.">
      <SectionCard icon="clock" title="Opening hours" description="When the support teams answer. Outside these hours, the acknowledgement says when to expect a reply.">
        <form action={saveSupportSettingsAction} className="space-y-4">
          <input type="hidden" name="section" value="hours" />
          <div className="divide-y divide-[var(--ejo-border)] rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)]">
            {DAYS.map(([d, name]) => {
              const h = s.settings.hours[d as keyof typeof s.settings.hours];
              return (
                <div key={d} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                  <label className="inline-flex min-h-10 w-32 items-center gap-2 font-medium text-[var(--ejo-text)]"><input type="checkbox" name={`open_${d}`} defaultChecked={Boolean(h)} className="h-4 w-4 accent-[var(--ejo-primary)]" />{name}</label>
                  <input type="time" name={`from_${d}`} defaultValue={h?.[0] ?? '08:00'} aria-label={`${name} opens`} className="h-10 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2" />
                  <span className="text-[var(--ejo-text-muted)]">to</span>
                  <input type="time" name={`to_${d}`} defaultValue={h?.[1] ?? '17:00'} aria-label={`${name} closes`} className="h-10 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2" />
                </div>
              );
            })}
          </div>
          <SaveRow note="Untick a day to close all day."><SubmitButton label="Save opening hours" pendingLabel="Saving…" className={btn} /></SaveRow>
        </form>
      </SectionCard>

      <SectionCard icon="calendar" title="Public holidays and closed days" description="Nigeria’s public holidays come from the calendar (fixed dates, Easter, the Islamic holidays, and the usual Monday off when a holiday falls on a weekend). Islamic dates are expected dates until the Federal Government declares them.">
        <form action={saveSupportSettingsAction} className="space-y-5">
          <input type="hidden" name="section" value="holidays" />
          <label className="flex items-start gap-2 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] p-3 text-sm text-[var(--ejo-text)]">
            <input type="checkbox" name="calendar" defaultChecked={calendarOn} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--ejo-primary)]" />
            <span><span className="font-medium">Close on Nigerian public holidays automatically</span><span className="block text-xs text-[var(--ejo-text-muted)]">Worked out every year; nothing to type. Tick “Open” on any day the teams work anyway.</span></span>
          </label>

          <div>
            <p className={label}>Coming up ({upcoming.length})</p>
            {upcoming.length ? (
              <ul className="divide-y divide-[var(--ejo-border)] rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)]">
                {upcoming.map((e) => (
                  <li key={e.date} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                    <span className="w-36 shrink-0 font-medium text-[var(--ejo-text)]">{fmt(e.date)}</span>
                    <span className="min-w-0 flex-1 text-[var(--ejo-text)]">{e.name}{e.provisional ? <span className="ml-1.5 text-xs text-[var(--ejo-text-muted)]">(expected; subject to FG declaration)</span> : null}</span>
                    {e.source === 'calendar' ? (
                      <label className="inline-flex min-h-9 items-center gap-1.5 text-xs text-[var(--ejo-text-muted)]"><input type="checkbox" name="openOn" value={e.date} defaultChecked={e.open} className="h-4 w-4 accent-[var(--ejo-primary)]" />Open</label>
                    ) : (
                      <label className="inline-flex min-h-9 items-center gap-1.5 text-xs text-[var(--ejo-text-muted)]"><input type="checkbox" name="extraDay" value={e.date} defaultChecked className="h-4 w-4 accent-[var(--ejo-primary)]" />Closed (untick to remove)</label>
                    )}
                    {e.open ? <StatusChip tone="success" label="Open anyway" /> : null}
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-[var(--ejo-text-muted)]">No closed days ahead.</p>}
          </div>

          {keepCustom.map((d) => <input key={`x-${d}`} type="hidden" name="extraDay" value={d} />)}
          {keepOpen.map((d) => <input key={`o-${d}`} type="hidden" name="openOn" value={d} />)}

          <div className="max-w-xs">
            <label className={label} htmlFor="extra-day">Add a closed day of the organisation’s own (optional)</label>
            <input id="extra-day" type="date" name="extraDay" min={today} className="min-h-11 w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 text-sm text-[var(--ejo-text)]" />
            <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">A staff day, a stock-take, a local holiday. Pick it from the calendar.</p>
          </div>
          <SaveRow note={calendarOn ? undefined : 'With the calendar off, only the organisation’s own closed days count.'}><SubmitButton label="Save holidays" pendingLabel="Saving…" className={btn} /></SaveRow>
        </form>
      </SectionCard>
    </SupportSetupFrame>
  );
}
