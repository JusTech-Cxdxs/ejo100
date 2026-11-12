/**
 * A4c1 — the copy of one customer's data, read from the live records (server
 * only). Each section is a table EJO keeps about them, found from the customer
 * inside their organisation: their own details, addresses, contacts, company,
 * vehicles; their job cards and services with complaints, estimates,
 * inspections, payments and refunds; warranties and claims; reminders sent and
 * gate exits of their vehicles; support requests and replies; their chats
 * with Enyo; portal sign-ins and accounts; notes kept about them; history from
 * the old system. Nothing about the staff who handled them, no secrets.
 */
import type { PrismaClient } from '@ejo/database';
import { forCopy } from './requests';
import type { Section } from './pack';

/** A section larger than this is too large for one copy: the request is answered with support's help. */
export const SECTION_MAX = 100_000;

type Row = Record<string, unknown>;
type Finder = (args: { where: Row; take: number; orderBy?: Row }) => Promise<Row[]>;
// Each model's own findMany, called with plain where/take/orderBy (checked above by name; the rows are read generically).

export class PackTooLarge extends Error {}

export async function collectPack(db: PrismaClient, organisationId: string, customerId: string): Promise<{ customerName: string; organisation: string; sections: Section[] } | null> {
  const customer = await db.customer.findFirst({ where: { id: customerId, organisationId } });
  if (!customer) return null;
  const org = await db.organisation.findUnique({ where: { id: organisationId }, select: { name: true } });
  const branches = new Map((await db.branch.findMany({ where: { businessUnit: { organisationId } }, select: { id: true, name: true } })).map((b) => [b.id, b.name]));
  const sections: Section[] = [];
  const take = SECTION_MAX + 1;
  const read = async (file: string, title: string, model: { findMany: unknown }, where: Row, order: string | null = 'createdAt'): Promise<Row[]> => {
    const rows = await (model.findMany as Finder)({ where, take, ...(order ? { orderBy: { [order]: 'asc' } } : {}) });
    if (rows.length > SECTION_MAX) throw new PackTooLarge(`${title}: more than ${SECTION_MAX.toLocaleString('en-NG')} records.`);
    sections.push({ file, title, rows: rows.map((r) => forCopy(r, branches)) });
    return rows;
  };
  const ids = (rows: Row[]) => rows.map((r) => String(r.id));

  sections.push({ file: 'customer.csv', title: 'Your details', rows: [forCopy(customer as unknown as Row, branches)] });
  await read('addresses.csv', 'Addresses', db.customerAddress, { customerId });
  await read('contacts.csv', 'Contact people', db.customerContact, { customerId });
  await read('company.csv', 'Company details', db.customerCompany, { customerId }, null);
  const vehicles = ids(await read('vehicles.csv', 'Vehicles', db.customerVehicle, { customerId }));

  const jobs = ids(await read('job-cards.csv', 'Job cards (workshop visits)', db.jobCard, { customerId }));
  await read('job-card-complaints.csv', 'What you reported on each job card', db.jobCardComplaint, { jobCardId: { in: jobs } });
  await read('estimates.csv', 'Estimates for job cards', db.estimate, { jobCardId: { in: jobs } });
  const services = ids(await read('vehicle-services.csv', 'Vehicle services', db.vehicleService, { customerId }));
  await read('vehicle-service-complaints.csv', 'What you reported on each service', db.vehicleServiceComplaint, { vehicleServiceId: { in: services } });
  await read('service-estimates.csv', 'Estimates for services', db.serviceEstimate, { vehicleServiceId: { in: services } });
  await read('vehicle-inspections.csv', 'Vehicle inspections', db.vehicleInspection, { vehicleServiceId: { in: services } });
  const ofJobs = { OR: [{ jobCardId: { in: jobs } }, { vehicleServiceId: { in: services } }] };
  await read('payments.csv', 'Payments', db.payment, ofJobs);
  await read('refunds.csv', 'Refunds', db.refund, ofJobs);

  await read('warranties.csv', 'Warranties', db.warranty, { customerId });
  await read('warranty-claims.csv', 'Warranty claims', db.warrantyClaim, { customerId });
  await read('service-reminders.csv', 'Service reminders sent about your vehicles', db.serviceReminderLog, { vehicleId: { in: vehicles } }, 'sentAt');
  await read('gate-exits.csv', 'Your vehicles leaving our premises', db.vehicleGateExit, { vehicleId: { in: vehicles } });

  const tickets = ids(await read('support-requests.csv', 'Support requests', db.supportTicket, { customerId, organisationId }));
  await read('support-replies.csv', 'Replies on your support requests', db.supportReply, { ticketId: { in: tickets } });
  const chats = ids(await read('enyo-conversations.csv', 'Conversations with Enyo (our assistant)', db.enyoConversation, { customerId, organisationId }));
  await read('enyo-messages.csv', 'Messages in those conversations', db.enyoMessage, { conversationId: { in: chats } });
  await read('portal-sign-ins.csv', 'Sign-ins to the customer portal', db.customerSession, { customerId });
  await read('portal-accounts.csv', 'How you sign in to the customer portal', db.customerAccount, { customerId });
  await read('notes.csv', 'Notes kept about you', db.customerNote, { customerId });
  await read('history-jobs.csv', 'Workshop history from our previous system', db.historicalJob, { customerId, organisationId });
  await read('history-invoices.csv', 'Invoices from our previous system', db.historicalInvoice, { customerId, organisationId });

  return { customerName: customer.fullName, organisation: org?.name ?? 'Our organisation', sections };
}
