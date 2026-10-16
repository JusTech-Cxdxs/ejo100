/**
 * What Enyo may say about the organisation: only what the database and the
 * website's own configuration hold. Nothing is invented — a missing fact
 * (opening hours, prices) is reported as missing.
 */
import { prisma } from '@ejo/database';
import { siteConfig } from '@/lib/site-config';
import { SEARCH_INDEX } from '@/lib/search-index';

export type CompanyInfo = {
  organisation: string;
  headOffice: { address: string | null; phones: string[]; email: string | null; website: string | null };
  branches: { name: string; area: string | null; address: string | null; phones: string[]; email: string | null }[];
  openingHours: string | null;
  businesses: string[];
  websitePages: { title: string; link: string }[];
  howToBook: string[];
  customerPortal: string;
  notes: string[];
};

const unique = (xs: (string | null | undefined)[]) => [...new Set(xs.map((x) => (x ?? '').trim()).filter(Boolean))];

export async function loadCompanyInfo(organisationId: string): Promise<CompanyInfo> {
  const [org, branches, units] = await Promise.all([
    prisma.organisation.findUnique({ where: { id: organisationId }, select: { name: true, hotlines: true, email: true, hqAddress: true, website: true } }),
    prisma.branch.findMany({
      where: { isActive: true, businessUnit: { organisationId, isActive: true } },
      orderBy: { name: 'asc' },
      take: 30,
      select: { name: true, address: true, hotlines: true, email: true, city: { select: { name: true, state: { select: { name: true } } } } },
    }),
    prisma.businessUnit.findMany({ where: { organisationId, isActive: true }, orderBy: { name: 'asc' }, take: 20, select: { name: true } }),
  ]);
  // v36: opening hours from the Support centre's set-up, when an administrator has saved them.
  const setting = await prisma.supportSetting.findUnique({ where: { organisationId }, select: { hours: true } }).catch(() => null);
  const phones = unique([...(org?.hotlines ?? []), siteConfig.contact.phone]);
  const email = org?.email?.trim() || siteConfig.contact.email || null;
  return {
    organisation: org?.name || siteConfig.organisationName,
    headOffice: { address: org?.hqAddress?.trim() || siteConfig.contact.address || null, phones, email, website: org?.website?.trim() || null },
    branches: branches.map((b) => ({
      name: b.name,
      area: [b.city?.name, b.city?.state?.name].filter(Boolean).join(', ') || null,
      address: b.address?.trim() || null,
      phones: unique(b.hotlines),
      email: b.email?.trim() || null,
    })),
    openingHours: setting?.hours ? hoursText(setting.hours) : null,
    businesses: unique(units.map((u) => u.name)),
    websitePages: SEARCH_INDEX.filter((e) => e.category === 'Business' || ['/contact', '/support', '/about'].includes(e.href)).map((e) => ({ title: e.title, link: e.href })),
    howToBook: [
      'Call or email the branch nearest to you to book a service or repair; the team arranges the time with you.',
      'Existing customers can follow their vehicles, estimates and payments in the customer portal.',
    ],
    customerPortal: '/customer-portal',
    notes: [
      ...(setting?.hours ? ['Closed on public holidays.'] : ['Opening hours are not listed. Suggest calling the branch to confirm before visiting.']),
      'Prices are not published. Estimates are prepared after the vehicle is inspected.',
    ],
  };
}

/** {"1":["08:00","17:00"],…} → "Monday 08:00–17:00; …; Sunday closed" (Lagos time). */
function hoursText(json: unknown): string | null {
  if (!json || typeof json !== 'object') return null;
  const names = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const parts = [1, 2, 3, 4, 5, 6, 7].map((d) => {
    const v = (json as Record<string, unknown>)[String(d)];
    return Array.isArray(v) && typeof v[0] === 'string' && typeof v[1] === 'string' ? `${names[d]} ${v[0]}–${v[1]}` : `${names[d]} closed`;
  });
  return `${parts.join('; ')} (Lagos time)`;
}
