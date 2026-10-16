/**
 * The organisation itself, for any member of staff: its name and contact
 * details, its businesses and branches, and the people it publishes
 * (Organisation → People we publish: leadership, heads of department) — so
 * "who is <our director>?" is answered from the organisation's own list
 * before the web is searched. Only this organisation's rows; no personal
 * contact details are kept or returned.
 */
import { prisma } from '@ejo/database';
import { getPrincipal } from '@/lib/authz/server';
import { ok } from '../tool-helpers';
import type { StaffTool } from '../types';

export const organisationTools: StaffTool[] = [
  {
    name: 'organisation_info',
    kind: 'read',
    status: 'Looking up the organisation…',
    description:
      'This organisation: its name and contact details, its businesses and branches, and its leadership and other people it publishes (name, title, the part of the business they lead, a short biography and a public profile link). Use it first for "who is <name>?" about someone at the organisation, or "who heads …"; if they are not listed, try the web look-up with the name and the organisation.',
    parameters: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Optional: a person\'s name or a title to look for, e.g. "Mittal" or "IT".', maxLength: 80 } },
      additionalProperties: false,
    },
    run: async (args, ctx) => {
      const q = typeof args.name === 'string' ? args.name.trim().slice(0, 80) : '';
      const terms = q.split(/\s+/).filter((w) => w.length >= 2).slice(0, 4);
      // The session is read again: the organisation is the signed-in person's own.
      const org = (await getPrincipal()).organisationId ?? ctx.organisationId;
      const [o, units, branches, people] = await Promise.all([
        prisma.organisation.findUnique({ where: { id: org }, select: { name: true, legalName: true, website: true, hotlines: true, email: true, hqAddress: true } }),
        prisma.businessUnit.findMany({ where: { organisationId: org, isActive: true }, orderBy: { name: 'asc' }, take: 20, select: { name: true } }),
        prisma.branch.findMany({ where: { isActive: true, businessUnit: { organisationId: org } }, orderBy: { name: 'asc' }, take: 40, select: { name: true, businessUnit: { select: { name: true } }, city: { select: { name: true } } } }),
        prisma.publicProfile.findMany({
          where: {
            organisationId: org,
            ...(terms.length ? { OR: terms.flatMap((w) => [{ name: { contains: w, mode: 'insensitive' as const } }, { title: { contains: w, mode: 'insensitive' as const } }, { area: { contains: w, mode: 'insensitive' as const } }]) } : {}),
          },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          take: 40,
          select: { name: true, title: true, area: true, bio: true, profileUrl: true, isPublic: true },
        }).catch(() => []),
      ]);
      return ok({
        organisation: o ? { name: o.name, legalName: o.legalName, website: o.website, phones: o.hotlines, email: o.email, headOffice: o.hqAddress } : null,
        businesses: units.map((u) => u.name),
        branches: branches.map((b) => ({ name: b.name, business: b.businessUnit?.name ?? null, city: b.city?.name ?? null })),
        people: people.map((p) => ({ name: p.name, title: p.title, area: p.area, about: p.bio, profile: p.profileUrl, shownOnWebsite: p.isPublic })),
        note: people.length
          ? 'Answer "who is" questions from "people" (title, area, about). Mention the public profile link when there is one.'
          : q ? `Nobody matching "${q}" is in the organisation's published list. Try the web look-up with the name and the organisation, and say if nothing clearly matches.` : 'The organisation has not published a leadership list yet (Organisation → People we publish).',
      }, [{ label: 'Organisation', href: '/organisation' }]);
    },
  },
];
