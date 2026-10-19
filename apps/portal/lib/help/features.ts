/**
 * "What I can do here" (pure, tested): the features people miss — Enyo on
 * every page, refining text, voice notes, the daily brief, predictions,
 * service tracking, the Support centre — each with where it lives and who has
 * it, plus the how-to guide grouped by area. Shown only for what the person's
 * own permissions open (the same decide() as the menu and the pages).
 */
import { decide, type PermissionKey, type Principal } from '../authz/catalogue';
import { canOpenGuide, GUIDE, type GuideEntry } from '../enyo/guide';

export type Highlight = {
  id: string;
  title: string;
  /** One or two sentences: what it does for the person. */
  text: string;
  /** Where to find it, in plain words. */
  where: string;
  href: string;
  /** Seeing it needs ANY of these (empty: everyone signed in). */
  needs: PermissionKey[];
  /** A question to try with Enyo. */
  try?: string;
  tag: 'Enyo' | 'Everyday' | 'Workshop' | 'Leadership' | 'Support' | 'IT';
};

export const HIGHLIGHTS: Highlight[] = [
  { id: 'enyo', tag: 'Enyo', title: 'Enyo, the assistant on every page', text: 'Ask in your own words: what needs you today, where a job is, how to do something for your role. It answers only from what you are allowed to see, with links.', where: 'The Enyo button (bottom right), or Ctrl + J', href: '/dashboard', needs: [], try: 'What needs my attention today?' },
  { id: 'brief', tag: 'Enyo', title: 'Your daily brief', text: 'Approvals waiting, mail, reminders and what changed in your areas — counted, with links, and a short summary you can listen to.', where: 'Top of the Dashboard', href: '/dashboard', needs: [] },
  { id: 'voice', tag: 'Enyo', title: 'Voice notes to Enyo', text: 'Press the microphone and speak. Pause, carry on, edit the words as text, or send — nothing is sent until you choose.', where: 'The microphone in the Enyo chat', href: '/dashboard', needs: [] },
  { id: 'refine', tag: 'Enyo', title: 'Refine with Enyo on any notes box', text: 'Write roughly, then let Enyo tidy it: clearer, more formal, shorter, or a fuller decision note. You see the new text before it replaces yours.', where: 'The wand button on description, notes and reason boxes', href: '/workshop/job-cards', needs: ['workshop.view'] },
  { id: 'search', tag: 'Everyday', title: 'Search everything at once', text: 'Job Cards, services, customers, vehicles, parts and people — by number, name, phone or plate.', where: 'The search bar at the top, or Ctrl + K', href: '/dashboard', needs: [] },
  { id: 'approvals', tag: 'Everyday', title: 'One place for every decision', text: 'Estimates, closes, parts slips, outside purchases, claims and passes waiting for you — oldest first.', where: 'Approvals', href: '/approvals', needs: [] },
  { id: 'reminders', tag: 'Everyday', title: 'Reminders, also for colleagues who let you', text: 'Set a reminder with a time; it rings the bell and can email you. Enyo can prepare one from a sentence.', where: 'Reminders', href: '/reminders', needs: [], try: 'Remind me tomorrow at 9 to call the customer about JC-2026-000123' },
  { id: 'mail', tag: 'Everyday', title: 'Your work mail with Enyo', text: 'Read and send your work mail inside the portal; Enyo summarises the inbox and drafts replies in your own style (only if you allow it).', where: 'Mail', href: '/mail', needs: [] },
  { id: 'exit-pass', tag: 'Everyday', title: 'Exit passes', text: 'Request a pass to leave the premises; your head of department and the manager approve it, and the gate sees it.', where: 'Security → Request an exit pass', href: '/security/exit-passes/new', needs: ['security.exit_pass.request'] },
  { id: 'help', tag: 'Everyday', title: 'Get help, complaints and HR', text: 'Ask your administrators, Customer care, HR or the platform team, and follow every answer. Enyo answers first when it can.', where: 'Help → Get help', href: '/support/help', needs: [] },
  { id: 'speak-up', tag: 'Everyday', title: 'Speak up', text: 'Report something that looks wrong — money, parts, access — anonymously if you prefer. Reviewers never see alerts about themselves.', where: 'Help → Speak up', href: '/support/speak-up', needs: [] },
  { id: 'job-card', tag: 'Workshop', title: 'Open a Job Card in a minute', text: 'Search the customer, pick the vehicle, list the complaints; the supervisor is told at once. Enyo can pre-fill it from a sentence for you to check.', where: 'Workshop → Job Cards', href: '/workshop/job-cards', needs: ['workshop.job_card.create'], try: 'Prepare a Job Card for the Hilux of Ada Obi: brakes squeal and the AC is weak' },
  { id: 'likely-ready', tag: 'Workshop', title: 'When the vehicle is likely ready', text: 'On each Job Card and service, a range learned from your own past jobs — so the front desk can answer “when?” honestly.', where: 'On the Job Card or Vehicle Service page', href: '/workshop/custody', needs: ['workshop.view'] },
  { id: 'likely-lines', tag: 'Workshop', title: 'Likely estimate lines', text: 'While writing an estimate, the parts and labour similar jobs needed — one click to add each, nothing added by itself.', where: 'The estimate on a Job Card or service', href: '/workshop/custody', needs: ['workshop.estimate.edit', 'workshop.estimate.approve'] },
  { id: 'service-tracker', tag: 'Workshop', title: 'Service tracking after the vehicle leaves', text: 'Next service due for every vehicle by date or mileage, and the reminders sent to customers.', where: 'Workshop → Service Tracker', href: '/workshop/service-tracker', needs: ['workshop.view'] },
  { id: 'custody', tag: 'Workshop', title: 'Vehicles in custody, live', text: 'Every vehicle on site with its stage, waiting time and who has it — Job Cards and services.', where: 'Workshop → Vehicles in custody', href: '/workshop/custody', needs: ['workshop.view'] },
  { id: 'customer-360', tag: 'Workshop', title: 'Customer 360', text: 'A customer’s vehicles, jobs, spend, warranties, support requests and notes on one page.', where: 'Customers', href: '/crm/customers', needs: ['crm.view'] },
  { id: 'analytics', tag: 'Leadership', title: 'Business analytics', text: 'Sales, cost, profit and cash by branch and period, with what changed and why.', where: 'Analytics', href: '/analytics', needs: ['analytics.business.view'], try: 'How is the business doing this month compared with last month?' },
  { id: 'workflows', tag: 'Leadership', title: 'How work flows', text: 'Where approvals wait longest, what gets sent back and why — and a model that learns which requests are likely to be sent back.', where: 'Analytics → How work flows', href: '/analytics/workflows', needs: ['analytics.business.view'] },
  { id: 'integrity', tag: 'Leadership', title: 'Integrity watch', text: 'Unusual or risky activity found every night (same person asking and approving, split purchases, refunds above what was paid) for a reviewer to look at. A flag is a reason to look, never proof.', where: 'Integrity watch', href: '/integrity', needs: ['integrity.review'] },
  { id: 'support', tag: 'Support', title: 'The Support centre', text: 'Every customer and colleague request — email, website, portal, chat hand-overs, complaints — numbered, with a target, an owner and Enyo’s draft.', where: 'Customers → Support centre', href: '/crm/support', needs: ['support.tickets.manage'] },
  { id: 'enyo-replies', tag: 'Support', title: 'Checking Enyo’s replies', text: 'Every answer Enyo sent by itself, to mark good, corrected or wrong — and why Enyo handed requests over, with what to fix.', where: 'Support centre → Enyo’s replies', href: '/crm/support/enyo', needs: ['support.tickets.manage'] },
  { id: 'headquarters', tag: 'Leadership', title: 'Headquarters', text: 'Every branch side by side for a chosen period — money, work, decisions waiting, customers and health — with a spreadsheet export and notices to everyone.', where: 'Headquarters', href: '/headquarters', needs: ['analytics.business.view'] },
  { id: 'news', tag: 'Leadership', title: 'News & media', text: 'Stories, milestones, press releases and events written here go on the public website the moment they are published; drafts stay private, and a live preview shows the page as visitors will see it.', where: 'News & media', href: '/news', needs: ['website.news.manage'], try: 'Draft a short news story about the new assembly line starting production.' },
  { id: 'users', tag: 'IT', title: 'People and access', text: 'Invite staff, switch access off at once, give roles; everyone is emailed their full, current access when it changes.', where: 'Users', href: '/users', needs: ['admin.users.manage'] },
  { id: 'errors', tag: 'IT', title: 'Error log and system health', text: 'Every error reference people were shown, with what happened; scheduled jobs, email delivery and whether the database is on this release’s version.', where: 'Audit logs → Errors, and Settings → System health', href: '/audit-logs/errors', needs: ['audit.view'] },
  { id: 'enyo-learning', tag: 'IT', title: 'What Enyo learns, and how accurate it is', text: 'Answers waiting for approval, prediction accuracy, data quality and the trained models — switched on step by step.', where: 'Enyo → Learning and Models', href: '/enyo/learning', needs: ['enyo.manage'] },
];

const opens = (needs: PermissionKey[], p: Principal) => !needs.length || needs.some((k) => decide(p, k).allowed);

/** The highlights this person has, in the order above. */
export function highlightsFor(p: Principal): Highlight[] {
  return HIGHLIGHTS.filter((h) => opens(h.needs, p));
}

/** The guide's areas, from the page each entry lives on. */
export const AREAS: { prefix: string; title: string }[] = [
  { prefix: '/workshop', title: 'Workshop' },
  { prefix: '/approvals', title: 'Approvals' },
  { prefix: '/inventory', title: 'Store & parts' },
  { prefix: '/warranty', title: 'Warranty' },
  { prefix: '/security', title: 'Security & passes' },
  { prefix: '/schedule', title: 'Calendar' },
  { prefix: '/crm', title: 'Customers & support' },
  { prefix: '/support', title: 'Help' },
  { prefix: '/analytics', title: 'Analytics' },
  { prefix: '/notifications', title: 'Notifications' },
  { prefix: '/reminders', title: 'Reminders & mail' },
  { prefix: '/mail', title: 'Reminders & mail' },
  { prefix: '/settings', title: 'Settings & administration' },
  { prefix: '/users', title: 'Settings & administration' },
  { prefix: '/roles', title: 'Settings & administration' },
  { prefix: '/organisation', title: 'Settings & administration' },
  { prefix: '/enyo', title: 'Enyo (AI)' },
];

export function areaOf(page: string): string {
  return AREAS.find((a) => page === a.prefix || page.startsWith(`${a.prefix}/`) || page.startsWith(`${a.prefix}?`))?.title ?? 'Everyday';
}

export type GuideCard = { id: string; title: string; href: string; area: string; steps: string[]; youCanDoThis: boolean; who?: string; keywords: string[] };

/** Every guide entry whose page the person can open, with whether they do it themselves, grouped by area. */
export function guideFor(p: Principal): { area: string; entries: GuideCard[] }[] {
  const canDo = (e: GuideEntry) => !e.does?.length || e.does.some((k) => decide(p, k).allowed);
  const cards = GUIDE.filter((e) => canOpenGuide(e, p)).map((e) => ({ id: e.id, title: e.title, href: e.page, area: areaOf(e.page), steps: e.steps, youCanDoThis: canDo(e), who: e.who, keywords: e.keywords }));
  const byArea = new Map<string, GuideCard[]>();
  for (const c of cards) byArea.set(c.area, [...(byArea.get(c.area) ?? []), c]);
  return [...byArea.entries()].map(([area, entries]) => ({ area, entries: entries.sort((a, b) => Number(b.youCanDoThis) - Number(a.youCanDoThis)) }));
}
