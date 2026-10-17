/**
 * The Support centre and inventory analytics, as tools. Each runs the
 * module's own authorised code as the person asking (support.tickets.manage
 * for support, analytics.inventory.view for stock), within their reach.
 * Nothing here writes, sends or changes anything.
 */
import type { ToolResult } from '@ejo/enyo';
import { prisma } from '@ejo/database';
import { allows, getPrincipal, myOrganisationId, reachWhere } from '@/lib/authz/server';
import { getSupportInbox } from '@/lib/actions/support';
import { getSupportAnalytics } from '@/lib/actions/support-analytics';
import { getInventoryAnalytics } from '@/lib/actions/inventory-analytics';
import { ticketReachWhere } from '@/lib/support-rules';
import { minutesLabel, reasonLabels, slaState, dueLabel, PRIORITY_LABEL, asPriority } from '@/lib/support/core';
import { NOT_PERMITTED, type StaffTool } from '../types';
import { fenceStaffHelp } from '@/lib/support/reach';

const nothing = (message: string): ToolResult => ({ ok: false, message });
const pct = (n: number | null) => (n === null ? null : `${Math.round(n * 100)}%`);

export const supportTools: StaffTool[] = [
  {
    name: 'support_overview',
    kind: 'read',
    status: 'Checking the Support centre…',
    description: 'The Support centre right now, for the person asking: how many requests are open, unassigned, late or due within the hour, waiting on customers, on hold and assigned to them; per team; and the most urgent ones (number, customer, subject, priority, how late). Use for "what is waiting in support", "anything late", "my tickets".',
    parameters: { type: 'object', properties: { view: { type: 'string', enum: ['open', 'unassigned', 'mine', 'late', 'waiting', 'on_hold'], description: 'Which requests to list (default: late first, then open).' } }, additionalProperties: false },
    run: async (args) => {
      if (!(await allows('support.tickets.manage'))) return NOT_PERMITTED;
      const view = typeof args.view === 'string' ? args.view : 'late';
      const inbox = await getSupportInbox({ filter: view });
      const list = inbox.rows.slice(0, 12).map((r) => ({
        number: r.number, customer: r.contactName, subject: r.subject, priority: PRIORITY_LABEL[r.priority], team: r.queueName, status: r.statusLabel,
        firstAnswer: r.due ?? (r.firstResponse ? `answered after ${r.firstResponse}` : null), assignedTo: r.mine ? 'you' : r.assignedTo ?? 'nobody', link: `/crm/support/${r.id}`,
      }));
      return {
        ok: true,
        data: { counts: inbox.counts, teams: inbox.queues.map((q) => ({ team: q.name, open: q.open })), listed: view, requests: list },
        sources: [{ label: 'Support centre', href: `/crm/support?filter=${view}` }],
      };
    },
  },
  {
    name: 'support_request',
    kind: 'read',
    status: 'Opening the support request…',
    description: 'One support request by its number (SUP-2026-000123): status, priority, team, who has it, the customer, the summary, why a person is needed, the first-answer target, and the last few messages (internal notes marked). Only requests the person may handle.',
    parameters: { type: 'object', properties: { number: { type: 'string', maxLength: 20, description: 'The SUP number.' } }, required: ['number'], additionalProperties: false },
    run: async (args) => {
      if (!(await allows('support.tickets.manage'))) return NOT_PERMITTED;
      const number = String(args.number ?? '').trim().toUpperCase();
      if (!/^SUP-\d{4}-\d{6}$/.test(number)) return nothing('That is not a support number (they look like SUP-2026-000123). Ask for the number.');
      const reach = (await fenceStaffHelp(ticketReachWhere(await reachWhere('support.tickets.manage', { lens: false }), await myOrganisationId())));
      const t = await prisma.supportTicket.findFirst({
        where: { AND: [{ number }, reach as object] },
        select: {
          id: true, number: true, status: true, priority: true, subject: true, summary: true, contactName: true, handoverReason: true, createdAt: true, firstResponseAt: true, dueFirstResponseAt: true, assignedToId: true, queueId: true, aiOutcome: true, csatScore: true,
          replies: { where: { kind: { in: ['CUSTOMER', 'AGENT', 'AI', 'NOTE'] } }, orderBy: { createdAt: 'desc' }, take: 5, select: { kind: true, body: true, createdAt: true } },
        },
      });
      if (!t) return nothing('No support request with that number is available to this person. Say so and ask them to check the number.');
      const [who, queue] = await Promise.all([
        t.assignedToId ? prisma.user.findUnique({ where: { id: t.assignedToId }, select: { fullName: true } }) : null,
        t.queueId ? prisma.supportQueue.findUnique({ where: { id: t.queueId }, select: { name: true } }) : null,
      ]);
      const sla = slaState(t);
      return {
        ok: true,
        data: {
          number: t.number, status: t.status, priority: PRIORITY_LABEL[asPriority(t.priority)], team: queue?.name ?? null, assignedTo: who?.fullName ?? 'nobody', customer: t.contactName, subject: t.subject,
          summary: t.summary, whyAPerson: reasonLabels(t.handoverReason), firstAnswer: t.firstResponseAt ? (sla === 'breached' ? 'given late' : 'given on time') : t.dueFirstResponseAt ? dueLabel(t.dueFirstResponseAt) : null,
          enyo: t.aiOutcome, rating: t.csatScore,
          lastMessages: t.replies.reverse().map((r) => ({ from: r.kind === 'CUSTOMER' ? 'customer' : r.kind === 'NOTE' ? 'colleague (internal note)' : r.kind === 'AI' ? 'Enyo' : 'our team', text: r.body.slice(0, 600) })),
        },
        sources: [{ label: t.number, href: `/crm/support/${t.id}` }],
      };
    },
  },
  {
    name: 'support_numbers',
    kind: 'read',
    status: 'Working out the support numbers…',
    description: 'Support centre performance over a period (7, 30, 90 or 365 days): requests, median and 90th-percentile first answer, first-answer target met, share resolved by Enyo, why people were needed, reopen rate, satisfaction, backlog by age, top topics and per team.',
    parameters: { type: 'object', properties: { days: { type: 'number', minimum: 7, maximum: 365, description: '7, 30, 90 or 365 (default 30).' } }, additionalProperties: false },
    run: async (args) => {
      if (!(await allows('support.tickets.manage'))) return NOT_PERMITTED;
      const a = await getSupportAnalytics({ days: Number(args.days) || 30 });
      const m = a.m;
      return {
        ok: true,
        data: {
          days: a.days, requests: m.total, stillOpen: m.open + m.onHold, firstAnswerMedian: minutesLabel(m.firstResponseMedianMin), firstAnswer90th: minutesLabel(m.firstResponseP90Min),
          resolutionMedian: minutesLabel(m.resolutionMedianMin), targetMet: pct(m.slaAttainment), late: m.slaBreached,
          resolvedByEnyo: pct(m.aiResolutionRate), enyoAnswered: m.aiAnswered, customersConfirmed: m.aiConfirmed, neededAPersonAfterEnyo: m.aiEscalated,
          whyAPerson: m.handovers.slice(0, 6).map((h) => ({ reason: h.label, count: h.count })), reopenRate: pct(m.reopenRate), satisfied: pct(m.csat), ratings: m.csatResponses,
          backlog: m.backlog, topics: a.topics.slice(0, 8), teams: a.queues.map((q) => ({ team: q.name, requests: q.total, open: q.open, targetMet: pct(q.slaAttainment), satisfied: pct(q.csat) })),
        },
        sources: [{ label: 'Support numbers', href: `/crm/support/analytics?days=${a.days}` }],
      };
    },
  },
  {
    name: 'inventory_overview',
    kind: 'read',
    status: 'Reading the stock analytics…',
    description: 'Inventory Analytics for one branch (the person\'s own by default): stock value, parts, last-12-months revenue, cost and margin, turnover and days of inventory, parts out of stock / below safety / below reorder, stock-outs expected in 14 and 30 days, dead and overstock value, and the top recommended actions with links. For Store and Workshop Managers and administrators.',
    parameters: { type: 'object', properties: { branch: { type: 'string', maxLength: 80, description: 'Branch name (optional; default the person\'s branch).' } }, additionalProperties: false },
    run: async (args) => {
      if (!(await allows('analytics.inventory.view'))) return NOT_PERMITTED;
      const p = await getPrincipal();
      const name = typeof args.branch === 'string' ? args.branch.trim().slice(0, 80) : '';
      const reach = await reachWhere('analytics.inventory.view');
      const branch = name
        ? await prisma.branch.findFirst({ where: { name: { contains: name, mode: 'insensitive' }, ...(p.organisationId ? { businessUnit: { organisationId: p.organisationId } } : {}), ...(reach.branchId ? { id: reach.branchId as never } : {}) }, select: { id: true, name: true } })
        : p.branchId ? await prisma.branch.findUnique({ where: { id: p.branchId }, select: { id: true, name: true } }) : null;
      if (!branch) return nothing(name ? 'No branch by that name is within this person\'s reach. Ask which branch.' : 'This person has no home branch: ask which branch to look at.');
      const a = await getInventoryAnalytics(branch.id);
      const d = a.descriptive;
      return {
        ok: true,
        data: {
          branch: branch.name, parts: d.parts, stockValue: d.stockValue, last12Months: { revenue: d.revenue365, cost: d.cogs365, grossProfit: d.grossProfit, marginPercent: d.marginPercent },
          turnover: a.statistics.turnover, daysOfInventory: a.statistics.daysOfInventory, statusCounts: d.statusCounts,
          stockoutsIn14Days: a.predictive.stockoutIn14, stockoutsIn30Days: a.predictive.stockoutIn30, suggestedReorderSpend: a.predictive.reorderSpend,
          deadStockValue: a.diagnostic.deadStockValue, overstockValue: a.diagnostic.overstockValue,
          topActions: a.prescriptive.actions.slice(0, 8).map((x) => ({ action: x.title, detail: x.detail, link: x.href })),
          note: 'Figures in naira. Suggestions only — nothing has been ordered or changed.',
        },
        sources: [{ label: `Inventory Analytics — ${branch.name}`, href: '/inventory/analytics' }],
      };
    },
  },
];
