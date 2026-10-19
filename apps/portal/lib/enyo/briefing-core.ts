/**
 * The briefing, pure and tested: which questions are a "brief me", how the
 * gathered figures are shown to the model, and how they are written up by
 * hand when the model cannot help. No database, no network.
 */
export type Section = {
  key: 'day' | 'pending' | 'business' | 'stock' | 'support' | 'website' | 'integrity' | 'leads';
  title: string;
  data: unknown;
  /** A one-line reason when the section could not be read (never a refusal). */
  note?: string;
};

export type BriefingPack = {
  sections: Section[];
  toolRuns: { name: string; ok: boolean; refused?: boolean }[];
  sources: { label: string; href?: string }[];
  branch: string | null;
  generatedAt: string;
};

const ASK = /^\s*brief(ing)?\b|\b(brief|briefing) (me|us|on)\b|\ba (daily |morning |quick |full )?briefing\b|\bcatch me up\b|\bupdate me\b|\bbring me up to (date|speed)\b|\bwhat('s| is| has been) (happening|going on)(\s+(today|here|now|everywhere|(in|at|across) (the|our|my) (business|branch|workshop|company|group|plant|showroom)))?\s*[?!.]*\s*$|\beverything (that is |that's )?(happening|going on)\b|\bhow (are|is) (we|the business|business|things|everything) (doing|going)\b|\bare we (on|in|making) (a )?profit\b|\b(business|general) analytics\b|\boverview of (the business|everything|the day|today)\b|\bstate of (the business|things|play)\b|\bdaily (brief|summary|update)\b|\bmorning (brief|summary|update)\b/i;
/** A question about one record, one thing or one request is not a briefing, even if it says "update" or "brief". */
const SPECIFIC = /\b(JC|SV|EPR|PRS|GRN|RF|WR|WC|VIS|EP|VX|RT|INC|DLV|CTR|APT|BC|SUP)-\d|\bjob ?card\b|\bbay \d|\bmy [a-z ]{0,20}request\b|\bhow do i\b|\bhow to\b|\bremind me\b|\bdraft\b|\bwrite (a|an|the)\b|\bemail\b|\bmail\b|\bkeep it brief\b|\bin brief\b|\bbrief (description|explanation|summary of)\b|\bbriefed\b|\bwhat('s| is) (happening|going on) with\b/i;

/** "Brief me", "what is happening", "are we on profit", "business analytics" — the whole picture, not one record. */
export function isBriefingRequest(message: string): boolean {
  const m = message.trim();
  if (m.length < 4 || m.length > 1500) return false;
  if (SPECIFIC.test(m)) return false;
  return ASK.test(m);
}

const DROP = new Set(['definitions', 'readAloudTip', 'tip', 'note', 'hint']);

/** Compact JSON for the model: no coaching keys, numbers kept, long lists cut. */
function compact(v: unknown, depth = 0): unknown {
  if (Array.isArray(v)) return v.slice(0, depth === 0 ? 12 : 6).map((x) => compact(x, depth + 1));
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (DROP.has(k) || x === null || x === undefined || x === '' || (Array.isArray(x) && !x.length)) continue;
      out[k] = compact(x, depth + 1);
    }
    return out;
  }
  if (typeof v === 'string') return v.length > 160 ? `${v.slice(0, 157)}…` : v;
  return v;
}

const BUDGET: Record<Section['key'], number> = { day: 1800, pending: 1200, business: 3200, stock: 700, support: 900, website: 600, integrity: 600, leads: 500 };

/** The pack as text for the model, within a small budget per section (a free tier allows little per minute). */
export function packToText(pack: BriefingPack): string {
  const parts: string[] = [];
  for (const s of pack.sections) {
    if (s.data === null) { parts.push(`## ${s.title}\n(${s.note ?? 'not available'})`); continue; }
    let json = JSON.stringify(compact(s.data));
    const max = BUDGET[s.key];
    if (json.length > max) json = `${json.slice(0, max - 1)}…`;
    parts.push(`## ${s.title}\n${json}`);
  }
  return parts.join('\n\n');
}

// ── Writing it up by hand ────────────────────────────────────────────────────

const naira = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? `₦${Math.round(n).toLocaleString('en-NG')}` : null);
const pct = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? `${n > 0 ? '+' : ''}${Math.round(n)}%` : null);
const num = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString('en-NG') : null);
const str = (v: unknown, max = 140) => (typeof v === 'string' ? (v.length > max ? `${v.slice(0, max - 1)}…` : v) : null);
const link = (label: string, href: unknown) => (typeof href === 'string' && href.startsWith('/') ? `[${label}](${href})` : label);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function day(data: unknown): string[] {
  const d = obj(data);
  const lines: string[] = [];
  const sections = arr(d.sections);
  if (d.nothingWaiting || !sections.length) lines.push('Nothing is waiting on you right now.');
  for (const s of sections) {
    const x = obj(s);
    const head = `**${str(x.what) ?? 'Waiting'}** — ${num(x.count) ?? '?'}${x.overdue ? ` (${num(x.overdue)} overdue)` : ''}${typeof x.all === 'string' ? ` · ${link('see all', x.all)}` : ''}`;
    lines.push(head);
    for (const it of arr(x.items).slice(0, 4)) {
      const i = obj(it);
      lines.push(`  - ${link(str(i.title) ?? 'Item', i.href)}${i.detail ? ` — ${str(i.detail, 90)}` : ''}${i.when ? ` (${str(i.when, 40)})` : ''}${i.overdue ? ' · overdue' : ''}`);
    }
  }
  const numbers = arr(d.myNumbersThisMonth);
  if (numbers.length) lines.push(`Your numbers this month: ${numbers.map((n) => { const x = obj(n); return `${str(x.label, 40)} ${num(x.value) ?? str(x.value, 20) ?? ''}${x.unit ? ` ${x.unit}` : ''}`; }).join(' · ')}`);
  return lines;
}

function pending(data: unknown): string[] {
  const d = obj(data);
  const items = arr(d.waiting);
  if (!items.length) return ['Nothing you sent is waiting on anyone.'];
  return [...items.slice(0, 8).map((it) => { const i = obj(it); return `- ${link(str(i.number) ?? 'Request', i.link)} — ${str(i.what, 80)}, with ${str(i.withWhom, 60) ?? 'someone'}${i.since ? ` since ${str(i.since, 40)}` : ''}`; }), ...(typeof d.total === 'number' && d.total > 8 ? [`…and ${d.total - 8} more.`] : [])];
}

function business(data: unknown): string[] {
  const d = obj(data);
  const lines: string[] = [];
  if (d.period || d.scope) lines.push(`${str(d.period) ?? ''}${d.scope ? ` · ${str(d.scope, 120)}` : ''}`.trim());
  const m = obj(d.money);
  if (Object.keys(m).length) {
    const profit = naira(m.grossProfit);
    const margin = typeof m.grossMarginPercent === 'number' ? `${Math.round(m.grossMarginPercent)}%` : null;
    lines.push(`**Money:** sales ${naira(m.sales) ?? '—'}${pct(m.salesChangePercent) ? ` (${pct(m.salesChangePercent)} on last month)` : ''}; takings ${naira(m.takings) ?? '—'}; gross profit ${profit ?? '—'}${margin ? ` (${margin} margin)` : ''}${typeof m.grossProfit === 'number' ? (m.grossProfit > 0 ? ' — in profit on the work done' : m.grossProfit < 0 ? ' — below cost this month' : '') : ''}.`);
    if (m.jobsFinished !== undefined) lines.push(`Jobs finished ${num(m.jobsFinished) ?? '—'}, average job ${naira(m.averageJob) ?? '—'}; owed on finished jobs ${naira(m.owedOnFinishedJobs) ?? '—'}${m.monthProjection ? `; on course for ${naira(m.monthProjection)} this month` : ''}.`);
    const made = obj(m.madeOf);
    if (Object.keys(made).length) lines.push(`Made of: labour ${naira(made.labour) ?? '—'}, parts ${naira(made.parts) ?? '—'}, outside work ${naira(made.outsideWork) ?? '—'}, sundry ${naira(made.sundry) ?? '—'}.`);
    const top = arr(m.biggestCustomers);
    if (top.length) lines.push(`Biggest customers: ${top.map((c) => { const x = obj(c); return `${str(x.name, 40)} (${naira(x.value) ?? '—'})`; }).join(', ')}.`);
  }
  const branches = arr(d.branches);
  if (branches.length) {
    lines.push('**Branches:**');
    for (const b of branches.slice(0, 8)) {
      const x = obj(b);
      lines.push(`- ${str(x.name, 50)} — ${str(x.health, 30) ?? ''}: opened ${num(x.jobsOpened) ?? '—'}, finished ${num(x.jobsFinished) ?? '—'}, collected ${naira(x.collectedNaira) ?? '—'}, in workshop ${num(x.inWorkshopNow) ?? '—'}${arr(x.why).length ? ` (${arr(x.why).slice(0, 2).map((w) => str(w, 60)).join('; ')})` : ''}`);
    }
  }
  const w = obj(d.workshopNow);
  if (Object.keys(w).length) lines.push(`**Workshop now:** ${num(w.jobCardsIn) ?? 0} job cards and ${num(w.vehicleServicesIn) ?? 0} services in; ${num(w.readyToCollect) ?? 0} ready to collect; ${num(w.waitingForParts) ?? 0} waiting for parts; ${num(w.waitingForCustomer) ?? 0} waiting for the customer.`);
  const dec = arr(d.decisionsWaiting);
  if (dec.length) lines.push(`**Decisions waiting:** ${dec.slice(0, 6).map((x) => { const y = obj(x); return `${str(y.what, 50)} ${num(y.count) ?? ''}${typeof y.oldestHours === 'number' ? ` (oldest ${Math.round(y.oldestHours)} h)` : ''}`; }).join('; ')}.`);
  const t = obj(d.team);
  if (Object.keys(t).length) {
    const bits = [`${num(t.peopleWhoHandledWork) ?? '—'} people handled work`];
    if (typeof t.withinStandardPercent === 'number' && t.peopleWhoHandledWork) bits.push(`${Math.round(t.withinStandardPercent)}% within standard`);
    if (arr(t.needsAttention).length) bits.push(`needs attention: ${arr(t.needsAttention).map((p) => str(obj(p).name, 40)).join(', ')}`);
    lines.push(`**Team:** ${bits.join('; ')}.`);
  }
  const c = obj(d.customers);
  if (Object.keys(c).length) lines.push(`**Customers:** ${num(c.newThisMonth) ?? 0} new this month; ${num(c.supportOpen) ?? 0} support requests open${typeof c.supportLate === 'number' && c.supportLate > 0 ? `, ${c.supportLate} late` : ''}.`);
  const todo = arr(m.whatToDo);
  if (todo.length) lines.push(`**Do first:** ${todo.map((x) => str(x, 90)).join('; ')}.`);
  const notices = arr(d.notices);
  if (notices.length) lines.push(`Notices: ${notices.map((x) => str(x, 80)).join('; ')}.`);
  return lines;
}

function website(data: unknown): string[] {
  const d = obj(data);
  const w = obj(d.website);
  if (!Object.keys(w).length) return [str(d.website, 160) ?? 'Not counted yet.'];
  const tot = obj(w.totals);
  const lines: string[] = [`Visitors ${num(tot.visitors) ?? '—'}, page views ${num(tot.views ?? tot.pageViews) ?? '—'}${typeof tot.chatted === 'number' ? `, ${num(tot.chatted)} chatted with Enyo` : ''}${tot.averageTimeOnPage ? `, average time on page ${str(tot.averageTimeOnPage, 20)}` : ''}${w.since ? ` (since ${str(w.since, 24)})` : ''}.`];
  const top = arr(w.topPages).slice(0, 4);
  if (top.length) lines.push(`Most read: ${top.map((p) => { const x = obj(p); return `${str(x.page, 40)} (${num(x.views) ?? 0})`; }).join(', ')}.`);
  const it = obj(d.itTrends);
  const days = arr(it.perDay);
  if (days.length) {
    const sum = (k: string) => days.reduce<number>((n, x) => n + (typeof obj(x)[k] === 'number' ? (obj(x)[k] as number) : 0), 0);
    lines.push(`IT, same days: ${num(sum('signIns'))} sign-ins, ${num(sum('failedSignIns'))} failed, ${num(sum('errors'))} errors, ${num(sum('enyoChats'))} Enyo chats.`);
  }
  return lines;
}

function stock(data: unknown): string[] {
  const d = obj(data);
  const lines: string[] = [];
  const out = num(d.outOfStock) ?? '0';
  const low = num(d.atOrBelowReorderPoint) ?? '0';
  lines.push(`${out} out of stock, ${low} at or below the reorder point.`);
  for (const p of arr(d.parts).slice(0, 5)) {
    const x = obj(p);
    lines.push(`- ${link(str(x.name, 60) ?? 'Part', x.href ?? x.link)}${x.partNumber ? ` (${str(x.partNumber, 30)})` : ''} — on hand ${num(x.onHand) ?? '?'}, reorder at ${num(x.reorderPoint) ?? '?'}`);
  }
  const pa = obj(d.pricingAlerts);
  if (Object.keys(pa).length) lines.push(`Pricing alerts: sold below cost ${num(pa.soldBelowCost) ?? 0}, below target margin ${num(pa.belowTargetMargin) ?? 0}, above target ${num(pa.aboveTarget) ?? 0}${typeof pa.lossIfStockSoldAtTodaysPrice === 'number' ? `, loss if stock sold at today's price ${naira(pa.lossIfStockSoldAtTodaysPrice)}` : ''} · ${link('Pricing', pa.href ?? '/inventory/pricing')}.`);
  return lines;
}

const HIDE = new Set(['href', 'link', 'url', 'all']);

function generic(data: unknown): string[] {
  const d = obj(data);
  const lines: string[] = [];
  for (const [k, v] of Object.entries(d)) {
    if (DROP.has(k) || v === null || v === undefined) continue;
    const label = k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase();
    if (Array.isArray(v)) {
      if (!v.length) continue;
      lines.push(`**${label[0]!.toUpperCase()}${label.slice(1)}** (${v.length}):`);
      for (const it of v.slice(0, 5)) {
        const i = obj(it);
        if (!Object.keys(i).length) { lines.push(`- ${str(it, 120) ?? num(it) ?? ''}`); continue; }
        const title = str(i.number ?? i.name ?? i.title ?? i.what ?? i.label ?? i.part ?? i.page, 70) ?? 'Item';
        const rest = Object.entries(i).filter(([kk, vv]) => !['number', 'name', 'title', 'what', 'label', 'href', 'link', 'url', 'part', 'page'].includes(kk) && (typeof vv === 'string' || typeof vv === 'number')).slice(0, 4).map(([kk, vv]) => `${kk.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()} ${typeof vv === 'number' ? (/(naira|value|amount|cost|price|total)/i.test(kk) ? naira(vv) : num(vv)) : str(vv, 50)}`).join(', ');
        lines.push(`- ${link(title, i.href ?? i.link ?? i.url)}${rest ? ` — ${rest}` : ''}`);
      }
    } else if (typeof v === 'object') {
      const inner = Object.entries(obj(v)).filter(([kk, vv]) => !HIDE.has(kk) && (typeof vv === 'string' || typeof vv === 'number')).slice(0, 8).map(([kk, vv]) => `${kk.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()} ${typeof vv === 'number' ? (/(naira|value|amount|cost|price|total)/i.test(kk) ? naira(vv) : num(vv)) : str(vv, 60)}`).join(', ');
      if (inner) lines.push(`${label[0]!.toUpperCase()}${label.slice(1)}: ${inner}.`);
    } else if ((typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') && !HIDE.has(k)) {
      lines.push(`${label[0]!.toUpperCase()}${label.slice(1)}: ${typeof v === 'number' ? (/(naira|value|amount|cost|price|total)/i.test(k) ? naira(v) : num(v)) : String(v).slice(0, 160)}.`);
    }
  }
  return lines;
}

/** The briefing written from the figures alone — the fallback when the model is refused or away. */
export function renderBriefing(pack: BriefingPack, personName: string): string {
  const first = personName.split(/\s+/)[0] || personName;
  const out: string[] = [`Here is your briefing, ${first} — ${pack.generatedAt}.`];
  for (const s of pack.sections) {
    out.push(`\n### ${s.title}`);
    if (s.data === null) { out.push(s.note ?? 'Not available just now.'); continue; }
    const lines = s.key === 'day' ? day(s.data) : s.key === 'pending' ? pending(s.data) : s.key === 'business' ? business(s.data) : s.key === 'website' ? website(s.data) : s.key === 'stock' ? stock(s.data) : generic(s.data);
    out.push(lines.length ? lines.join('\n') : 'Nothing to report.');
  }
  if (pack.sources.length) out.push(`\nPages: ${pack.sources.slice(0, 6).map((s) => (s.href ? `[${s.label}](${s.href})` : s.label)).join(' · ')}`);
  out.push('\n_Written straight from the records just now; my writing model was busy, so the figures are listed rather than discussed. Ask me about any of them._');
  return out.join('\n');
}

/** The short system prompt for writing the briefing: one request, no tools. */
export function briefingSystemPrompt(o: { assistantName: string; organisationName: string; personName: string; roleDescription: string; now: string; branch: string | null }): string {
  return [
    `You are ${o.assistantName}, the assistant inside ${o.organisationName}'s enterprise platform. It is ${o.now}. You are briefing ${o.personName} (${o.roleDescription}).`,
    'Write the briefing from the figures given below and nothing else. Every number comes from those figures; never invent, estimate or round beyond the nearest thousand naira. Sections missing from the figures are not for this person\'s role: do not mention them or apologise for them.',
    'Shape: one-line verdict first (how the day and the month stand). Then, only where there are figures: what waits on them (link each record number as given, e.g. [JC-2026-000412](/workshop/job-cards/…)), what they sent that waits on others (say with whom), the business (sales, takings, gross profit and whether that is a profit, change on last month, biggest customers), the workshop now, decisions waiting, the team, customers and support, stock, the website and store. End with the two or three things to do first.',
    'Money is in naira (₦). Use short headings and bullet points; a table only for branches side by side. Links exactly as given (paths starting with /). Be direct and warm, never padded. No preamble such as "Here is your briefing".',
    ...(o.branch ? [`The person asked about the ${o.branch} branch: lead with that branch.`] : []),
  ].join('\n');
}
