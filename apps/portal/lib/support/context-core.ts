/**
 * Who is writing to the Support centre, and what is going on for them (pure
 * parts, tested): customer, colleague, or both; whether we may talk about
 * their records; why they cannot sign in; their Job Cards, service visits and
 * warranties in the words the customer portal uses; a colleague's role,
 * recent errors and the how-to guides that fit — each with the link to the
 * exact page.
 *
 * Two audiences, two rules:
 *  - the colleague handling the request sees everything here (it is their
 *    organisation's data, within their Support centre reach);
 *  - Enyo (the model) gets record facts ONLY when the sender is proven (signed
 *    in to the customer portal, a colleague's own help request, or an email
 *    whose sender the receiving server proved with DMARC / SPF+DKIM). For
 *    anyone else it gets general links only, and is told not to confirm
 *    whether an account or record exists. Internal reasons (why access was
 *    switched off, why a colleague was deactivated) never go to the model.
 */

export type SenderKind = 'customer' | 'staff' | 'both' | 'unknown';
export type ProvenHow = 'signed_in' | 'dmarc' | 'own_request' | 'none';

export type Link = { label: string; url: string };

export type PortalAccess = {
  on: boolean;
  hasPassword: boolean;
  lastLoginAt: Date | null;
  /** Failed sign-ins in the last 7 days, and the latest. */
  failedRecently: number;
  lastFailedAt: Date | null;
  resetRequestedAt: Date | null;
  /** Staff only: why and when access was switched off, and by whom. */
  offReason: string | null;
  offAt: Date | null;
  offBy: string | null;
};

export type CustomerFacts = {
  id: string;
  name: string;
  portal: PortalAccess;
  jobs: { id: string; number: string; status: string; vehicle: string; plate: string | null; updatedAt: Date }[];
  services: { id: string; number: string; status: string; vehicle: string; plate: string | null; updatedAt: Date }[];
  warranties: { id: string; number: string; status: string; subject: string; endsAt: Date }[];
  claims: { number: string; status: string; updatedAt: Date }[];
  /** Website errors this customer saw in the last 7 days (reference and page). */
  errors: { ref: string; path: string | null; at: Date }[];
  openRequests: number;
};

export type StaffFacts = {
  id: string;
  name: string;
  active: boolean;
  roles: string[];
  platformTeam: boolean;
  branch: string | null;
  department: string | null;
  lastLoginAt: Date | null;
  failedRecently: number;
  lastFailedAt: Date | null;
  /** Staff-handler only. */
  deactivatedReason: string | null;
  deactivatedAt: Date | null;
  errors: { ref: string; path: string | null; message: string; at: Date }[];
  denied: { page: string; at: Date }[];
  work: string | null;
  guides: { title: string; href: string; steps: string[]; youCanDoThis: boolean }[];
};

export type SenderContext = {
  kind: SenderKind;
  proven: boolean;
  provenHow: ProvenHow;
  customer: CustomerFacts | null;
  staff: StaffFacts | null;
  /** Links for the CUSTOMER (website / customer portal). */
  customerLinks: Link[];
  /** Links for a COLLEAGUE (staff portal). */
  staffLinks: Link[];
  login: LoginDiagnosis | null;
};

export function senderKind(customer: boolean, staff: boolean): SenderKind {
  return customer && staff ? 'both' : customer ? 'customer' : staff ? 'staff' : 'unknown';
}

export const SENDER_KIND_LABEL: Record<SenderKind, string> = {
  customer: 'Registered customer', staff: 'Colleague', both: 'Colleague who is also a customer', unknown: 'Not registered with us',
};

/**
 * May Enyo use this person's records? Only when we know it is them:
 * signed in to the customer portal, a colleague's own help request, or an
 * email proven by the receiving server (DMARC, or SPF + DKIM aligned) from
 * exactly the address on file.
 */
export function provenSender(o: {
  channel: string; authenticatedSender: boolean; verified: boolean; ticketCustomerId: string | null; requesterUserId: string | null;
  contactEmail: string | null; customerEmail: string | null; staffEmail: string | null;
}): ProvenHow {
  if (o.requesterUserId) return 'own_request';
  if (o.channel === 'CUSTOMER_PORTAL' && o.ticketCustomerId) return 'signed_in';
  if (o.channel === 'WEBSITE' && o.verified && o.ticketCustomerId) return 'signed_in';
  const same = (a: string | null, b: string | null) => Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());
  if (o.channel === 'EMAIL' && o.authenticatedSender && (same(o.contactEmail, o.customerEmail) || same(o.contactEmail, o.staffEmail))) return 'dmarc';
  return 'none';
}

// ─────────────────────────────────────────────────────────── sign-in problems

export type LoginCode = 'no_account' | 'access_off' | 'no_password' | 'never_signed_in' | 'locked_out_attempts' | 'deactivated' | 'ok';

export type LoginDiagnosis = {
  code: LoginCode;
  /** For the colleague: the whole story, reasons included. */
  forStaff: string;
  /** For the sender (and Enyo): what is safe to say. */
  forSender: string;
  /** A person must act (switch access on, reactivate). */
  needsPerson: boolean;
};

const ago = (d: Date, now: Date) => {
  const m = Math.round((now.getTime() - d.getTime()) / 60_000);
  if (m < 60) return `${Math.max(1, m)} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
};

/** Why a customer cannot sign in to the customer portal. */
export function customerLoginDiagnosis(c: CustomerFacts | null, now = new Date()): LoginDiagnosis {
  if (!c) {
    return {
      code: 'no_account', needsPerson: true,
      forStaff: 'No customer is registered with this email address. They may have used another address, or they are not registered yet.',
      forSender: 'We could not match this request to a customer portal account from this address. A colleague will check and help you.',
    };
  }
  const p = c.portal;
  if (!p.on) {
    return {
      code: 'access_off', needsPerson: true,
      forStaff: `Their customer portal access is switched OFF${p.offAt ? ` (${ago(p.offAt, now)}${p.offBy ? ` by ${p.offBy}` : ''})` : ''}${p.offReason ? ` — reason given: "${p.offReason}"` : ''}. Only a colleague can switch it back on (CRM → the customer → Portal access).`,
      forSender: 'Your customer portal access is currently paused. A colleague will look into it and get back to you.',
    };
  }
  if (!p.hasPassword) {
    return {
      code: 'no_password', needsPerson: false,
      forStaff: `Access is on, but they have never set a password${p.resetRequestedAt ? ` (they asked for a link ${ago(p.resetRequestedAt, now)})` : ''}. Send a set-password link from the CRM, or they can use "Forgot password".`,
      forSender: 'Your account is ready, but a password has not been set yet. Use "Forgot password" with this email address to set one — the link works for one hour.',
    };
  }
  if (p.failedRecently >= 3) {
    return {
      code: 'locked_out_attempts', needsPerson: false,
      forStaff: `${p.failedRecently} failed sign-ins in the last 7 days${p.lastFailedAt ? ` (latest ${ago(p.lastFailedAt, now)})` : ''}; access is on and a password is set — most likely a forgotten password.`,
      forSender: 'It looks like the password is not being accepted. Use "Forgot password" with this email address to choose a new one — the link works for one hour. Several quick tries in a row can make sign-in wait a minute.',
    };
  }
  if (!p.lastLoginAt) {
    return {
      code: 'never_signed_in', needsPerson: false,
      forStaff: 'Access is on and a password is set, but they have never signed in.',
      forSender: 'Your account is active. Sign in with this email address and your password; if you do not remember the password, use "Forgot password".',
    };
  }
  return {
    code: 'ok', needsPerson: false,
    forStaff: `Access is on, a password is set, last signed in ${ago(p.lastLoginAt, now)}${p.failedRecently ? `; ${p.failedRecently} failed sign-in${p.failedRecently === 1 ? '' : 's'} this week` : ''}.`,
    forSender: 'Your account is active. If signing in fails, use "Forgot password" to choose a new password — the link works for one hour.',
  };
}

/** Why a colleague cannot sign in to the staff portal. */
export function staffLoginDiagnosis(s: StaffFacts, now = new Date()): LoginDiagnosis {
  if (!s.active) {
    return {
      code: 'deactivated', needsPerson: true,
      forStaff: `Their staff account is deactivated${s.deactivatedAt ? ` (${ago(s.deactivatedAt, now)})` : ''}${s.deactivatedReason ? ` — reason: "${s.deactivatedReason}"` : ''}. Only a user administrator can reactivate it (Users).`,
      forSender: 'Your staff account is currently not active. An administrator will look into it and get back to you.',
    };
  }
  if (s.failedRecently >= 3) {
    return {
      code: 'locked_out_attempts', needsPerson: false,
      forStaff: `${s.failedRecently} failed sign-ins in the last 7 days${s.lastFailedAt ? ` (latest ${ago(s.lastFailedAt, now)})` : ''}; the account is active — most likely a forgotten password.`,
      forSender: 'Your account is active; the password is not being accepted. Use "Forgot password" on the sign-in page to choose a new one (the link works for one hour).',
    };
  }
  return {
    code: s.lastLoginAt ? 'ok' : 'never_signed_in', needsPerson: false,
    forStaff: `The account is active${s.lastLoginAt ? `, last signed in ${ago(s.lastLoginAt, now)}` : ', never signed in'}.`,
    forSender: 'Your account is active. If signing in fails, use "Forgot password" on the sign-in page to choose a new password.',
  };
}

// ─────────────────────────────────────────────────────────── words the customer portal uses

const JOB_WORDS: Record<string, [string, string]> = {
  CHECKED_IN: ['Checked in', 'the vehicle is with us and being inspected; the estimate follows'],
  AWAITING_CUSTOMER_APPROVAL: ['Waiting for your approval', 'the estimate is ready; paying the minimum deposit approves the work'],
  IN_PROGRESS: ['Work in progress', 'technicians are working on the vehicle'],
  AWAITING_PARTS: ['Waiting for parts', 'work carries on as soon as the part arrives; nothing is needed from the customer'],
  QUALITY_CHECK: ['Final checks', 'the work is done and being checked before hand-back'],
  COMPLETED: ['Work completed', 'all work is finished; we will say when it is ready to collect'],
  READY_FOR_COLLECTION: ['Ready for collection', 'settle any balance and collect the vehicle'],
  CLOSED: ['Signed off', 'everything is settled; the vehicle can leave'],
  CHECKED_OUT: ['Collected', 'the vehicle has left the workshop'],
  CANCELLED: ['Cancelled', 'this Job Card was cancelled'],
};
const SERVICE_WORDS: Record<string, [string, string]> = {
  SCHEDULED: ['Booked', 'the service is booked'],
  CHECKED_IN: ['Checked in', 'the vehicle is with us and being prepared'],
  IN_SERVICE: ['Being serviced', 'technicians are servicing the vehicle'],
  COMPLETED: ['Service completed', 'we will say when it is ready to collect'],
  READY_FOR_COLLECTION: ['Ready for collection', 'settle any balance and collect the vehicle'],
  CLOSED: ['Signed off', 'everything is settled; the vehicle can leave'],
  COLLECTED: ['Collected', 'the vehicle has left'],
  CANCELLED: ['Cancelled', 'this service was cancelled'],
  ESCALATED: ['Moved to a Job Card', 'the visit continues as a Job Card'],
};
const CLAIM_WORDS: Record<string, string> = {
  DRAFT: 'being prepared', PENDING_HOD: 'being reviewed by us', PENDING_MANAGER: 'being reviewed by us', APPROVED_TO_SUBMIT: 'about to be sent to the provider',
  SUBMITTED: 'with the warranty provider', ACCEPTED: 'accepted by the provider', PARTIALLY_ACCEPTED: 'partly accepted by the provider', REJECTED: 'not accepted by the provider',
  SETTLED: 'settled', CANCELLED: 'cancelled',
};

const title = (s: string) => s.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
export const jobWords = (s: string): [string, string] => JOB_WORDS[s] ?? [title(s), ''];
export const serviceWords = (s: string): [string, string] => SERVICE_WORDS[s] ?? [title(s), ''];
export const claimWords = (s: string): string => CLAIM_WORDS[s] ?? title(s).toLowerCase();

const day = (d: Date) => d.toLocaleDateString('en-GB', { timeZone: 'Africa/Lagos', day: 'numeric', month: 'short', year: 'numeric' });

// ─────────────────────────────────────────────────────────── links

export type CustomerLinkSet = {
  signIn: string; forgotPassword: string; dashboard: string; services: string; payments: string; warranties: string; profile: string; support: string; help: string;
  jobCard: (id: string) => string; service: (id: string) => string; warranty: (id: string) => string;
};

export function linksForCustomer(c: CustomerFacts | null, l: CustomerLinkSet): Link[] {
  const out: Link[] = [
    { label: 'Sign in to the customer portal', url: l.signIn },
    { label: 'Forgot password (set a new one)', url: l.forgotPassword },
    { label: 'Help and contact', url: l.help },
  ];
  if (!c) return out;
  out.push({ label: 'Your dashboard', url: l.dashboard }, { label: 'Your services and repairs', url: l.services }, { label: 'Your payments', url: l.payments }, { label: 'Your warranties', url: l.warranties }, { label: 'Your profile (password, contact details)', url: l.profile }, { label: 'Your support requests', url: l.support });
  for (const j of c.jobs) out.push({ label: `Job Card ${j.number}`, url: l.jobCard(j.id) });
  for (const s of c.services) out.push({ label: `Service ${s.number}`, url: l.service(s.id) });
  for (const w of c.warranties) out.push({ label: `Warranty ${w.number}`, url: l.warranty(w.id) });
  return out;
}

export function linksForStaff(s: StaffFacts | null, portal: string): Link[] {
  const out: Link[] = [
    { label: 'Staff portal sign-in', url: `${portal}/login` },
    { label: 'Forgot password (staff)', url: `${portal}/forgot-password` },
  ];
  if (!s) return out;
  out.push({ label: 'My profile (change my password)', url: `${portal}/profile` }, { label: 'Get help (my requests)', url: `${portal}/support/help` });
  for (const g of s.guides) out.push({ label: `How to: ${g.title}`, url: `${portal}${g.href}` });
  return out;
}

// ─────────────────────────────────────────────────────────── what Enyo is given

/**
 * The sender facts for the model. Proven senders: their records, in the
 * customer portal's words, each with its link. Everyone else: the general
 * links, and a rule not to confirm accounts or records.
 */
export function senderFacts(ctx: SenderContext, now = new Date()): { text: string; links: Link[] } {
  const lines: string[] = [];
  const links: Link[] = [];
  if (!ctx.proven) {
    lines.push('The sender could NOT be confirmed. Do not say whether they have an account or any record with us, and do not discuss any vehicle, job, payment or warranty. You may point them to signing in to the customer portal or to "Forgot password", and say a colleague will help.');
    links.push(...ctx.customerLinks.slice(0, 3));
    return { text: lines.join('\n'), links };
  }
  const isStaffRequest = ctx.provenHow === 'own_request';
  if (ctx.customer && !isStaffRequest) {
    const c = ctx.customer;
    lines.push(`The sender is our registered customer ${c.name} (confirmed: ${ctx.provenHow === 'signed_in' ? 'signed in to the customer portal' : 'their email address was proven'}).`);
    if (ctx.login) lines.push(`Customer portal sign-in: ${ctx.login.forSender}`);
    for (const j of c.jobs) {
      const [label, explain] = jobWords(j.status);
      lines.push(`- Job Card ${j.number} (${j.vehicle}${j.plate ? `, ${j.plate}` : ''}): ${label}${explain ? ` — ${explain}` : ''}; last update ${day(j.updatedAt)}.`);
    }
    for (const s of c.services) {
      const [label, explain] = serviceWords(s.status);
      lines.push(`- Service ${s.number} (${s.vehicle}${s.plate ? `, ${s.plate}` : ''}): ${label}${explain ? ` — ${explain}` : ''}; last update ${day(s.updatedAt)}.`);
    }
    for (const w of c.warranties) lines.push(`- Warranty ${w.number} for ${w.subject}: ${w.endsAt < now ? `ended ${day(w.endsAt)}` : `${w.status === 'ACTIVE' ? 'active' : title(w.status).toLowerCase()} until ${day(w.endsAt)}`}.`);
    for (const cl of c.claims) lines.push(`- Warranty claim ${cl.number}: ${claimWords(cl.status)} (updated ${day(cl.updatedAt)}).`);
    if (!c.jobs.length && !c.services.length) lines.push('- No open or recent Job Cards or services.');
    if (c.errors.length) lines.push(`- They hit an error on the website recently (reference ${c.errors[0]!.ref}${c.errors[0]!.path ? ` on ${c.errors[0]!.path}` : ''}); a colleague can trace it with that reference.`);
    links.push(...ctx.customerLinks);
  }
  if (ctx.staff && ctx.kind !== 'customer') {
    const s = ctx.staff;
    lines.push(`${ctx.kind === 'both' && !isStaffRequest ? 'The sender is also our colleague' : 'This is a colleague asking for help'}: ${s.name}${s.roles.length ? ` (${s.roles.join(', ')})` : ''}${s.branch ? `, ${s.branch}` : ''}${s.department ? ` — ${s.department}` : ''}.`);
    if (ctx.kind === 'both' && !isStaffRequest) lines.push('Answer as a customer if the question is about their own vehicle or account as a customer; as a colleague if it is about their work in the staff portal.');
    if (s.name) {
      lines.push(`Staff portal sign-in: ${staffLoginDiagnosis(s, now).forSender}`);
      // Their errors, refused pages and habits only on their own help request (never from an email).
      if (isStaffRequest && s.work) lines.push(s.work);
      if (isStaffRequest) for (const e of s.errors.slice(0, 3)) lines.push(`- Error they saw: reference ${e.ref}${e.path ? ` on ${e.path}` : ''} (${day(e.at)}): ${e.message.slice(0, 160)}`);
      if (isStaffRequest) for (const d of s.denied.slice(0, 3)) lines.push(`- They were refused a page they have no permission for: ${d.page} (${day(d.at)}). Only an administrator can change permissions.`);
      for (const g of s.guides) lines.push(`- How-to "${g.title}"${g.youCanDoThis ? '' : ' (done by someone else in their team)'}: ${g.steps.slice(0, 6).map((x, i) => `${i + 1}. ${x}`).join(' ')}`);
      links.push(...ctx.staffLinks);
    }
  }
  return { text: lines.join('\n'), links };
}

/** Topics Enyo may answer by itself from a PROVEN sender's own records (still never money, complaints or safety). */
export const RECORD_ANSWERABLE = ['job_status', 'account_access', 'warranty', 'how_to', 'service_booking'];

/**
 * Enyo has what it needs to answer this sender from their own records: they
 * are proven, the topic is one of RECORD_ANSWERABLE, and there is something
 * to answer from (records for a customer; a matching guide for "how to").
 */
export function recordsReadyFor(ctx: SenderContext | null | undefined, topic: string | null): boolean {
  if (!ctx?.proven || !topic || !RECORD_ANSWERABLE.includes(topic)) return false;
  if (topic === 'how_to') return (ctx.staff?.guides.length ?? 0) > 0 && ctx.kind !== 'customer';
  if (topic === 'account_access') return Boolean(ctx.login);
  if (topic === 'warranty') return (ctx.customer?.warranties.length ?? 0) + (ctx.customer?.claims.length ?? 0) > 0;
  return (ctx.customer?.jobs.length ?? 0) + (ctx.customer?.services.length ?? 0) > 0;
}

/** The ticket context kept on Enyo's reply (no message text, no reasons). */
export function contextSnapshot(ctx: SenderContext): Record<string, unknown> {
  return {
    kind: ctx.kind, proven: ctx.proven, how: ctx.provenHow, login: ctx.login?.code ?? null,
    records: ctx.customer ? { jobs: ctx.customer.jobs.map((j) => j.number), services: ctx.customer.services.map((s) => s.number), warranties: ctx.customer.warranties.map((w) => w.number) } : null,
    staff: ctx.staff ? { roles: ctx.staff.roles, errors: ctx.staff.errors.map((e) => e.ref), guides: ctx.staff.guides.map((g) => g.title) } : null,
  };
}

// ─────────────────────────────────────────────────────────── what the colleague sees

export type SenderView = {
  kind: SenderKind;
  kindLabel: string;
  proven: boolean;
  provenLabel: string;
  login: { code: LoginCode; text: string; needsPerson: boolean } | null;
  /** The sender's records: the staff page, and the customer-portal page to send them. */
  records: { key: string; label: string; detail: string; href: string; customerUrl: string | null }[];
  staff: {
    name: string; roles: string[]; where: string; lastSignIn: Date | null; failedRecently: number; active: boolean;
    errors: { ref: string; path: string | null; message: string; at: Date; href: string | null }[];
    denied: { page: string; at: Date }[];
    work: string | null;
    guides: { title: string; href: string }[];
  } | null;
  /** Ready to paste into a reply. */
  customerLinks: Link[];
  staffLinks: Link[];
};

const PROVEN_LABEL: Record<ProvenHow, string> = {
  signed_in: 'Proven — signed in to the customer portal',
  dmarc: 'Proven — their email server proved the address',
  own_request: 'Proven — a colleague’s own request from the portal',
  none: 'Not proven — check who they are before discussing their records or money',
};

export function senderView(ctx: SenderContext, o: { canSeeErrors: boolean; now?: Date }): SenderView {
  const now = o.now ?? new Date();
  const c = ctx.customer;
  const records: SenderView['records'] = [];
  if (c) {
    const byLabel = new Map(ctx.customerLinks.map((l) => [l.label, l.url]));
    for (const j of c.jobs) records.push({ key: `jc-${j.id}`, label: `Job Card ${j.number}`, detail: `${jobWords(j.status)[0]} · ${j.vehicle}${j.plate ? ` (${j.plate})` : ''}`, href: `/workshop/job-cards/${j.id}`, customerUrl: byLabel.get(`Job Card ${j.number}`) ?? null });
    for (const s of c.services) records.push({ key: `vs-${s.id}`, label: `Service ${s.number}`, detail: `${serviceWords(s.status)[0]} · ${s.vehicle}${s.plate ? ` (${s.plate})` : ''}`, href: `/workshop/vehicle-service/${s.id}`, customerUrl: byLabel.get(`Service ${s.number}`) ?? null });
    for (const w of c.warranties) records.push({ key: `w-${w.id}`, label: `Warranty ${w.number}`, detail: `${w.endsAt < now ? 'Ended' : 'Until'} ${day(w.endsAt)} · ${w.subject}`, href: `/warranty/${w.id}`, customerUrl: byLabel.get(`Warranty ${w.number}`) ?? null });
    for (const cl of c.claims) records.push({ key: `wc-${cl.number}`, label: `Claim ${cl.number}`, detail: claimWords(cl.status), href: `/warranty/claims?q=${encodeURIComponent(cl.number)}`, customerUrl: null });
  }
  const s = ctx.staff;
  return {
    kind: ctx.kind,
    kindLabel: SENDER_KIND_LABEL[ctx.kind],
    proven: ctx.proven,
    provenLabel: PROVEN_LABEL[ctx.provenHow],
    login: ctx.login ? { code: ctx.login.code, text: ctx.login.forStaff, needsPerson: ctx.login.needsPerson } : null,
    records,
    staff: s ? {
      name: s.name, roles: s.roles, where: [s.branch, s.department].filter(Boolean).join(' · '), lastSignIn: s.lastLoginAt, failedRecently: s.failedRecently, active: s.active,
      errors: s.errors.map((e) => ({ ...e, href: o.canSeeErrors ? `/audit-logs/errors?ref=${encodeURIComponent(e.ref)}` : null })),
      denied: s.denied, work: s.work, guides: s.guides.map((g) => ({ title: g.title, href: g.href })),
    } : null,
    customerLinks: ctx.customerLinks,
    staffLinks: ctx.staffLinks,
  };
}
