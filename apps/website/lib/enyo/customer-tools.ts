/**
 * Enyo's tools in the customer portal. Every tool reads with the SIGNED-IN
 * customer's id (ctx.customer, resolved from the session by the route) and
 * goes through the same readers as the customer portal pages
 * (lib/customer-portal/data.ts), so Enyo can never show more than the pages:
 * own records only, estimates only once sent and only the customer's lines,
 * no internal notes, costs or staff names. Another customer's number is
 * answered exactly like a number that does not exist.
 */
import { loadContact, loadOwnEstimate, loadServices, loadVehicles, loadWarranties, nextServiceFor, outstanding, type ServiceItem } from '@/lib/customer-portal/data';
import { fmtDate, fmtDateTime, naira, round2 } from '@/lib/customer-portal/format';
import { CLAIM_STATUS, WARRANTY_STATE_INFO } from '@/lib/customer-portal/status';
import { loadCompanyInfo } from './company';
import { openHandover } from './handover';
import { findOwnJob, nextStepFor, NOT_FOUND_MESSAGE, plural } from './rules';
import type { WebCtx, WebTool } from './types';

const SIGNED_OUT = { ok: false as const, refused: true, message: 'The customer is not signed in. Ask them to sign in to the customer portal.' };

const METHOD: Record<string, string> = { BANK_TRANSFER: 'Bank transfer', CASH: 'Cash' };

function money(n: number | null): { amount: number; text: string } | null {
  return n === null ? null : { amount: n, text: naira(n) };
}

/** One job, as the customer may see it. Figures pre-computed here; the model only quotes them. */
function jobSummary(i: ServiceItem) {
  const estimateReady = i.estimateNotifiedAt !== null;
  return {
    number: i.number,
    type: i.kind === 'jc' ? 'Job Card (repair)' : 'Vehicle Service',
    status: i.info.label,
    meaning: i.info.explain,
    nextStep: nextStepFor({ kind: i.kind, status: i.status, awaitingApproval: i.awaitingApproval, waitingForCollection: i.waitingForCollection, balance: i.money.balance, estimateReady }),
    vehicle: i.vehicle.plate ? `${i.vehicle.label} (${i.vehicle.plate})` : i.vehicle.label,
    branch: i.branchName,
    openedOn: fmtDate(i.createdAt),
    lastUpdate: fmtDateTime(i.lastUpdate),
    estimate: estimateReady ? 'Sent to you' : 'Not ready yet',
    estimateTotal: money(i.money.estimateTotal),
    paidSoFar: money(i.money.netPaid),
    stillToPay: estimateReady ? money(outstanding(i)) : null,
    minimumDepositStillNeeded: i.awaitingApproval ? money(i.money.depositDue) : null,
    approveBy: i.approvalDeadline ? fmtDate(i.approvalDeadline) : null,
    collectBy: i.collectBy ? fmtDate(i.collectBy) : null,
    link: i.href,
  };
}

function needCustomer(ctx: WebCtx) {
  return ctx.mode === 'CUSTOMER' && ctx.customer ? ctx.customer : null;
}

const myVehicles: WebTool = {
  name: 'my_vehicles',
  description: 'Lists the signed-in customer\'s own vehicles (make, model, year, plate) and when the next service is due, if known.',
  parameters: { type: 'object', properties: {}, additionalProperties: false },
  kind: 'read',
  status: 'Looking at your vehicles…',
  async run(_args, ctx) {
    const me = needCustomer(ctx);
    if (!me) return SIGNED_OUT;
    const [vehicles, items] = await Promise.all([loadVehicles(me.id), loadServices(me.id)]);
    return {
      ok: true,
      data: {
        count: plural(vehicles.length, 'vehicle'),
        vehicles: vehicles.map((v) => {
          const next = nextServiceFor(v.id, items);
          return {
            vehicle: v.label,
            plate: v.plate,
            mileage: v.mileage,
            nextServiceDue: next ? [next.date ? fmtDate(next.date) : null, next.odometer ? `${next.odometer.toLocaleString('en-NG')} km` : null].filter(Boolean).join(' or ') || null : null,
            link: `/customer-portal/dashboard/vehicles/${v.id}`,
          };
        }),
      },
      sources: [{ label: 'My vehicles', href: '/customer-portal/dashboard/vehicles' }],
    };
  },
};

const myJobs: WebTool = {
  name: 'my_jobs',
  description: 'Lists the signed-in customer\'s own Job Cards and Vehicle Services (newest first) with a friendly status, what happens next, and the money picture when an estimate has been sent. Use active_only to skip finished ones.',
  parameters: { type: 'object', properties: { active_only: { type: 'boolean', description: 'Only jobs still in progress or waiting for collection.' } }, additionalProperties: false },
  kind: 'read',
  status: 'Checking your jobs…',
  async run(args, ctx) {
    const me = needCustomer(ctx);
    if (!me) return SIGNED_OUT;
    const items = await loadServices(me.id);
    const list = args.active_only ? items.filter((i) => i.phase === 'active') : items;
    return {
      ok: true,
      data: { count: plural(list.length, 'job'), jobs: list.slice(0, 15).map(jobSummary), more: list.length > 15 ? `${list.length - 15} older jobs are on the My services page.` : null },
      sources: [{ label: 'My services', href: '/customer-portal/dashboard/services' }],
    };
  },
};

const jobStatus: WebTool = {
  name: 'job_status',
  description: 'The status of ONE of the customer\'s own Job Cards or Vehicle Services by its number (for example JC-2026-000412 or SV-2026-000031): status, what it means, next step, dates and the money picture.',
  parameters: { type: 'object', properties: { number: { type: 'string', description: 'The Job Card or service number, e.g. JC-2026-000412.', maxLength: 40 } }, required: ['number'], additionalProperties: false },
  kind: 'read',
  status: 'Checking that job…',
  async run(args, ctx) {
    const me = needCustomer(ctx);
    if (!me) return SIGNED_OUT;
    const item = findOwnJob(await loadServices(me.id, 500), args.number);
    if (!item) return { ok: false, message: NOT_FOUND_MESSAGE };
    return { ok: true, data: jobSummary(item), sources: [{ label: item.number, href: item.href }] };
  },
};

const myEstimate: WebTool = {
  name: 'my_estimate',
  description: 'The estimate for one of the customer\'s own jobs, line by line, once it has been sent to them. Give the job number; without one, the latest job with an estimate is used.',
  parameters: { type: 'object', properties: { number: { type: 'string', description: 'The Job Card or service number. Optional.', maxLength: 40 } }, additionalProperties: false },
  kind: 'read',
  status: 'Reading your estimate…',
  async run(args, ctx) {
    const me = needCustomer(ctx);
    if (!me) return SIGNED_OUT;
    const items = await loadServices(me.id, 500);
    const item = args.number ? findOwnJob(items, args.number) : items.find((i) => i.estimateNotifiedAt) ?? null;
    if (!item) return { ok: false, message: args.number ? NOT_FOUND_MESSAGE : 'None of this customer\'s jobs has an estimate sent to them yet.' };
    const lines = await loadOwnEstimate(me.id, item);
    if (!lines) return { ok: true, data: { number: item.number, estimate: 'Not ready yet. It appears in the portal and by email as soon as the team sends it.' }, sources: [{ label: item.number, href: item.href }] };
    const total = round2(lines.reduce((s, l) => s + (l.amount ?? 0), 0));
    return {
      ok: true,
      data: {
        number: item.number,
        vehicle: item.vehicle.label,
        lines: lines.slice(0, 40).map((l) => ({ item: l.description, kind: l.type.toLowerCase().replace(/_/g, ' '), quantity: l.quantity, unitPrice: money(l.unitPrice), amount: money(l.amount) })),
        moreLines: lines.length > 40 ? `${lines.length - 40} more lines are on the job page.` : null,
        total: money(total),
        paidSoFar: money(item.money.netPaid),
        stillToPay: money(outstanding(item)),
        minimumDepositStillNeeded: item.awaitingApproval ? money(item.money.depositDue) : null,
        approveBy: item.approvalDeadline ? fmtDate(item.approvalDeadline) : null,
      },
      sources: [{ label: `Estimate for ${item.number}`, href: item.href }],
    };
  },
};

const myPayments: WebTool = {
  name: 'my_payments_and_balance',
  description: 'The customer\'s payments and refunds (newest first), what they have paid in total, and what is still to pay on each job.',
  parameters: { type: 'object', properties: {}, additionalProperties: false },
  kind: 'read',
  status: 'Checking your payments…',
  async run(_args, ctx) {
    const me = needCustomer(ctx);
    if (!me) return SIGNED_OUT;
    const items = await loadServices(me.id, 500);
    const rows = items.flatMap((i) => [
      ...i.payments.map((p) => ({ at: p.recordedAt, kind: 'Payment', amount: p.amount, method: METHOD[p.method] ?? p.method, job: i.number })),
      ...i.refunds.map((r) => ({ at: r.recordedAt, kind: 'Refund', amount: r.amount, method: METHOD[r.method] ?? r.method, job: i.number })),
    ]).sort((a, b) => b.at.getTime() - a.at.getTime());
    const paid = round2(rows.filter((r) => r.kind === 'Payment').reduce((s, r) => s + r.amount, 0));
    const refunded = round2(rows.filter((r) => r.kind === 'Refund').reduce((s, r) => s + r.amount, 0));
    const owing = items.filter((i) => outstanding(i) > 0);
    const totalOwed = round2(owing.reduce((s, i) => s + outstanding(i), 0));
    return {
      ok: true,
      data: {
        paidToDate: money(paid),
        refundedToYou: money(refunded),
        stillToPayInTotal: money(totalOwed),
        balances: owing.map((i) => ({ job: i.number, vehicle: i.vehicle.label, stillToPay: money(outstanding(i)), minimumDepositStillNeeded: i.awaitingApproval ? money(i.money.depositDue) : null, link: i.href })),
        recent: rows.slice(0, 15).map((r) => ({ date: fmtDate(r.at), kind: r.kind, amount: money(r.amount), method: r.method, job: r.job })),
      },
      sources: [{ label: 'Payments & balances', href: '/customer-portal/dashboard/payments' }],
    };
  },
};

const myWarranties: WebTool = {
  name: 'my_warranties',
  description: 'The customer\'s warranties: what is covered, from when to when, whether it is active or expiring, and any claims.',
  parameters: { type: 'object', properties: {}, additionalProperties: false },
  kind: 'read',
  status: 'Checking your warranties…',
  async run(_args, ctx) {
    const me = needCustomer(ctx);
    if (!me) return SIGNED_OUT;
    const ws = await loadWarranties(me.id);
    return {
      ok: true,
      data: {
        count: plural(ws.length, 'warranty', 'warranties'),
        warranties: ws.slice(0, 20).map((w) => ({
          number: w.number,
          covers: w.subject,
          policy: w.policyName,
          state: WARRANTY_STATE_INFO[w.state].label,
          from: fmtDate(w.startsAt),
          until: fmtDate(w.endsAt),
          distanceLimit: w.distanceLimit ? `${w.distanceLimit.toLocaleString('en-NG')} km` : null,
          vehicle: w.vehicle ? w.vehicle.label : null,
          claims: w.claims.map((c) => ({ number: c.number, status: CLAIM_STATUS[c.status]?.label ?? c.status, openedOn: fmtDate(c.createdAt) })),
          link: `/customer-portal/dashboard/warranties/${w.id}`,
        })),
      },
      sources: [{ label: 'Warranties', href: '/customer-portal/dashboard/warranties' }],
    };
  },
};

const howToPay: WebTool = {
  name: 'how_to_pay',
  description: 'How the customer can pay: the bank account of their branch (the branch of their latest visit) and the reference to use, or "call your branch" when no account is set up.',
  parameters: { type: 'object', properties: { number: { type: 'string', description: 'The job being paid for, to use as the payment reference. Optional.', maxLength: 40 } }, additionalProperties: false },
  kind: 'read',
  status: 'Finding the payment details…',
  async run(args, ctx) {
    const me = needCustomer(ctx);
    if (!me) return SIGNED_OUT;
    const [contact, items] = await Promise.all([loadContact(me.id, me.organisationId), args.number ? loadServices(me.id, 500) : Promise.resolve([])]);
    const job = args.number ? findOwnJob(items, args.number) : null;
    if (args.number && !job) return { ok: false, message: NOT_FOUND_MESSAGE };
    const b = contact?.bank;
    const usable = Boolean(b?.bankName && b.accountName && b.accountNumber && /\d{6,}/.test(b.accountNumber));
    const phones = [...new Set([...(contact?.hotlines ?? []), ...(contact?.orgHotlines ?? [])])];
    return {
      ok: true,
      data: {
        branch: contact?.name ?? null,
        bankTransfer: usable ? { bank: b!.bankName, accountName: b!.accountName, accountNumber: b!.accountNumber } : null,
        reference: job ? job.number : 'Your Job Card or service number',
        ifNoBankDetails: usable ? null : 'Please call your branch for the bank details.',
        branchPhones: phones,
        inPerson: 'Or pay in person at the office; the cashier confirms it on the spot.',
        safety: 'Only pay into the account shown in the customer portal or on the estimate.',
      },
      sources: [{ label: 'Payments & balances', href: '/customer-portal/dashboard/payments' }],
    };
  },
};

const companyInfo: WebTool = {
  name: 'organisation_info',
  description: 'The organisation\'s contact details: the customer\'s own branch, other branches with addresses, phone numbers and emails, opening hours if listed, the businesses and services described on the website, and how to book.',
  parameters: { type: 'object', properties: {}, additionalProperties: false },
  kind: 'read',
  status: 'Looking up our contact details…',
  async run(_args, ctx) {
    const me = needCustomer(ctx);
    if (!me) return SIGNED_OUT;
    const [info, contact] = await Promise.all([loadCompanyInfo(ctx.organisationId), loadContact(me.id, me.organisationId)]);
    return {
      ok: true,
      data: { ...info, yourBranch: contact ? { name: contact.name, address: contact.address ?? contact.orgAddress, phones: [...new Set([...contact.hotlines, ...contact.orgHotlines])], email: contact.email ?? contact.orgEmail } : null },
      sources: [{ label: 'Help & support', href: '/customer-portal/dashboard/support' }],
    };
  },
};

const requestHandover: WebTool = {
  name: 'request_handover',
  description: 'Hands the conversation to the customer care team: opens a support request with a summary and the conversation attached, and emails the customer a reference. Use when the customer asks for a person, is unhappy, or you cannot solve it. Confirm with the customer first.',
  parameters: { type: 'object', properties: { topic: { type: 'string', description: 'In a few words, what the customer needs help with.', maxLength: 160 } }, additionalProperties: false },
  kind: 'read',
  status: 'Passing this to our team…',
  async run(args, ctx) {
    const me = needCustomer(ctx);
    if (!me) return SIGNED_OUT;
    const r = await openHandover(ctx, { name: me.fullName, phone: me.phone, email: me.email }, String(args.topic ?? ''));
    const text = r.existing
      ? `Our team already has this conversation as ${r.ticketNumber}. You will see their reply under Help & support.`
      : `I have passed this to our customer care team as ${r.ticketNumber}. They will reply here under Help & support and by email.`;
    ctx.emit({ type: 'handover', ticketNumber: r.ticketNumber, text });
    return { ok: true, data: { ticket: r.ticketNumber, alreadyOpen: r.existing, tellTheCustomer: text, link: '/customer-portal/dashboard/support' }, sources: [{ label: r.ticketNumber, href: '/customer-portal/dashboard/support' }] };
  },
};

export const customerTools: WebTool[] = [myVehicles, myJobs, jobStatus, myEstimate, myPayments, myWarranties, howToPay, companyInfo, requestHandover];
