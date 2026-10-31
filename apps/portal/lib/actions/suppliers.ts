'use server';

/**
 * Suppliers (v-A2): the organisation's list, shared by every branch — brought
 * in from SAP (vendors, LIFNR) through Data Exchange or used by name on goods
 * receipts. Read by the Store; fenced to the person's own organisation.
 */
import { prisma, type Prisma } from '@ejo/database';
import { authorize, getPrincipal, myOrganisationId } from '@/lib/authz/server';
import { requireUser } from '@/lib/actions/workshop';

const PAGE = 50;

async function supplierOrg(): Promise<string> {
  await requireUser();
  const p = await getPrincipal();
  const org = p.organisationId ?? (await myOrganisationId());
  if (!org) throw new Error('Your account is not placed in an organisation yet.');
  return org;
}

export async function listSuppliersPage(search: string | undefined, page: number): Promise<{ rows: { id: string; name: string; externalId: string | null; externalSource: string | null; contactName: string | null; phone: string | null; email: string | null; address: string | null; isActive: boolean; receipts: number; lastReceivedAt: Date | null }[]; total: number; page: number; pages: number }> {
  await authorize('store.view', undefined, 'listSuppliersPage', 'Suppliers are for the Store.');
  const organisationId = await supplierOrg();
  const q = String(search ?? '').trim().slice(0, 80);
  const where: Prisma.SupplierWhereInput = { organisationId, ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { externalId: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] } : {}) };
  const total = await prisma.supplier.count({ where });
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const p = Math.min(Math.max(1, Math.trunc(page) || 1), pages);
  const rows = await prisma.supplier.findMany({
    where, orderBy: [{ name: 'asc' }, { id: 'asc' }], skip: (p - 1) * PAGE, take: PAGE,
    select: { id: true, name: true, externalId: true, externalSource: true, contactName: true, phone: true, email: true, address: true, isActive: true, _count: { select: { receipts: true } }, receipts: { orderBy: { receivedAt: 'desc' }, take: 1, select: { receivedAt: true } } },
  });
  return { total, page: p, pages, rows: rows.map(({ _count, receipts, ...r }) => ({ ...r, receipts: _count.receipts, lastReceivedAt: receipts[0]?.receivedAt ?? null })) };
}

/** Names for the goods-receipt form's supplier field, as the person types (at most 20). */
export async function suggestSupplierNames(search: string): Promise<string[]> {
  await authorize('store.grn.record', undefined, 'suggestSupplierNames');
  const organisationId = await supplierOrg();
  const q = String(search ?? '').trim().slice(0, 80);
  if (q.length < 2) return [];
  const rows = await prisma.supplier.findMany({ where: { organisationId, isActive: true, name: { contains: q, mode: 'insensitive' } }, orderBy: { name: 'asc' }, take: 20, select: { name: true } });
  return rows.map((r) => r.name);
}
