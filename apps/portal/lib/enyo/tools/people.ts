/**
 * People tools: the staff directory ("who is Bhushan?", "who is the Manager at
 * Isolo?") from the organisation's own records — name, role, branch,
 * department and work email; nothing personal — and "what am I waiting on",
 * the person's own requests still with someone else. Both are fenced to the
 * signed-in person's organisation.
 */
import { prisma } from '@ejo/database';
import { getPrincipal } from '@/lib/authz/server';
import { ROLE_LABELS, isHqRole, primaryRoleLabel } from '@/lib/authz/catalogue';
import { getMyPending } from '@/lib/actions/pending';
import { nothing, ok, text, when } from '../tool-helpers';
import type { StaffTool } from '../types';

const short = (label: string) => label.replace(/\s*\(.*\)\s*$/, '');

export const peopleTools: StaffTool[] = [
  {
    name: 'staff_directory',
    kind: 'read',
    status: 'Looking in the staff directory…',
    description:
      'The organisation\'s own staff directory: who someone is (role, branch or headquarters, department, work email, active or not), or who holds a role somewhere ("who is the Manager at Isolo", "who are the supervisors", "who is in IT"). Search by part of a name, a role, a branch or a department. Use it FIRST for any "who is <name>" about a colleague; organisation_info has the published leadership list and biographies.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'A name, or part of one (e.g. "Salgar"). Empty to search by role/branch only.', maxLength: 80 },
        role: { type: 'string', description: 'Optional: a role, e.g. "Manager", "Supervisor", "Executive", "IT", "Store".', maxLength: 60 },
        branch: { type: 'string', description: 'Optional: a branch or department name.', maxLength: 80 },
      },
      additionalProperties: false,
    },
    run: async (args, ctx) => {
      const p = await getPrincipal();
      const org = p.organisationId ?? ctx.organisationId;
      if (!org) return nothing('This account is not placed in an organisation yet.');
      const q = text(args.query, 80);
      const roleWord = text(args.role, 60).toLowerCase();
      const place = text(args.branch, 80);
      const terms = q.split(/\s+/).filter((w) => w.length >= 2).slice(0, 4);
      const slugs = roleWord ? Object.entries(ROLE_LABELS).filter(([slug, label]) => label.toLowerCase().includes(roleWord) || slug.includes(roleWord.replace(/\s+/g, '-'))).map(([slug]) => slug) : [];
      if (roleWord && !slugs.length) return nothing(`No role called "${roleWord}". Roles: ${[...new Set(Object.values(ROLE_LABELS).map(short))].join(', ')}.`);
      const people = await prisma.user.findMany({
        where: {
          organisationId: org,
          accountType: 'EMPLOYEE',
          ...(terms.length ? { AND: terms.map((w) => ({ fullName: { contains: w, mode: 'insensitive' as const } })) } : {}),
          ...(slugs.length ? { roles: { some: { role: { slug: { in: slugs } } } } } : {}),
          ...(place ? { OR: [{ branch: { name: { contains: place, mode: 'insensitive' as const } } }, { department: { name: { contains: place, mode: 'insensitive' as const } } }] } : {}),
        },
        orderBy: [{ isActive: 'desc' }, { fullName: 'asc' }],
        take: 15,
        select: { fullName: true, email: true, isActive: true, branch: { select: { name: true } }, department: { select: { name: true } }, roles: { select: { role: { select: { slug: true, name: true, isSuperAdmin: true } } } } },
      });
      if (!people.length) return nothing(`Nobody in the staff directory matches${q ? ` "${q}"` : ''}${roleWord ? ` as ${roleWord}` : ''}${place ? ` at ${place}` : ''}. If they are a public figure, organisation_info or the web look-up may know them.`);
      return ok({
        people: people.map((u) => {
          const roleSlugs = u.roles.map((r) => r.role.slug);
          const master = u.roles.some((r) => r.role.isSuperAdmin);
          return {
            name: u.fullName,
            role: primaryRoleLabel(roleSlugs, master) ?? u.roles[0]?.role.name ?? 'No role yet',
            allRoles: u.roles.map((r) => (ROLE_LABELS[r.role.slug] ? short(ROLE_LABELS[r.role.slug]!) : r.role.name)),
            where: isHqRole(roleSlugs) ? 'Headquarters (oversees all branches)' : [u.branch?.name, u.department?.name].filter(Boolean).join(' · ') || 'Not placed in a branch',
            workEmail: u.email,
            active: u.isActive,
          };
        }),
        note: 'Answer as "Name — Role, where". Do not share anything beyond these fields.',
      }, [{ label: 'People & access', href: '/users' }]);
    },
  },
  {
    name: 'my_pending',
    kind: 'read',
    status: 'Checking what you are waiting on…',
    description:
      'What this person asked for that is still WAITING ON SOMEONE ELSE: Job Cards and Vehicle Services waiting for the supervisor, estimates waiting for the supervisor or the Manager, parts requests with the Manager or the Store, outside purchases with Finance or the Manager, exit passes, warranty claims, close and cancel requests, road tests, help requests — each with who has it (name and role), since when, and a link. Use it with daily_brief for "brief me", and for "what am I waiting on", "has my PRS been approved", "where is my exit pass".',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    run: async () => {
      const items = await getMyPending();
      if (!items.length) return ok({ waiting: [], note: 'Nothing this person sent is waiting on anyone.' }, [{ label: 'Approvals', href: '/approvals#waiting' }]);
      return ok({
        waiting: items.slice(0, 20).map((i) => ({ number: i.number, what: i.title, withWhom: i.waitingOn, since: when(i.since), link: i.url })),
        total: items.length,
        tip: 'List each as "<number> — <what>, with <whom> since <when>" and link the number. Oldest first; say which have waited longest.',
      }, [{ label: 'Waiting on others', href: '/approvals#waiting' }, ...items.slice(0, 4).map((i) => ({ label: i.number, href: i.url }))]);
    },
  },
];
