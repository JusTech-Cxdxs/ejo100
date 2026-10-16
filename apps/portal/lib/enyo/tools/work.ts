/**
 * What is waiting for this person: the same live lists as the dashboard, the
 * bell and the Approvals page (each built by its module with the person's own
 * reach), counted and linked.
 */
import { currentAssist } from '@/lib/authz/server';
import { getDashboardNotifications } from '@/lib/actions/dashboard';
import { getMyJobs, getMyNumbers } from '@/lib/actions/my-work';
import { approvalArea } from '@/lib/approvals';
import { collectBrief } from '@/lib/brief/collect';
import { briefPeriod } from '@/lib/brief/core';
import { count, ok, STATUS_WORDS, when } from '../tool-helpers';
import type { StaffTool } from '../types';

const DAY = 86_400_000;

type Item = { id: string; title: string; detail: string; url: string; createdAt: Date };

async function waiting() {
  // Nothing is decided during an assisted session (as on the Approvals page).
  const assisting = await currentAssist();
  const all = (await getDashboardNotifications()) as Item[];
  const now = Date.now();
  const shape = (n: Item) => {
    const days = Math.floor((now - new Date(n.createdAt).getTime()) / DAY);
    return { title: n.title, detail: n.detail || undefined, href: n.url, since: when(n.createdAt), waitingDays: days > 0 ? days : 0, overdue: days >= 3 };
  };
  const decisions = assisting ? [] : all.filter((n) => approvalArea(n) !== null);
  const decisionIds = new Set(decisions.map((d) => d.id));
  const toDo = all.filter((n) => !decisionIds.has(n.id) && !(assisting && approvalArea(n) !== null));
  const oldestFirst = (a: Item, b: Item) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  return {
    decisions: decisions.sort(oldestFirst).map(shape),
    toDo: toDo.sort(oldestFirst).map(shape),
  };
}

export const workTools: StaffTool[] = [
  {
    name: 'my_work',
    kind: 'read',
    status: 'Checking what is waiting for you…',
    description:
      'Everything waiting for this person right now: decisions to take (approvals), other steps to take, and the open jobs they are working on or supervising. Oldest first, with how many days each has waited (overdue = 3 days or more) and links. Use for "what do I need to do", "what is pending", "what is overdue".',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    run: async () => {
      const [{ decisions, toDo }, jobs] = await Promise.all([waiting(), getMyJobs().catch(() => [])]);
      const myJobs = jobs.map((j) => ({ number: j.number, as: j.as, status: STATUS_WORDS(j.status), vehicle: j.vehicle || undefined, href: j.url }));
      return ok(
        {
          summary: `${count(decisions.length, 'decision')} waiting, ${count(toDo.length, 'other step')}, ${count(myJobs.length, 'open job')}.`,
          decisions: { count: decisions.length, overdue: decisions.filter((d) => d.overdue).length, items: decisions.slice(0, 10) },
          toDo: { count: toDo.length, overdue: toDo.filter((d) => d.overdue).length, items: toDo.slice(0, 10) },
          myJobs: { count: myJobs.length, items: myJobs.slice(0, 10) },
        },
        [{ label: 'Approvals', href: '/approvals' }, { label: 'Dashboard', href: '/dashboard' }],
      );
    },
  },
  {
    name: 'daily_brief',
    kind: 'read',
    status: 'Preparing your brief…',
    description:
      'This person\'s brief: decisions and steps waiting (with overdue), their support requests (and late ones), reminders due, appointments, open jobs, their own unread mail (Enyo-flagged first; never during an assisted session), new notifications and announcements — each with a link — plus their numbers this month. Periods: "now" (everything waiting), "today", "week", or "since_last" with no date. Use for "good morning", "brief me", "what have I left", "what did I miss today".',
    parameters: { type: 'object', properties: { period: { type: 'string', enum: ['now', 'today', 'week'], description: 'Default: now.' } }, additionalProperties: false },
    run: async (args) => {
      const period = briefPeriod({ scope: typeof args.period === 'string' ? args.period : 'now' });
      const [data, numbers] = await Promise.all([collectBrief(period), getMyNumbers().catch(() => [])]);
      return ok(
        {
          period: data.periodLabel,
          sections: data.sections.filter((x) => x.count > 0).map((x) => ({ what: x.title, count: x.count, ...(x.overdue ? { overdue: x.overdue } : {}), all: x.href, items: x.items.slice(0, 5) })),
          nothingWaiting: data.sections.every((x) => x.count === 0),
          myNumbersThisMonth: numbers.map((n) => ({ label: n.label, value: n.value, ...(n.suffix ? { unit: n.suffix.trim() } : {}), hint: n.hint, ...(n.href ? { href: n.href } : {}) })),
        },
        [{ label: 'Dashboard', href: '/dashboard' }],
      );
    },
  },
];
