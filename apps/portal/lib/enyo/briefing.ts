import 'server-only';
import { prisma } from '@ejo/database';
import { LlmError, lagosNow, stream, type ChatMessage, type EnyoEvent, type LlmConfig, type Source, type ToolResult, type Usage } from '@ejo/enyo';
import { allows } from '@/lib/authz/server';
import { staffTools } from './tools';
import type { StaffCtx, StaffTool } from './types';
import { isBriefingRequest, packToText, renderBriefing, type BriefingPack, type Section } from './briefing-core';

export { isBriefingRequest } from './briefing-core';

/**
 * "Brief me": the figures are gathered here, in code, as this person — the
 * same tools the model would have called, run directly and in parallel, each
 * one still authorising and fencing by role and branch — and the model is
 * asked ONCE, without tools, to write them up. One small request fits a free
 * model tier's per-minute budget, where a tool loop (four or five requests,
 * each carrying everything before it) did not. If the model is refused or
 * away, the briefing is still written from the figures, by hand.
 */
export type BriefingResult = {
  answer: string;
  model: string;
  usage: Usage;
  sources: Source[];
  toolRuns: { name: string; ok: boolean; refused?: boolean }[];
  /** True when the figures were written up without the model. */
  byHand: boolean;
};

const TOOL_TIMEOUT_MS = 12_000;

const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> =>
  new Promise((resolve, reject) => { const t = setTimeout(() => reject(new Error('Tool timed out')), ms); p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); }); });

async function runTool(tool: StaffTool | undefined, args: Record<string, unknown>, ctx: StaffCtx): Promise<ToolResult | null> {
  if (!tool) return null;
  try {
    return await withTimeout(tool.run(args, ctx), TOOL_TIMEOUT_MS);
  } catch {
    return { ok: false, message: 'Could not be read just now.' };
  }
}

/** A branch the message names, among the organisation's branches (the tools decide whether the person may see it). */
async function branchNamed(message: string, organisationId: string): Promise<string | undefined> {
  if (/\bmy branch\b/i.test(message)) return undefined; // the tools default to the person's own scope
  const branches = await prisma.branch.findMany({ where: { isActive: true, businessUnit: { organisationId } }, select: { name: true }, take: 100 }).catch(() => []);
  const lower = message.toLowerCase();
  return branches.map((b) => b.name).find((n) => n.length >= 3 && lower.includes(n.toLowerCase().replace(/\s+branch$/, '')));
}

/** Website and store leads for leaders: what the public website brought in this week. */
async function websiteLeads(ctx: StaffCtx): Promise<unknown> {
  if (!(await allows('analytics.business.view'))) return null;
  const since = new Date(Date.now() - 7 * 86_400_000);
  const [tickets, stories] = await Promise.all([
    prisma.supportTicket.findMany({ where: { organisationId: ctx.organisationId, channel: 'WEBSITE', createdAt: { gte: since } }, select: { tags: true, status: true }, take: 500 }),
    prisma.newsPost.findMany({ where: { organisationId: ctx.organisationId, status: 'PUBLISHED' }, orderBy: { publishedAt: 'desc' }, take: 1, select: { title: true, publishedAt: true } }).catch(() => []),
  ]);
  const by: Record<string, number> = {};
  for (const t of tickets) {
    const topic = t.tags.find((x) => x.startsWith('topic:'))?.slice(6) ?? 'other';
    const key = t.tags.includes('referral') ? 'referrals' : topic;
    by[key] = (by[key] ?? 0) + 1;
  }
  return {
    period: 'Last 7 days',
    enquiriesFromTheWebsite: tickets.length,
    byTopic: by,
    stillOpen: tickets.filter((t) => t.status !== 'RESOLVED' && t.status !== 'CLOSED').length,
    latestStoryOnTheWebsite: stories[0] ? { title: stories[0].title, published: stories[0].publishedAt?.toLocaleDateString('en-GB', { timeZone: 'Africa/Lagos', day: 'numeric', month: 'long' }) } : null,
    note: 'Online checkout is not open yet: store enquiries arrive here as sales and parts requests and referrals.',
  };
}

/** Gathers every section this person may see, in parallel, as them. */
export async function gatherBriefing(ctx: StaffCtx, message: string, emit: (e: EnyoEvent) => void): Promise<BriefingPack> {
  const tools = new Map(staffTools().map((t) => [t.name, t]));
  const branch = await branchNamed(message, ctx.organisationId);
  emit({ type: 'status', text: 'Gathering your briefing…' });
  const plan: { key: Section['key']; title: string; tool: string; args: Record<string, unknown> }[] = [
    { key: 'day', title: 'Your day', tool: 'daily_brief', args: { period: 'today' } },
    { key: 'pending', title: 'Waiting on others', tool: 'my_pending', args: {} },
    { key: 'business', title: branch ? `${branch} this month` : 'The business this month', tool: 'branch_briefing', args: branch ? { branch } : {} },
    { key: 'stock', title: 'Stock', tool: 'stock_alerts', args: {} },
    { key: 'support', title: 'Customer support', tool: 'support_overview', args: {} },
    { key: 'website', title: 'Website visitors', tool: 'website_traffic', args: { days: 7 } },
    { key: 'integrity', title: 'Integrity watch', tool: 'integrity_alerts', args: {} },
  ];
  const results = await Promise.all(plan.map(async (p) => ({ ...p, result: await runTool(tools.get(p.tool), p.args, ctx) })));
  const sections: Section[] = [];
  const toolRuns: BriefingResult['toolRuns'] = [];
  const sources: Source[] = [];
  for (const r of results) {
    if (!r.result) continue;
    toolRuns.push({ name: r.tool, ok: r.result.ok, ...(!r.result.ok && r.result.refused ? { refused: true } : {}) });
    emit({ type: 'tool', name: r.tool, ok: r.result.ok, ...(!r.result.ok && r.result.refused ? { refused: true } : {}) });
    if (!r.result.ok) {
      // Refused = not for this role: left out quietly. Anything else is said in one line.
      if (!r.result.refused && !/not allowed/i.test(r.result.message)) sections.push({ key: r.key, title: r.title, data: null, note: r.result.message.slice(0, 160) });
      continue;
    }
    sections.push({ key: r.key, title: r.title, data: r.result.data });
    for (const s of r.result.sources ?? []) if (!sources.some((x) => x.href === s.href)) sources.push(s);
  }
  const leads = await websiteLeads(ctx).catch(() => null);
  if (leads) sections.push({ key: 'leads', title: 'Website and store', data: leads });
  return { sections, toolRuns, sources, branch: branch ?? null, generatedAt: lagosNow() };
}

/** One small request: the figures in, the briefing out. Streams the text as it arrives. */
async function writeWithModel(o: { config: LlmConfig; model: string; system: string; pack: BriefingPack; message: string; emit: (e: EnyoEvent) => void; signal?: AbortSignal }): Promise<{ text: string; model: string; usage: Usage }> {
  const messages: ChatMessage[] = [
    { role: 'system', content: o.system },
    { role: 'user', content: `${o.message}\n\nThe figures, gathered just now from the organisation's records as me (everything I am allowed to see; sections not shown are not for my role):\n${packToText(o.pack)}` },
  ];
  let text = '';
  let model = o.model;
  const usage: Usage = { tokensIn: 0, tokensOut: 0 };
  for await (const piece of stream(o.config, { messages, model: o.model, maxTokens: 1100, temperature: 0.2, reasoning: 'low', signal: o.signal })) {
    if (piece.type === 'text') { text += piece.text; o.emit({ type: 'text', text: piece.text }); }
    else { model = piece.completion.model; usage.tokensIn += piece.completion.usage.tokensIn; usage.tokensOut += piece.completion.usage.tokensOut; }
  }
  return { text, model, usage };
}

/** The whole briefing: gather, then write (with the model, or by hand when it cannot help). */
export async function briefing(o: { ctx: StaffCtx; config: LlmConfig; model: string; system: string; message: string; emit: (e: EnyoEvent) => void; signal?: AbortSignal }): Promise<BriefingResult> {
  const pack = await gatherBriefing(o.ctx, o.message, o.emit);
  if (!pack.sections.length) {
    const text = 'I could not read anything for a briefing just now. Please try again in a minute.';
    o.emit({ type: 'text', text });
    return { answer: text, model: 'briefing', usage: { tokensIn: 0, tokensOut: 0 }, sources: [], toolRuns: pack.toolRuns, byHand: true };
  }
  o.emit({ type: 'status', text: 'Writing it up…' });
  try {
    const w = await writeWithModel({ ...o, pack });
    if (w.text.trim()) return { answer: w.text, model: w.model, usage: w.usage, sources: pack.sources, toolRuns: pack.toolRuns, byHand: false };
  } catch (err) {
    if (err instanceof LlmError && err.kind === 'aborted') throw err;
    // Refused, rate-limited or away: the figures are written up without it, below.
  }
  const text = renderBriefing(pack, o.ctx.name);
  o.emit({ type: 'text', text });
  return { answer: text, model: 'briefing', usage: { tokensIn: 0, tokensOut: 0 }, sources: pack.sources, toolRuns: pack.toolRuns, byHand: true };
}
