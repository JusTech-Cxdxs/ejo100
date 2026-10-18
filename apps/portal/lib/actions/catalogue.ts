'use server';

/**
 * The Catalogue: products, their sellable configurations with a bill of
 * materials and software packages, software packages, and the checklist
 * templates the line and QA work from. Everything is organisation-owned
 * (orgWhere); changes need catalogue.manage and are audited.
 */
import { prisma, type CheckStage, type Prisma, type ProductFamily, type ProductSource, type SoftwareKind, type SubBrand } from '@ejo/database';
import { requireUser } from '@/lib/actions/workshop';
import { authorize, myOrganisationId, orgOwned, orgWhere, partsOfMyOrganisation } from '@/lib/authz/server';
import { writeAuditLog } from '@/lib/workshop-core';
import { actorLabel } from '@/lib/assist/rules';
import {
  bomCostRollUp, configurationCodeProblem, FAMILIES, isValidSku, normaliseSku, parseSpecLines, skuProblem, STATIONS, type ProductFamilyCode, type Station,
} from '@/lib/catalogue-core';

export class CatalogueActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CatalogueActionError';
  }
}

const fail = (m: string): never => { throw new CatalogueActionError(m); };

async function audit(userId: string, action: string, entityType: string, entityId: string, metadata: Record<string, unknown>) {
  await writeAuditLog({ userId, action, entityType, entityId, metadata });
}

async function organisationIdOrFail(): Promise<string> {
  const org = await myOrganisationId();
  if (!org) fail('Your account is not placed in an organisation yet — ask an administrator.');
  return org!;
}

// ── Products ───────────────────────────────────────────────────────────────

export type ProductInput = {
  sku: string; name: string; family: string; subBrand: string; source: string; description?: string; baseUnitOfMeasure?: string;
  serialised: boolean; defaultWarrantyMonths: number; warrantyPolicyId?: string | null; specsText?: string; imageUrl?: string | null;
};

function validateProduct(input: ProductInput) {
  const sku = normaliseSku(input.sku);
  const skuIssue = skuProblem(sku);
  if (skuIssue) fail(skuIssue);
  const name = input.name.trim();
  if (name.length < 2) fail('Enter the product name.');
  if (!FAMILIES.includes(input.family as ProductFamilyCode)) fail('Choose the product family.');
  if (!['ZINOX', 'IPOWER', 'ITEC'].includes(input.subBrand)) fail('Choose the sub-brand.');
  if (!['ASSEMBLED', 'FINISHED_IMPORT', 'KIT'].includes(input.source)) fail('Say whether the product is assembled here or bought finished.');
  if (!Number.isInteger(input.defaultWarrantyMonths) || input.defaultWarrantyMonths < 0 || input.defaultWarrantyMonths > 120) fail('The default warranty is 0 to 120 months.');
  return {
    sku, name: name.slice(0, 120), family: input.family as ProductFamily, subBrand: input.subBrand as SubBrand, source: input.source as ProductSource,
    description: input.description?.trim().slice(0, 2000) || null, baseUnitOfMeasure: (input.baseUnitOfMeasure?.trim() || 'Each').slice(0, 30),
    serialised: input.serialised, defaultWarrantyMonths: input.defaultWarrantyMonths,
    specs: input.specsText?.trim() ? (parseSpecLines(input.specsText) as Prisma.InputJsonValue) : undefined,
    imageUrl: input.imageUrl?.trim() || null,
  };
}

/** A warranty policy of this organisation (or none), for the product's default policy. */
async function policyOrNull(id: string | null | undefined): Promise<string | null> {
  if (!id) return null;
  const p = await prisma.warrantyPolicy.findFirst({ where: { id, isActive: true, ...(await orgOwned()) }, select: { id: true } });
  if (!p) fail('That warranty policy is not available.');
  return p!.id;
}

export async function createProduct(input: ProductInput): Promise<{ id: string }> {
  await authorize('catalogue.manage', undefined, 'createProduct', 'Only the Catalogue team can add products.');
  const user = await requireUser();
  const organisationId = await organisationIdOrFail();
  const data = validateProduct(input);
  if (await prisma.product.findFirst({ where: { organisationId, sku: data.sku }, select: { id: true } })) fail(`SKU ${data.sku} is already in the catalogue.`);
  const warrantyPolicyId = await policyOrNull(input.warrantyPolicyId);
  const created = await prisma.product.create({ data: { ...data, specs: data.specs ?? undefined, organisationId, warrantyPolicyId, createdById: user.id }, select: { id: true } });
  await audit(user.id, 'product.created', 'Product', created.id, { referenceNumber: data.sku, name: data.name, family: data.family });
  return created;
}

export async function updateProduct(productId: string, input: ProductInput): Promise<void> {
  await authorize('catalogue.manage', undefined, 'updateProduct', 'Only the Catalogue team can change products.');
  const user = await requireUser();
  const existing = await prisma.product.findFirst({ where: { id: productId, ...(await orgWhere()) } });
  if (!existing) fail('This product is not available.');
  const data = validateProduct(input);
  if (data.sku !== existing!.sku && (await prisma.product.findFirst({ where: { organisationId: existing!.organisationId, sku: data.sku }, select: { id: true } }))) fail(`SKU ${data.sku} is already in the catalogue.`);
  const warrantyPolicyId = await policyOrNull(input.warrantyPolicyId);
  await prisma.product.update({ where: { id: existing!.id }, data: { ...data, specs: data.specs ?? (input.specsText !== undefined ? ({} as Prisma.InputJsonValue) : undefined), warrantyPolicyId } });
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of ['sku', 'name', 'family', 'subBrand', 'source', 'serialised', 'defaultWarrantyMonths'] as const) if (existing![k] !== data[k]) changes[k] = { from: existing![k], to: data[k] };
  if ((existing!.warrantyPolicyId ?? null) !== warrantyPolicyId) changes.warrantyPolicyId = { from: existing!.warrantyPolicyId, to: warrantyPolicyId };
  await audit(user.id, 'product.updated', 'Product', existing!.id, { referenceNumber: data.sku, changes });
}

export async function setProductActive(productId: string, active: boolean): Promise<void> {
  await authorize('catalogue.manage', undefined, 'setProductActive', 'Only the Catalogue team can archive products.');
  const user = await requireUser();
  const p = await prisma.product.findFirst({ where: { id: productId, ...(await orgWhere()) }, select: { id: true, sku: true, isActive: true } });
  if (!p) fail('This product is not available.');
  if (p!.isActive === active) return;
  await prisma.product.update({ where: { id: p!.id }, data: { isActive: active } });
  await audit(user.id, active ? 'product.restored' : 'product.archived', 'Product', p!.id, { referenceNumber: p!.sku });
}

export type ProductListFilter = { q?: string; family?: string; subBrand?: string; includeInactive?: boolean };

export async function listProducts(filter: ProductListFilter = {}) {
  await requireUser();
  const q = filter.q?.trim().slice(0, 60);
  return prisma.product.findMany({
    where: {
      ...(await orgWhere()),
      ...(filter.includeInactive ? {} : { isActive: true }),
      ...(filter.family && FAMILIES.includes(filter.family as ProductFamilyCode) ? { family: filter.family as ProductFamily } : {}),
      ...(filter.subBrand && ['ZINOX', 'IPOWER', 'ITEC'].includes(filter.subBrand) ? { subBrand: filter.subBrand as SubBrand } : {}),
      ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { sku: { contains: q, mode: 'insensitive' } }, { description: { contains: q, mode: 'insensitive' } }] } : {}),
    },
    orderBy: [{ family: 'asc' }, { name: 'asc' }],
    take: 300,
    select: {
      id: true, sku: true, name: true, family: true, subBrand: true, source: true, serialised: true, defaultWarrantyMonths: true, isActive: true, updatedAt: true,
      _count: { select: { configurations: true } },
    },
  });
}

/** Counts per family and sub-brand for the Catalogue home. */
export async function getCatalogueSummary() {
  await requireUser();
  const where = { ...(await orgWhere()), isActive: true };
  const [byFamily, configurations, software, checks, assembled] = await Promise.all([
    prisma.product.groupBy({ by: ['family'], where, _count: { _all: true } }),
    prisma.productConfiguration.count({ where: { isActive: true, product: where } }),
    prisma.softwarePackage.count({ where: { ...(await orgWhere()), isActive: true } }),
    prisma.checkTemplate.count({ where: { ...(await orgWhere()), isActive: true } }),
    prisma.product.count({ where: { ...where, source: 'ASSEMBLED' } }),
  ]);
  const families: Partial<Record<ProductFamilyCode, number>> = {};
  for (const r of byFamily) families[r.family as ProductFamilyCode] = r._count._all;
  const products = byFamily.reduce((n: number, r: { _count: { _all: number } }) => n + r._count._all, 0);
  return { products, assembled, configurations, software, checks, families };
}

export async function getProduct(productId: string) {
  await requireUser();
  const p = await prisma.product.findFirst({
    where: { id: productId, ...(await orgWhere()) },
    include: {
      createdBy: { select: { fullName: true } },
      warrantyPolicy: { select: { id: true, code: true, name: true, durationMonths: true, durationUnit: true } },
      configurations: {
        orderBy: [{ isDefault: 'desc' }, { code: 'asc' }],
        include: {
          bomLines: { include: { part: { select: { id: true, name: true, partNumber: true, baseUnitOfMeasure: true } } }, orderBy: { part: { name: 'asc' } } },
          packages: { include: { package: { select: { id: true, name: true, version: true, kind: true } } } },
          _count: { select: { buildOrders: true, finishedUnits: true } },
        },
      },
    },
  });
  if (!p) return null;
  return { ...p, specs: (p.specs ?? {}) as Record<string, string> };
}

/** Product history, as visible as the product itself. */
export async function getProductAuditTrail(productId: string) {
  await requireUser();
  const visibleId = (await prisma.product.findFirst({ where: { id: productId, ...(await orgWhere()) }, select: { id: true } }))?.id ?? '__no_access__';
  const configIds = visibleId === '__no_access__' ? [] : (await prisma.productConfiguration.findMany({ where: { productId: visibleId }, select: { id: true } })).map((c: { id: string }) => c.id);
  const entries = await prisma.auditLog.findMany({
    where: { OR: [{ entityType: 'Product', entityId: visibleId }, { entityType: 'ProductConfiguration', entityId: { in: configIds } }] },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 60,
    select: { id: true, action: true, createdAt: true, metadata: true, userId: true },
  });
  const ids = [...new Set(entries.map((e: { userId: string | null }) => e.userId).filter((x: string | null): x is string => Boolean(x)))];
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } }) : [];
  const name = new Map(users.map((u: { id: string; fullName: string }) => [u.id, u.fullName]));
  return entries.map((e: (typeof entries)[number]) => ({ ...e, userName: e.userId ? actorLabel(name.get(e.userId) ?? null, e.metadata) : null }));
}

/** Products for a SearchableSelect (by name or SKU). */
export async function searchProductsForSelect(query: string): Promise<{ value: string; label: string; sublabel?: string }[]> {
  const rows = await listProducts({ q: query });
  return rows.slice(0, 20).map((p: (typeof rows)[number]) => ({ value: p.id, label: p.name, sublabel: p.sku }));
}

/** Active configurations for a SearchableSelect (the build-order form): "Product — configuration (SKU-CODE)". */
export async function searchConfigurationsForSelect(query: string): Promise<{ value: string; label: string; sublabel?: string }[]> {
  await requireUser();
  const q = query.trim().slice(0, 60);
  const rows = await prisma.productConfiguration.findMany({
    where: {
      isActive: true,
      product: { ...(await orgWhere()), isActive: true },
      ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { code: { contains: q, mode: 'insensitive' } }, { product: { name: { contains: q, mode: 'insensitive' } } }, { product: { sku: { contains: q, mode: 'insensitive' } } }] } : {}),
    },
    orderBy: [{ product: { name: 'asc' } }, { code: 'asc' }],
    take: 20,
    select: { id: true, name: true, code: true, product: { select: { name: true, sku: true } } },
  });
  return rows.map((c: (typeof rows)[number]) => ({ value: c.id, label: `${c.product.name} — ${c.name}`, sublabel: `${c.product.sku}-${c.code}` }));
}

/** Active warranty policies of the organisation, for the product form. */
export async function listWarrantyPolicyOptions(): Promise<{ value: string; label: string }[]> {
  await requireUser();
  const rows = await prisma.warrantyPolicy.findMany({ where: { isActive: true, ...(await orgOwned()) }, orderBy: { name: 'asc' }, take: 200, select: { id: true, code: true, name: true } });
  return rows.map((p: (typeof rows)[number]) => ({ value: p.id, label: `${p.code} — ${p.name}` }));
}

// ── Configurations ─────────────────────────────────────────────────────────

export type ConfigurationInput = { code: string; name: string; specsText?: string; isDefault?: boolean };

function validateConfiguration(input: ConfigurationInput) {
  const code = normaliseSku(input.code);
  const issue = configurationCodeProblem(code);
  if (issue) fail(issue);
  const name = input.name.trim();
  if (name.length < 2) fail('Enter the configuration name (e.g. 16 GB / 512 GB, Windows 11 Pro).');
  return { code, name: name.slice(0, 120), specs: input.specsText?.trim() ? (parseSpecLines(input.specsText) as Prisma.InputJsonValue) : undefined, isDefault: Boolean(input.isDefault) };
}

export async function createConfiguration(productId: string, input: ConfigurationInput): Promise<{ id: string }> {
  await authorize('catalogue.manage', undefined, 'createConfiguration', 'Only the Catalogue team can add configurations.');
  const user = await requireUser();
  const product = await prisma.product.findFirst({ where: { id: productId, ...(await orgWhere()) }, select: { id: true, sku: true } });
  if (!product) fail('This product is not available.');
  const data = validateConfiguration(input);
  if (await prisma.productConfiguration.findFirst({ where: { productId: product!.id, code: data.code }, select: { id: true } })) fail(`Configuration code ${data.code} already exists on this product.`);
  const created = await prisma.$transaction(async (tx) => {
    if (data.isDefault) await tx.productConfiguration.updateMany({ where: { productId: product!.id, isDefault: true }, data: { isDefault: false } });
    return tx.productConfiguration.create({ data: { ...data, productId: product!.id }, select: { id: true } });
  });
  await audit(user.id, 'product_configuration.created', 'ProductConfiguration', created.id, { referenceNumber: `${product!.sku}-${data.code}`, productId: product!.id, name: data.name });
  return created;
}

export async function updateConfiguration(configurationId: string, input: ConfigurationInput & { isActive?: boolean }): Promise<void> {
  await authorize('catalogue.manage', undefined, 'updateConfiguration', 'Only the Catalogue team can change configurations.');
  const user = await requireUser();
  const c = await prisma.productConfiguration.findFirst({ where: { id: configurationId, product: await orgWhere() }, include: { product: { select: { id: true, sku: true } } } });
  if (!c) fail('This configuration is not available.');
  const data = validateConfiguration(input);
  if (data.code !== c!.code && (await prisma.productConfiguration.findFirst({ where: { productId: c!.productId, code: data.code }, select: { id: true } }))) fail(`Configuration code ${data.code} already exists on this product.`);
  await prisma.$transaction(async (tx) => {
    if (data.isDefault) await tx.productConfiguration.updateMany({ where: { productId: c!.productId, isDefault: true, NOT: { id: c!.id } }, data: { isDefault: false } });
    await tx.productConfiguration.update({ where: { id: c!.id }, data: { ...data, specs: data.specs ?? (input.specsText !== undefined ? ({} as Prisma.InputJsonValue) : undefined), ...(input.isActive === undefined ? {} : { isActive: input.isActive }) } });
  });
  await audit(user.id, 'product_configuration.updated', 'ProductConfiguration', c!.id, { referenceNumber: `${c!.product.sku}-${data.code}`, productId: c!.product.id, changes: { code: { from: c!.code, to: data.code }, name: { from: c!.name, to: data.name } } });
}

export async function getConfiguration(configurationId: string) {
  await requireUser();
  const c = await prisma.productConfiguration.findFirst({
    where: { id: configurationId, product: await orgWhere() },
    include: {
      product: { select: { id: true, sku: true, name: true, family: true, subBrand: true, source: true, isActive: true } },
      bomLines: { include: { part: { select: { id: true, name: true, partNumber: true, baseUnitOfMeasure: true, trackingType: true, stock: { select: { quantityOnHand: true, quantityReserved: true } } } } }, orderBy: [{ station: 'asc' }, { part: { name: 'asc' } }] },
      packages: { include: { package: { select: { id: true, name: true, version: true, kind: true, licenceRequired: true } } }, orderBy: { package: { name: 'asc' } } },
      _count: { select: { buildOrders: true, productionUnits: true, finishedUnits: true } },
    },
  });
  if (!c) return null;
  // Latest goods-receipt cost per part (the newest delivery with a cost), else unknown.
  const partIds = c.bomLines.map((l: { partId: string }) => l.partId);
  const costLines = partIds.length
    ? await prisma.goodsReceiptLine.findMany({ where: { partId: { in: partIds }, unitCost: { not: null } }, orderBy: { goodsReceipt: { receivedAt: 'desc' } }, select: { partId: true, unitCost: true } })
    : [];
  const latestCost = new Map<string, number>();
  for (const l of costLines) if (!latestCost.has(l.partId)) latestCost.set(l.partId, Number(l.unitCost));
  const lines = c.bomLines.map((l: (typeof c.bomLines)[number]) => {
    const unitCost = latestCost.get(l.partId) ?? null;
    const quantity = Number(l.quantity);
    return { ...l, quantity, unitCost, lineCost: unitCost === null ? null : Math.round(unitCost * quantity * 100) / 100 };
  });
  const cost = bomCostRollUp(lines.map((l: (typeof lines)[number]) => ({ quantity: l.quantity, unitCost: l.unitCost, isOptional: l.isOptional })));
  return { ...c, specs: (c.specs ?? {}) as Record<string, string>, bomLines: lines, cost };
}

// ── Bill of materials ──────────────────────────────────────────────────────

async function configurationForChange(configurationId: string, where: string) {
  await authorize('catalogue.manage', undefined, where, 'Only the Catalogue team can change a bill of materials.');
  const c = await prisma.productConfiguration.findFirst({ where: { id: configurationId, product: await orgWhere() }, select: { id: true, code: true, product: { select: { id: true, sku: true } } } });
  if (!c) fail('This configuration is not available.');
  return c!;
}

export async function addBomLine(configurationId: string, input: { partId: string; quantity: number; station: string; isOptional?: boolean; notes?: string }): Promise<void> {
  const c = await configurationForChange(configurationId, 'addBomLine');
  const user = await requireUser();
  if (!Number.isFinite(input.quantity) || input.quantity <= 0 || input.quantity > 100000) fail('Enter the quantity per unit (more than 0).');
  if (!STATIONS.includes(input.station as Station)) fail('Choose the station that fits this part.');
  const part = await prisma.part.findFirst({ where: { id: input.partId, isActive: true, ...(await partsOfMyOrganisation()) }, select: { id: true, name: true, partNumber: true } });
  if (!part) fail('Choose a part from the components warehouse.');
  const quantity = Math.round(input.quantity * 1000) / 1000;
  await prisma.bomLine.upsert({
    where: { configurationId_partId: { configurationId: c.id, partId: part!.id } },
    create: { configurationId: c.id, partId: part!.id, quantity, station: input.station, isOptional: Boolean(input.isOptional), notes: input.notes?.trim().slice(0, 300) || null },
    update: { quantity, station: input.station, isOptional: Boolean(input.isOptional), notes: input.notes?.trim().slice(0, 300) || null },
  });
  await audit(user.id, 'product_configuration.bom_line_set', 'ProductConfiguration', c.id, { referenceNumber: `${c.product.sku}-${c.code}`, productId: c.product.id, part: part!.partNumber ?? part!.name, quantity, station: input.station });
}

export async function removeBomLine(configurationId: string, partId: string): Promise<void> {
  const c = await configurationForChange(configurationId, 'removeBomLine');
  const user = await requireUser();
  const line = await prisma.bomLine.findFirst({ where: { configurationId: c.id, partId }, include: { part: { select: { name: true, partNumber: true } } } });
  if (!line) fail('That line is no longer on the bill of materials.');
  await prisma.bomLine.delete({ where: { id: line!.id } });
  await audit(user.id, 'product_configuration.bom_line_removed', 'ProductConfiguration', c.id, { referenceNumber: `${c.product.sku}-${c.code}`, productId: c.product.id, part: line!.part.partNumber ?? line!.part.name });
}

export async function setConfigurationPackage(configurationId: string, packageId: string, required: boolean): Promise<void> {
  const c = await configurationForChange(configurationId, 'setConfigurationPackage');
  const user = await requireUser();
  const pkg = await prisma.softwarePackage.findFirst({ where: { id: packageId, isActive: true, ...(await orgWhere()) }, select: { id: true, name: true, version: true } });
  if (!pkg) fail('Choose a software package from the list.');
  await prisma.configurationPackage.upsert({ where: { configurationId_packageId: { configurationId: c.id, packageId: pkg!.id } }, create: { configurationId: c.id, packageId: pkg!.id, required }, update: { required } });
  await audit(user.id, 'product_configuration.package_set', 'ProductConfiguration', c.id, { referenceNumber: `${c.product.sku}-${c.code}`, productId: c.product.id, package: `${pkg!.name}${pkg!.version ? ` ${pkg!.version}` : ''}`, required });
}

export async function removeConfigurationPackage(configurationId: string, packageId: string): Promise<void> {
  const c = await configurationForChange(configurationId, 'removeConfigurationPackage');
  const user = await requireUser();
  const row = await prisma.configurationPackage.findFirst({ where: { configurationId: c.id, packageId }, include: { package: { select: { name: true } } } });
  if (!row) fail('That package is no longer on the configuration.');
  await prisma.configurationPackage.delete({ where: { configurationId_packageId: { configurationId: c.id, packageId } } });
  await audit(user.id, 'product_configuration.package_removed', 'ProductConfiguration', c.id, { referenceNumber: `${c.product.sku}-${c.code}`, productId: c.product.id, package: row!.package.name });
}

/** Parts of the organisation's warehouses for the BOM editor's SearchableSelect. */
export async function searchPartsForBom(query: string): Promise<{ value: string; label: string; sublabel?: string }[]> {
  await requireUser();
  const q = query.trim().slice(0, 60);
  const rows = await prisma.part.findMany({
    where: { isActive: true, ...(await partsOfMyOrganisation()), ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { partNumber: { contains: q, mode: 'insensitive' } }, { category: { contains: q, mode: 'insensitive' } }] } : {}) },
    orderBy: { name: 'asc' }, take: 20, select: { id: true, name: true, partNumber: true, baseUnitOfMeasure: true },
  });
  return rows.map((p: (typeof rows)[number]) => ({ value: p.id, label: p.name, sublabel: [p.partNumber, p.baseUnitOfMeasure].filter(Boolean).join(' · ') }));
}

// ── Software packages ──────────────────────────────────────────────────────

export async function listSoftwarePackages(includeInactive = false) {
  await requireUser();
  return prisma.softwarePackage.findMany({
    where: { ...(await orgWhere()), ...(includeInactive ? {} : { isActive: true }) },
    orderBy: [{ kind: 'asc' }, { name: 'asc' }, { version: 'asc' }],
    include: { _count: { select: { configurations: true } } },
  });
}

export async function searchSoftwarePackagesForSelect(query: string): Promise<{ value: string; label: string; sublabel?: string }[]> {
  await requireUser();
  const q = query.trim().slice(0, 60);
  const rows = await prisma.softwarePackage.findMany({
    where: { ...(await orgWhere()), isActive: true, ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { version: { contains: q, mode: 'insensitive' } }] } : {}) },
    orderBy: { name: 'asc' }, take: 20, select: { id: true, name: true, version: true, kind: true },
  });
  return rows.map((p: (typeof rows)[number]) => ({ value: p.id, label: p.name, sublabel: [p.version, p.kind.toLowerCase()].filter(Boolean).join(' · ') }));
}

export async function createSoftwarePackage(input: { name: string; version?: string; kind: string; licenceRequired: boolean }): Promise<{ id: string }> {
  await authorize('catalogue.manage', undefined, 'createSoftwarePackage', 'Only the Catalogue team can add software packages.');
  const user = await requireUser();
  const organisationId = await organisationIdOrFail();
  const name = input.name.trim().slice(0, 120);
  if (name.length < 2) fail('Enter the package name (e.g. Windows 11 Pro image).');
  if (!['IMAGE', 'APPLICATION', 'DRIVER', 'AGENT'].includes(input.kind)) fail('Choose what kind of package this is.');
  const version = input.version?.trim().slice(0, 40) || null;
  if (await prisma.softwarePackage.findFirst({ where: { organisationId, name, version }, select: { id: true } })) fail(`${name}${version ? ` ${version}` : ''} is already in the catalogue.`);
  const created = await prisma.softwarePackage.create({ data: { organisationId, name, version, kind: input.kind as SoftwareKind, licenceRequired: input.licenceRequired }, select: { id: true } });
  await audit(user.id, 'software_package.created', 'SoftwarePackage', created.id, { name, version, kind: input.kind });
  return created;
}

export async function setSoftwarePackageActive(packageId: string, active: boolean): Promise<void> {
  await authorize('catalogue.manage', undefined, 'setSoftwarePackageActive', 'Only the Catalogue team can retire software packages.');
  const user = await requireUser();
  const p = await prisma.softwarePackage.findFirst({ where: { id: packageId, ...(await orgWhere()) }, select: { id: true, name: true, isActive: true } });
  if (!p) fail('This package is not available.');
  if (p!.isActive === active) return;
  await prisma.softwarePackage.update({ where: { id: p!.id }, data: { isActive: active } });
  await audit(user.id, active ? 'software_package.restored' : 'software_package.retired', 'SoftwarePackage', p!.id, { name: p!.name });
}

// ── Checklist templates ────────────────────────────────────────────────────

export async function listCheckTemplates(includeInactive = false) {
  await requireUser();
  return prisma.checkTemplate.findMany({
    where: { ...(await orgWhere()), ...(includeInactive ? {} : { isActive: true }) },
    orderBy: [{ stage: 'asc' }, { family: 'asc' }, { sortOrder: 'asc' }, { item: 'asc' }],
  });
}

export async function addCheckTemplate(input: { stage: string; family?: string | null; item: string }): Promise<{ id: string }> {
  await authorize('catalogue.manage', undefined, 'addCheckTemplate', 'Only the Catalogue team can change the checklists.');
  const user = await requireUser();
  const organisationId = await organisationIdOrFail();
  if (input.stage !== 'LINE_CHECK' && input.stage !== 'QA') fail('Choose the stage: line check or QA.');
  const family = input.family && FAMILIES.includes(input.family as ProductFamilyCode) ? (input.family as ProductFamily) : null;
  const item = input.item.trim().slice(0, 160);
  if (item.length < 3) fail('Write the check item (e.g. RAM seated and recognised).');
  const last = await prisma.checkTemplate.findFirst({ where: { organisationId, stage: input.stage as CheckStage, family }, orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });
  const created = await prisma.checkTemplate.create({ data: { organisationId, stage: input.stage as CheckStage, family, item, sortOrder: (last?.sortOrder ?? 0) + 10 }, select: { id: true } });
  await audit(user.id, 'check_template.added', 'CheckTemplate', created.id, { stage: input.stage, family, item });
  return created;
}

/** Swap the item with its neighbour above or below (same stage and family). */
export async function moveCheckTemplate(templateId: string, direction: 'up' | 'down'): Promise<void> {
  await authorize('catalogue.manage', undefined, 'moveCheckTemplate', 'Only the Catalogue team can change the checklists.');
  const user = await requireUser();
  const t = await prisma.checkTemplate.findFirst({ where: { id: templateId, ...(await orgWhere()) } });
  if (!t) fail('This check item is not available.');
  const siblings = await prisma.checkTemplate.findMany({ where: { organisationId: t!.organisationId, stage: t!.stage, family: t!.family, isActive: true }, orderBy: [{ sortOrder: 'asc' }, { item: 'asc' }], select: { id: true } });
  const i = siblings.findIndex((s: { id: string }) => s.id === t!.id);
  const j = direction === 'up' ? i - 1 : i + 1;
  if (i === -1 || j < 0 || j >= siblings.length) return;
  const order = siblings.map((s: { id: string }) => s.id);
  [order[i], order[j]] = [order[j]!, order[i]!];
  await prisma.$transaction(order.map((id: string, n: number) => prisma.checkTemplate.update({ where: { id }, data: { sortOrder: (n + 1) * 10 } })));
  await audit(user.id, 'check_template.moved', 'CheckTemplate', t!.id, { stage: t!.stage, family: t!.family, item: t!.item, direction });
}

export async function retireCheckTemplate(templateId: string): Promise<void> {
  await authorize('catalogue.manage', undefined, 'retireCheckTemplate', 'Only the Catalogue team can change the checklists.');
  const user = await requireUser();
  const t = await prisma.checkTemplate.findFirst({ where: { id: templateId, ...(await orgWhere()) }, select: { id: true, item: true, stage: true, family: true, isActive: true } });
  if (!t) fail('This check item is not available.');
  if (!t!.isActive) return;
  await prisma.checkTemplate.update({ where: { id: t!.id }, data: { isActive: false } });
  await audit(user.id, 'check_template.retired', 'CheckTemplate', t!.id, { stage: t!.stage, family: t!.family, item: t!.item });
}
