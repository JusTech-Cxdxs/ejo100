import { getItTrends, getWebsiteTraffic } from '@/lib/actions/it-trends';
import { secondsText } from '@/lib/it-trends-core';
import { AskEnyoButton } from '@/components/enyo/AskEnyoButton';
import { SectionCard, StatTile } from '@/components/ui';
import { pluralize } from '@/lib/utils/pluralize';

type Series = { name: string; color: string; values: number[] };

/** Small multi-line chart (server-drawn), with the numbers in a table for screen readers. */
function Lines({ labels, series, caption }: { labels: string[]; series: Series[]; caption: string }) {
  const W = 560, H = 130, pad = 6;
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const x = (i: number) => pad + (i * (W - pad * 2)) / Math.max(1, labels.length - 1);
  const y = (v: number) => H - 4 - (v / max) * (H - 14);
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H + 18}`} className="h-auto w-full" role="img" aria-label={caption}>
        <line x1="0" x2={W} y1={H - 4} y2={H - 4} stroke="var(--ejo-border)" />
        <text x={W - 2} y="10" textAnchor="end" fontSize="10" fill="var(--ejo-text-muted)">{max}</text>
        {series.map((s) => (
          <polyline key={s.name} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')}>
            <title>{s.name}</title>
          </polyline>
        ))}
        {labels.map((l, i) => (i % 2 === labels.length % 2 || labels.length <= 8 ? <text key={l + i} x={x(i)} y={H + 12} textAnchor="middle" fontSize="9.5" fill="var(--ejo-text-muted)">{l}</text> : null))}
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--ejo-text-muted)]">
        {series.map((s) => <span key={s.name} className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />{s.name} · {s.values.reduce((a, b) => a + b, 0)}</span>)}
      </figcaption>
      <table className="sr-only"><caption>{caption}</caption><thead><tr><th>Day</th>{series.map((s) => <th key={s.name}>{s.name}</th>)}</tr></thead><tbody>{labels.map((l, i) => <tr key={l + i}><th>{l}</th>{series.map((s) => <td key={s.name}>{s.values[i]}</td>)}</tr>)}</tbody></table>
    </figure>
  );
}

const arrow = (t: { change: number | null; direction: string }) => (t.change === null ? (t.direction === 'up' ? 'new this week' : 'steady') : `${t.change > 0 ? '+' : ''}${t.change}% on the week before`);

/** IT trends over 14 days: errors, sign-ins, Enyo conversations, emails and job runs. */
export async function ItTrendsSection() {
  const t = await getItTrends(14);
  const labels = t.days.map((d) => d.label);
  return (
    <SectionCard icon="chart" title="Trends, last 14 days" description={`Errors ${arrow(t.trend.errors)} · sign-ins ${arrow(t.trend.signIns)} · Enyo conversations ${arrow(t.trend.chats)}`}>
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--ejo-text-muted)]">Errors and sign-ins</h3>
          <Lines caption="Errors, sign-ins and failed sign-ins per day" labels={labels} series={[
            { name: 'Sign-ins', color: 'var(--ejo-primary)', values: t.days.map((d) => d.signIns) },
            { name: 'Failed sign-ins', color: 'var(--ejo-warning)', values: t.days.map((d) => d.failedSignIns) },
            { name: 'Errors', color: 'var(--ejo-error)', values: t.days.map((d) => d.errors) },
          ]} />
        </div>
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--ejo-text-muted)]">Enyo, email and scheduled jobs</h3>
          <Lines caption="Enyo conversations, emails and job runs per day" labels={labels} series={[
            { name: 'Enyo — staff', color: 'var(--ejo-primary)', values: t.days.map((d) => d.chatsStaff) },
            { name: 'Enyo — website and customers', color: 'var(--ejo-info)', values: t.days.map((d) => d.chatsWebsite) },
            ...(t.emailsShown ? [
              { name: 'Emails sent', color: 'var(--ejo-success)', values: t.days.map((d) => d.emailsSent ?? 0) },
              { name: 'Emails failed', color: 'var(--ejo-error)', values: t.days.map((d) => d.emailsFailed ?? 0) },
              { name: 'Job runs', color: 'var(--ejo-text-muted)', values: t.days.map((d) => d.jobRuns) },
            ] : []),
          ]} />
        </div>
      </div>
    </SectionCard>
  );
}

/** The public website: visitors per day, who chatted with Enyo, time on page, top pages, devices, referrers. */
export async function WebsiteSection() {
  const w = await getWebsiteTraffic(14);
  if (!w) {
    return (
      <SectionCard icon="globe" title="Website visitors" description="Needs database v40 — deploy the API (Render) first, then visits are counted from the next page view.">
        <p className="text-sm text-[var(--ejo-text-muted)]">No visitor data yet.</p>
      </SectionCard>
    );
  }
  const tt = w.totals;
  return (
    <SectionCard
      icon="globe"
      title="Website visitors, last 14 days"
      description="Anonymous: a random browser cookie, never a name or address; ids in page addresses are hidden. Visitors who ask not to be tracked are not counted."
      actions={<AskEnyoButton send label="Explain the website figures" question="Explain our website visitors for the last 14 days: visitors per day and the trend, how many chatted with Enyo versus only browsed, time on page, the top pages and where visitors come from. End with two suggestions." />}
    >
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile icon="users" label="Visitors" value={tt.visitors} hint={`${tt.viewsPerVisitor} pages each`} />
        <StatTile icon="eye" label="Page views" value={tt.views} />
        <StatTile icon="sparkles" label="Chatted with Enyo" value={tt.chatted} hint={`${tt.chattedPct}% of visitors`} />
        <StatTile icon="user" label="Browsed only" value={tt.browsedOnly} />
        <StatTile icon="clock" label="Time on a page" value={secondsText(tt.avgSeconds)} hint="Average, in view" />
        <StatTile icon="exit" label="Left after one page" value={`${tt.singlePagePct}%`} tone={tt.singlePagePct > 70 ? 'warning' : 'brand'} />
      </div>
      <Lines caption="Website visitors, page views and visitors who chatted with Enyo per day" labels={w.days.map((d) => d.label)} series={[
        { name: 'Visitors', color: 'var(--ejo-primary)', values: w.days.map((d) => d.visitors) },
        { name: 'Page views', color: 'var(--ejo-info)', values: w.days.map((d) => d.views) },
        { name: 'Chatted with Enyo', color: 'var(--ejo-success)', values: w.days.map((d) => d.chatted) },
      ]} />
      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-sm">
            <caption className="mb-1 text-left text-xs font-semibold uppercase tracking-wide text-[var(--ejo-text-muted)]">Top pages</caption>
            <thead><tr className="text-[11px] uppercase tracking-wide text-[var(--ejo-text-muted)]"><th className="py-1.5 font-semibold">Page</th><th className="px-2 py-1.5 text-right font-semibold">Views</th><th className="px-2 py-1.5 text-right font-semibold">Visitors</th><th className="py-1.5 text-right font-semibold">Time on page</th></tr></thead>
            <tbody>
              {w.topPages.length ? w.topPages.map((p) => <tr key={p.path} className="border-t border-[var(--ejo-border)]"><td className="max-w-[16rem] truncate py-1.5 font-mono text-xs">{p.path}</td><td className="px-2 py-1.5 text-right tabular-nums">{p.views}</td><td className="px-2 py-1.5 text-right tabular-nums">{p.visitors}</td><td className="py-1.5 text-right tabular-nums">{secondsText(p.avgSeconds)}</td></tr>)
                : <tr><td colSpan={4} className="py-2 text-[var(--ejo-text-muted)]">No visits counted yet.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="space-y-4 text-sm">
          <div>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--ejo-text-muted)]">Devices</h3>
            {w.devices.length ? <ul className="space-y-1">{w.devices.map((d) => <li key={d.device} className="flex justify-between capitalize"><span>{d.device}</span><span className="tabular-nums">{pluralize(d.visitors, 'visitor')}</span></li>)}</ul> : <p className="text-[var(--ejo-text-muted)]">—</p>}
          </div>
          <div>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--ejo-text-muted)]">Came from</h3>
            {w.referrers.length ? <ul className="space-y-1">{w.referrers.map((r) => <li key={r.host} className="flex justify-between"><span className="truncate">{r.host}</span><span className="tabular-nums">{r.views}</span></li>)}</ul> : <p className="text-[var(--ejo-text-muted)]">Direct visits and searches only.</p>}
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
