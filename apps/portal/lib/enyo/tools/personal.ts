/**
 * The person's own things: their calendar, their exit passes and visitors,
 * and the facts they asked Enyo to remember. Calendar and security go through
 * their modules' own readers (listCalendar, listExitPasses('mine'),
 * listMyVisits), which only ever return this person's records. Memory is
 * theirs alone (by user id and organisation), at most 50 facts of 200
 * characters, and is not changed during an assisted session.
 */
import { prisma } from '@ejo/database';
import { looksLikeInjection } from '@ejo/enyo';
import { currentAssist, getPrincipal, myOrganisationId } from '@/lib/authz/server';
import { requireUser } from '@/lib/actions/workshop';
import { listCalendar } from '@/lib/actions/scheduling';
import { listExitPasses, listMyVisits } from '@/lib/actions/security';
import { count, lagosDayStart, lagosWeekStart, nothing, ok, refused, STATUS_WORDS, text, when } from '../tool-helpers';
import type { StaffTool } from '../types';

export const MAX_FACTS = 50;
export const MAX_FACT_CHARS = 200;
const ACTIVE_PASS = ['PENDING_HEAD', 'PENDING_MANAGER', 'APPROVED', 'OUT'];

/** The person's own message asks Enyo to keep or drop a note about them. */
const ASKED_TO_REMEMBER = /\b(remember|note (that|down)|keep in mind|call me|my name is|don'?t forget)\b/i;
const ASKED_TO_FORGET = /\b(forget|stop remembering|remove (that|the note|what you remember)|delete (that|the note|what you remember))\b/i;

export const personalTools: StaffTool[] = [
  {
    name: 'my_schedule',
    kind: 'read',
    status: 'Checking your calendar…',
    description: 'This person\'s appointments and meetings for today, tomorrow or this week (their own calendar, calendars they book for as an aide, and meetings they take part in), with times in Lagos and links.',
    parameters: {
      type: 'object',
      properties: { when: { type: 'string', enum: ['today', 'tomorrow', 'this_week'], description: 'Which day(s) (default today).' } },
      additionalProperties: false,
    },
    run: async (args) => {
      const w = text(args.when, 12) || 'today';
      const from = w === 'tomorrow' ? lagosDayStart(1) : w === 'this_week' ? lagosWeekStart() : lagosDayStart(0);
      const to = w === 'tomorrow' ? lagosDayStart(2) : w === 'this_week' ? new Date(lagosWeekStart().getTime() + 7 * 86_400_000) : lagosDayStart(1);
      const rows = await listCalendar(from, to);
      const items = rows.filter((a) => a.status !== 'CANCELLED').slice(0, 25).map((a) => ({
        title: a.title, number: a.appointmentNumber, starts: when(a.startsAt), ends: when(a.endsAt), status: STATUS_WORDS(a.status), calendarOf: a.owner.fullName,
        where: a.room?.name ?? a.location ?? null, visitors: a.visits.reduce((s: number, v: { partySize: number }) => s + v.partySize, 0), href: `/schedule/${a.id}`,
      }));
      return ok({ period: w.replace('_', ' '), summary: count(items.length, 'appointment'), appointments: items }, [{ label: 'Calendar', href: '/schedule/calendar' }]);
    },
  },
  {
    name: 'my_security',
    kind: 'read',
    status: 'Checking your passes and visitors…',
    description: 'This person\'s own exit passes that are still active (waiting for approval, approved, or out) and their visitors expected today or on site now, with links.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    run: async () => {
      const [passes, visits] = await Promise.all([listExitPasses('mine'), listMyVisits()]);
      const tomorrow = lagosDayStart(1).getTime();
      const active = passes.filter((p) => ACTIVE_PASS.includes(p.status)).slice(0, 10).map((p) => ({
        number: p.passNumber, status: STATUS_WORDS(p.status), reason: p.reason, leaving: when(p.expectedOutAt), backBy: when(p.expectedReturnAt), out: when(p.gateOutAt), href: `/security/exit-passes/${p.id}`,
      }));
      const expected = visits.expected.filter((v) => !v.expectedAt || new Date(v.expectedAt).getTime() < tomorrow).slice(0, 10)
        .map((v) => ({ visitor: v.visitorName, company: v.company, people: v.partySize, expected: when(v.expectedAt), purpose: v.purpose, href: `/security/visitors/${v.id}` }));
      const onSite = visits.onSite.slice(0, 10).map((v) => ({ visitor: v.visitorName, company: v.company, people: v.partySize, arrived: when(v.checkedInAt), href: `/security/visitors/${v.id}` }));
      return ok({ activeExitPasses: active, visitorsExpectedToday: expected, visitorsOnSiteNow: onSite }, [{ label: 'My exit passes', href: '/security/exit-passes' }, { label: 'My visitors', href: '/security/my-visitors' }]);
    },
  },
  {
    name: 'remember_fact',
    // Changes only this person's own Enyo memory (no business record), visible and deletable by them.
    kind: 'read',
    status: 'Making a note…',
    description: 'Remember a short fact this person asks you to keep in mind in future chats ("call me Ada", "I work on commercial vehicles"). Only when they ask you to remember something. Never store passwords, card numbers or other people\'s private details.',
    parameters: {
      type: 'object',
      properties: { fact: { type: 'string', description: 'The fact, in one short sentence (max 200 characters).', minLength: 2, maxLength: 200 } },
      required: ['fact'],
      additionalProperties: false,
    },
    run: async (args, ctx) => {
      const user = await requireUser();
      if (await currentAssist()) return refused('Enyo\'s memory is not changed during an assisted session.');
      // Only when the person's own words ask for it (never on the say-so of an email or page).
      if (!ASKED_TO_REMEMBER.test(ctx.question ?? '')) return nothing('Only remember something when the person themselves asks you to. Nothing was saved.');
      const fact = text(args.fact, MAX_FACT_CHARS).replace(/\s+/g, ' ');
      if (fact.length < 2) return nothing('There is nothing to remember.');
      if (looksLikeInjection(fact) || /\b(password|pin|cvv|card number|otp)\b/i.test(fact)) return nothing('That cannot be remembered (instructions to Enyo, passwords and card details are never stored). Say so kindly.');
      const organisationId = (await getPrincipal()).organisationId ?? (await myOrganisationId());
      if (!organisationId) return nothing('This account is not placed in an organisation yet.');
      const mine = await prisma.enyoMemory.findMany({ where: { userId: user.id, organisationId }, select: { fact: true } });
      if (mine.some((m) => m.fact.toLowerCase() === fact.toLowerCase())) return ok({ remembered: fact, note: 'Already remembered.' });
      if (mine.length >= MAX_FACTS) return nothing(`Enyo already remembers ${MAX_FACTS} facts for this person. Ask them to remove some first (say "forget …").`);
      await prisma.enyoMemory.create({ data: { userId: user.id, organisationId, fact } });
      return ok({ remembered: fact, total: mine.length + 1 });
    },
  },
  {
    name: 'forget_fact',
    // Changes only this person's own Enyo memory.
    kind: 'read',
    status: 'Updating my notes…',
    description: 'Forget facts this person asked you to remember: those containing the given words, or all of them when they say "forget everything".',
    parameters: {
      type: 'object',
      properties: {
        about: { type: 'string', description: 'Words from the fact(s) to forget.', maxLength: 200 },
        all: { type: 'boolean', description: 'True to forget every fact (only when the person clearly asks for that).' },
      },
      additionalProperties: false,
    },
    run: async (args, ctx) => {
      const user = await requireUser();
      if (await currentAssist()) return refused('Enyo\'s memory is not changed during an assisted session.');
      if (!ASKED_TO_FORGET.test(ctx.question ?? '')) return nothing('Only forget something when the person themselves asks you to. Nothing was removed.');
      const organisationId = (await getPrincipal()).organisationId ?? (await myOrganisationId());
      if (!organisationId) return nothing('This account is not placed in an organisation yet.');
      const about = text(args.about, MAX_FACT_CHARS);
      if (!about && args.all !== true) return nothing('Say what to forget, or confirm forgetting everything.');
      const where = { userId: user.id, organisationId, ...(args.all === true ? {} : { fact: { contains: about, mode: 'insensitive' as const } }) };
      const gone = await prisma.enyoMemory.findMany({ where, select: { fact: true }, take: MAX_FACTS });
      if (!gone.length) return nothing('No remembered fact matches that.');
      await prisma.enyoMemory.deleteMany({ where });
      return ok({ forgotten: gone.map((g) => g.fact) });
    },
  },
];
