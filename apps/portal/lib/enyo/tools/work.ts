/**
 * What is waiting for this person: the same live lists as the dashboard, the
 * bell and the Approvals page (each built by its module with the person's own
 * reach), counted and linked.
 */
import { currentAssist } from '@/lib/authz/server';
import { getDashboardNotifications } from '@/lib/actions/dashboard';
import { getMyJobs, getMyNumbers } from '@/lib/actions/my-work';
import { listCalendar } from '@/lib/actions/scheduling';
import { approvalArea } from '@/lib/approvals';
import { count, lagosDayStart, ok, STATUS_WORDS, when } from '../tool-helpers';
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

async function todaysAppointments() {
  const from = lagosDayStart(0);
  const rows = await listCalendar(from, lagosDayStart(1)).catch(() => []);
  return rows
    .filter((a: { status: string }) => a.status !== 'CANCELLED')
    .map((a: { title: string; startsAt: Date; endsAt: Date; status: string; room: { name: string } | null; location: string | null; id: string }) => ({
      title: a.title, starts: when(a.startsAt), ends: when(a.endsAt), status: STATUS_WORDS(a.status), where: a.room?.name ?? a.location ?? undefined, href: `/schedule/${a.id}`,
    }));
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
    status: 'Preparing your day…',
    description:
      'A short start-of-day brief for this person: counts of decisions and steps waiting (and how many are overdue), their open jobs, today\'s appointments, and their own numbers for this month (the same tiles as the dashboard). Use for "good morning", "brief me", "my day".',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    run: async () => {
      const [{ decisions, toDo }, jobs, appointments, numbers] = await Promise.all([
        waiting(),
        getMyJobs().catch(() => []),
        todaysAppointments(),
        getMyNumbers().catch(() => []),
      ]);
      return ok(
        {
          decisionsWaiting: decisions.length,
          decisionsOverdue: decisions.filter((d) => d.overdue).length,
          otherStepsWaiting: toDo.length,
          otherStepsOverdue: toDo.filter((d) => d.overdue).length,
          oldestWaiting: [...decisions, ...toDo].sort((a, b) => b.waitingDays - a.waitingDays).slice(0, 3),
          openJobs: jobs.length,
          appointmentsToday: appointments,
          myNumbersThisMonth: numbers.map((n) => ({ label: n.label, value: n.value, ...(n.suffix ? { unit: n.suffix.trim() } : {}), hint: n.hint, ...(n.href ? { href: n.href } : {}) })),
        },
        [{ label: 'Dashboard', href: '/dashboard' }],
      );
    },
  },
];
