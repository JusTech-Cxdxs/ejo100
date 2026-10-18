/**
 * The Warehouses and Procurement for Enyo: stock on hand by product and
 * location, where a serial is, a purchase order's progress and a shipment's
 * ETA. Read-only; every lookup runs with the person's own reach
 * (reachWhere('warehouse.view') / reachWhere('procurement.view')).
 */
import { prisma } from '@ejo/database';
import { allows, reachWhere } from '@/lib/authz/server';
import { ON_HAND_STATUSES, UNIT_STATUS_LABEL, type UnitStatus } from '@/lib/warehouse-core';
import { PO_STATUS_LABEL, SHIPMENT_STATUS_LABEL, receivedVsOrdered, shipmentOverdue, type PurchaseOrderStatus, type ShipmentStatus } from '@/lib/procurement-core';
import { day, money, nothing, ok, refused, text } from '../tool-helpers';
import type { StaffTool } from '../types';

const WAREHOUSE_WHO = 'the warehouses are open to the warehouse teams, dispatch, sales, production, procurement and management.';
const PROCUREMENT_WHO = 'procurement is open to Procurement, planning, the warehouses, Finance and management.';

export const warehouseTools: StaffTool[] = [
  {
    name: 'stock_on_hand',
    kind: 'read',
    status: 'Counting finished units…',
    description:
      'Finished units in stock for a product (by name or SKU) in the warehouses this person can see: units in stock, reserved and picked, broken down by location, with links. Finished goods only — components are the Store\'s part_lookup.',
    parameters: {
      type: 'object',
      properties: { product: { type: 'string', description: 'Product name or SKU, e.g. "Prestige Pro2" or "ZNX-LP-PP2".', minLength: 2, maxLength: 80 } },
      required: ['product'],
      additionalProperties: false,
    },
    run: async (args) => {
      if (!(await allows('warehouse.view'))) return refused(WAREHOUSE_WHO);
      const q = text(args.product, 80);
      const reach = await reachWhere('warehouse.view');
      const products = await prisma.product.findMany({ where: { isActive: true, OR: [{ name: { contains: q, mode: 'insensitive' } }, { sku: { contains: q, mode: 'insensitive' } }], finishedUnits: { some: { location: reach } } }, select: { id: true, name: true, sku: true }, take: 5 });
      if (!products.length) return nothing('No finished product with units in these warehouses matches that.');
      const rows = await Promise.all(products.map(async (p: { id: string; name: string; sku: string }) => {
        const units = await prisma.finishedUnit.findMany({ where: { productId: p.id, location: reach, status: { in: ON_HAND_STATUSES } }, select: { status: true, location: { select: { name: true, branch: { select: { name: true } } } } }, take: 5000 });
        const byLocation = new Map<string, number>();
        let inStock = 0, reserved = 0, picked = 0;
        for (const u of units) {
          if (u.status === 'IN_STOCK') { inStock++; const k = `${u.location.name} (${u.location.branch.name})`; byLocation.set(k, (byLocation.get(k) ?? 0) + 1); }
          else if (u.status === 'RESERVED') reserved++;
          else if (u.status === 'PICKED' || u.status === 'RELEASED') picked++;
        }
        return { product: p.name, sku: p.sku, inStock, reserved, pickedOrReleased: picked, byLocation: [...byLocation.entries()].map(([location, count]) => ({ location, count })), href: `/warehouse/finished-goods?productId=${p.id}` };
      }));
      return ok({ products: rows }, rows.slice(0, 3).map((r) => ({ label: r.product, href: r.href })));
    },
  },
  {
    name: 'serial_locate',
    kind: 'read',
    status: 'Finding that serial…',
    description:
      'Where a finished unit is by its serial number: product, configuration, location and branch, its status (in stock, reserved, picked, dispatched, sold, in quarantine …), the sales order and customer it went to, and a link to the unit.',
    parameters: {
      type: 'object',
      properties: { serial: { type: 'string', description: 'The serial number on the label, e.g. ZNX26LP0000123.', minLength: 3, maxLength: 64 } },
      required: ['serial'],
      additionalProperties: false,
    },
    run: async (args) => {
      if (!(await allows('warehouse.view'))) return refused(WAREHOUSE_WHO);
      const serial = text(args.serial, 64);
      const reach = await reachWhere('warehouse.view');
      const u = await prisma.finishedUnit.findFirst({
        where: { serialNumber: { equals: serial, mode: 'insensitive' }, location: reach },
        select: { id: true, serialNumber: true, status: true, soldAt: true, receivedAt: true, product: { select: { name: true, sku: true } }, configuration: { select: { name: true } }, location: { select: { name: true, kind: true, branch: { select: { name: true } } } }, salesOrder: { select: { number: true, status: true } }, customer: { select: { fullName: true } }, dispatch: { select: { number: true, status: true } } },
      });
      if (!u) return nothing('No finished unit with that serial in the warehouses this person can see.');
      return ok({
        serial: u.serialNumber, product: u.product.name, sku: u.product.sku, configuration: u.configuration?.name ?? 'Standard',
        status: UNIT_STATUS_LABEL[u.status as UnitStatus], location: u.location.name, locationKind: u.location.kind.toLowerCase(), branch: u.location.branch.name,
        receivedIntoStock: day(u.receivedAt), soldOn: day(u.soldAt), salesOrder: u.salesOrder?.number ?? null, customer: u.customer?.fullName ?? null, dispatch: u.dispatch?.number ?? null,
        href: `/warehouse/finished-goods/${u.id}`,
      }, [{ label: u.serialNumber, href: `/warehouse/finished-goods/${u.id}` }]);
    },
  },
  {
    name: 'purchase_order_status',
    kind: 'read',
    status: 'Checking the purchase order…',
    description:
      'A purchase order by number (PO-2026-000012) or the newest open orders for a supplier: status, supplier, total and currency, expected date, how much has been received against what was ordered, its shipments, with links.',
    parameters: {
      type: 'object',
      properties: { reference: { type: 'string', description: 'The purchase order number, or a supplier name for their open orders.', minLength: 2, maxLength: 80 } },
      required: ['reference'],
      additionalProperties: false,
    },
    run: async (args) => {
      if (!(await allows('procurement.view'))) return refused(PROCUREMENT_WHO);
      const q = text(args.reference, 80);
      const reach = await reachWhere('procurement.view');
      const orders = await prisma.purchaseOrder.findMany({
        where: { ...reach, OR: [{ number: { contains: q, mode: 'insensitive' } }, { supplier: { name: { contains: q, mode: 'insensitive' } }, status: { notIn: ['CLOSED', 'CANCELLED'] } }] },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, number: true, status: true, currency: true, total: true, expectedDate: true, sentAt: true, supplier: { select: { name: true } }, lines: { select: { quantity: true, receivedQuantity: true } }, shipments: { select: { number: true, status: true, eta: true }, orderBy: { createdAt: 'desc' }, take: 3 } },
      });
      if (!orders.length) return nothing('No purchase order matches that in what this person can see.');
      const rows = orders.map((o: (typeof orders)[number]) => {
        const p = receivedVsOrdered(o.lines.map((l: { quantity: unknown; receivedQuantity: unknown }) => ({ quantity: Number(l.quantity), receivedQuantity: Number(l.receivedQuantity) })));
        return { number: o.number, supplier: o.supplier.name, status: PO_STATUS_LABEL[o.status as PurchaseOrderStatus], total: money(o.total), currency: o.currency, expected: day(o.expectedDate), sent: day(o.sentAt), ordered: p.ordered, received: p.received, outstanding: p.outstanding, shipments: o.shipments.map((s: { number: string; status: string; eta: Date | null }) => ({ number: s.number, status: SHIPMENT_STATUS_LABEL[s.status as ShipmentStatus], eta: day(s.eta) })), href: `/procurement/orders/${o.id}` };
      });
      return ok({ orders: rows }, rows.slice(0, 3).map((r) => ({ label: r.number, href: r.href })));
    },
  },
  {
    name: 'shipment_eta',
    kind: 'read',
    status: 'Checking shipments…',
    description:
      'Shipments on the way (or one by number, SHP-2026-000003): the purchase order and supplier, mode, carrier and reference, where it is (booked, in transit, at port, customs, cleared, delivered), ETD and ETA, whether it is overdue, with links.',
    parameters: {
      type: 'object',
      properties: { reference: { type: 'string', description: 'A shipment or purchase order number, or a supplier name. Leave empty for everything on the way.', maxLength: 80 } },
      additionalProperties: false,
    },
    run: async (args) => {
      if (!(await allows('procurement.view'))) return refused(PROCUREMENT_WHO);
      const q = text(args.reference, 80);
      const reach = await reachWhere('procurement.view');
      const shipments = await prisma.shipment.findMany({
        where: {
          purchaseOrder: reach,
          ...(q ? { OR: [{ number: { contains: q, mode: 'insensitive' } }, { purchaseOrder: { number: { contains: q, mode: 'insensitive' } } }, { purchaseOrder: { supplier: { name: { contains: q, mode: 'insensitive' } } } }] } : { status: { not: 'DELIVERED' } }),
        },
        orderBy: [{ eta: 'asc' }, { createdAt: 'desc' }],
        take: 8,
        select: { id: true, number: true, status: true, mode: true, carrier: true, reference: true, etd: true, eta: true, arrivedAt: true, clearedAt: true, dutyPaid: true, purchaseOrder: { select: { number: true, supplier: { select: { name: true } } } } },
      });
      if (!shipments.length) return nothing(q ? 'No shipment matches that in what this person can see.' : 'Nothing is on the way right now.');
      const rows = shipments.map((s: (typeof shipments)[number]) => ({
        number: s.number, purchaseOrder: s.purchaseOrder.number, supplier: s.purchaseOrder.supplier.name, mode: s.mode.toLowerCase(), carrier: s.carrier, reference: s.reference,
        where: SHIPMENT_STATUS_LABEL[s.status as ShipmentStatus], etd: day(s.etd), eta: day(s.eta), arrivedAtPort: day(s.arrivedAt), cleared: day(s.clearedAt), dutyPaid: s.dutyPaid === null ? null : money(s.dutyPaid),
        overdue: shipmentOverdue({ status: s.status as ShipmentStatus, eta: s.eta }), href: `/procurement/shipments/${s.id}`,
      }));
      return ok({ shipments: rows, overdue: rows.filter((r) => r.overdue).length }, rows.slice(0, 3).map((r) => ({ label: r.number, href: r.href })));
    },
  },
];
