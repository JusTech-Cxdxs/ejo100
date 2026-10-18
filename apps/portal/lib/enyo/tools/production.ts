/**
 * Catalogue and Production for Enyo: what a product is and sells as, how a
 * build order is doing, and the full trace of a serial (build order,
 * components, checks, tester). Read-only; every lookup goes through the
 * modules' own fenced readers (orgWhere / reachWhere) after an allows() check.
 */
import { allows } from '@/lib/authz/server';
import { getProduct, listProducts } from '@/lib/actions/catalogue';
import { getUnit, listBuildOrders, listUnits } from '@/lib/actions/production';
import { nothing, ok, refused, STATUS_WORDS, text, when } from '../tool-helpers';
import type { StaffTool } from '../types';

const CATALOGUE_WHO = 'the Catalogue is open to sales, production, the warehouses, procurement, service and management.';
const PRODUCTION_WHO = 'Production is open to the line, planning, the warehouses, projects and management.';

export const productionTools: StaffTool[] = [
  {
    name: 'product_lookup',
    kind: 'read',
    status: 'Looking up the catalogue…',
    description:
      'Look up products in the catalogue by name or SKU: family, sub-brand, whether it is assembled here or bought finished, headline specification, default warranty, and each configuration with its bill of materials and software packages. Prices are not kept here (they live on the price lists).',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Product name or SKU, e.g. "Prestige Pro2" or "ZNX-PP2".', minLength: 2, maxLength: 80 } },
      required: ['query'],
      additionalProperties: false,
    },
    run: async (args) => {
      if (!(await allows('catalogue.view'))) return refused(CATALOGUE_WHO);
      const products = (await listProducts({ q: text(args.query, 80), includeInactive: true })).slice(0, 5);
      if (!products.length) return nothing('No product in the catalogue matches that.');
      const rows = await Promise.all(products.map(async (p) => {
        const full = await getProduct(p.id);
        return {
          name: p.name, sku: p.sku, family: STATUS_WORDS(p.family), subBrand: p.subBrand, source: STATUS_WORDS(p.source), serialised: p.serialised, warrantyMonths: p.defaultWarrantyMonths,
          active: p.isActive, specs: full?.specs ?? {}, description: full?.description ?? null,
          configurations: (full?.configurations ?? []).map((c) => ({
            code: `${p.sku}-${c.code}`, name: c.name, default: c.isDefault, active: c.isActive, specs: (c.specs ?? {}) as Record<string, string>,
            bom: c.bomLines.map((l) => `${Number(l.quantity)} × ${l.part.name}`), software: c.packages.map((x) => `${x.package.name}${x.package.version ? ` ${x.package.version}` : ''}${x.required ? '' : ' (optional)'}`),
          })),
          href: `/catalogue/products/${p.id}`,
        };
      }));
      return ok({ products: rows, note: 'Prices are on the price lists, not in the catalogue.' }, rows.slice(0, 3).map((r) => ({ label: r.sku, href: r.href })));
    },
  },
  {
    name: 'build_order_status',
    kind: 'read',
    status: 'Checking the build order…',
    description:
      'How a build order is doing: status, configuration and quantity, how many units are started, on the line, released or scrapped, any material shortages noted, who planned it and when it is due. Search by build order number (BLD-…), product or configuration; leave the query empty for the open build orders.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Build order number (BLD-2026-000012), product name or SKU; empty for all open build orders.', maxLength: 80 } },
      additionalProperties: false,
    },
    run: async (args) => {
      if (!(await allows('production.view'))) return refused(PRODUCTION_WHO);
      const q = text(args.query, 80);
      const orders = (await listBuildOrders({ q, status: q ? 'all' : 'open' })).slice(0, 8);
      if (!orders.length) return nothing(q ? 'No build order matches that.' : 'There are no open build orders.');
      const rows = orders.map((o) => ({
        number: o.number, status: STATUS_WORDS(o.status), product: o.configuration.product.name, configuration: o.configuration.name, sku: `${o.configuration.product.sku}-${o.configuration.code}`,
        quantity: o.quantity, unitsStarted: o._count.units, purpose: o.purpose === 'TO_STOCK' ? 'To stock' : 'For an order', priority: o.priority, due: o.dueDate ? when(o.dueDate) : null,
        shortages: o.shortageNote, plannedBy: o.plannedBy.fullName, href: `/production/build-orders/${o.id}`,
      }));
      return ok({ buildOrders: rows }, rows.slice(0, 3).map((r) => ({ label: r.number, href: r.href })));
    },
  },
  {
    name: 'unit_trace',
    kind: 'read',
    status: 'Tracing the serial…',
    description:
      'Trace a unit by its serial number (ZNX…) or traveller number (UNT-…): the build order and configuration, where it is on the line, who assembled, imaged, checked, tested, packed and released it and when, every component fitted (part, serial, lot), every check with its result, rework history, and the finished-goods location once released.',
    parameters: {
      type: 'object',
      properties: { serial: { type: 'string', description: 'The serial number or traveller number.', minLength: 3, maxLength: 60 } },
      required: ['serial'],
      additionalProperties: false,
    },
    run: async (args) => {
      if (!(await allows('production.view'))) return refused(PRODUCTION_WHO);
      const hits = await listUnits({ q: text(args.serial, 60), stage: 'all' });
      if (!hits.length) return nothing('No unit with that serial is visible to this person.');
      const u = await getUnit(hits[0]!.id);
      if (!u) return nothing('No unit with that serial is visible to this person.');
      return ok({
        serial: u.serialNumber, traveller: u.number, stage: STATUS_WORDS(u.stage), product: u.product.name, sku: u.product.sku, configuration: u.configuration?.name ?? null,
        buildOrder: u.buildOrder ? { number: u.buildOrder.number, href: `/production/build-orders/${u.buildOrder.id}` } : null,
        stations: {
          assembled: { by: u.names.assembledBy, at: when(u.assembledAt) }, software: { by: u.names.imagedBy, at: when(u.imagedAt) },
          lineCheck: { by: u.names.lineCheckedBy, at: when(u.lineCheckedAt), passed: u.lineCheckPassed }, qa: { by: u.names.qaBy, at: when(u.qaAt), passed: u.qaPassed, burnInHours: u.burnInHours, notes: u.qaNotes },
          packed: { by: u.names.packedBy, at: when(u.packedAt) }, released: { by: u.names.releasedBy, at: when(u.releasedAt), location: u.finishedUnit?.location.name ?? null },
        },
        components: u.components.map((c) => ({ part: c.part.name, partNumber: c.part.partNumber, serial: c.serialNumber, lot: c.lotNumber, fittedBy: c.fittedByName, at: when(c.fittedAt) })),
        checks: u.checks.map((c) => ({ stage: c.stage, item: c.item, result: c.result, note: c.note, by: c.checkedByName, at: when(c.checkedAt) })),
        rework: { count: u.reworkCount, notes: u.reworkNotes }, scrapReason: u.scrapReason,
        href: `/production/units/${u.id}`,
      }, [{ label: u.serialNumber, href: `/production/units/${u.id}` }]);
    },
  },
];
