/**
 * What kind of place a branch is, and which work happens there. Pure.
 *
 * Kewalram's set-up: an after-sales workshop with its parts store (Isolo
 * Branch), and the assembly plant where trucks and cars are built from kits
 * (Afprint Assembly Plant, also in Isolo). Later a vehicle sales point. Each
 * is one branch of one type, so plant work and workshop work never mix:
 * kits, the line, quality, PDI and the yard live on an assembly-plant
 * branch; job cards, vehicle services and the store on a workshop branch.
 * A company with a workshop inside its plant creates two branches.
 */

export const BRANCH_TYPES = ['WORKSHOP', 'ASSEMBLY_PLANT', 'SALES', 'HEAD_OFFICE', 'WAREHOUSE'] as const;
export type BranchType = (typeof BRANCH_TYPES)[number];
export const isBranchType = (v: unknown): v is BranchType => BRANCH_TYPES.includes(v as BranchType);

export const BRANCH_TYPE_WORDS: Record<BranchType, string> = {
  WORKSHOP: 'Workshop',
  ASSEMBLY_PLANT: 'Assembly plant',
  SALES: 'Vehicle sales',
  HEAD_OFFICE: 'Head office',
  WAREHOUSE: 'Warehouse',
};

export const BRANCH_TYPE_HINTS: Record<BranchType, string> = {
  WORKSHOP: 'After-sales workshop and its parts store: job cards, vehicle services, goods receipts, parts requests.',
  ASSEMBLY_PLANT: 'Vehicles built from kits: kit receiving, the line, quality, PDI, the yard and dispatch. Has an SAP plant code.',
  SALES: 'A showroom or sales point: sold vehicles are registered to their customers here (coming later).',
  HEAD_OFFICE: 'Administration, finance and leadership. No workshop or plant records of its own.',
  WAREHOUSE: 'A parts store with no workshop: receipts and releases only.',
};

/** Which branch types each area's records may live on. */
export const AREA_BRANCH_TYPES = {
  /** Job cards, vehicle services, the workshop's own store. */
  workshop: ['WORKSHOP'] as BranchType[],
  /** The parts store: goods receipts, parts requests, stock. */
  store: ['WORKSHOP', 'WAREHOUSE'] as BranchType[],
  /** Kits, shipments, vehicles in the plant, the line, PDI, the yard. */
  plant: ['ASSEMBLY_PLANT'] as BranchType[],
} as const;
export type BranchArea = keyof typeof AREA_BRANCH_TYPES;

/** Whether records of an area may live on a branch of this type. */
export function branchTypeFits(area: BranchArea, type: BranchType | string | null | undefined): boolean {
  return AREA_BRANCH_TYPES[area].includes(type as BranchType);
}

/** Why a branch of this type cannot hold an area's records, in plain words (null when it can). */
export function branchTypeMismatch(area: BranchArea, branchName: string, type: BranchType | string | null | undefined): string | null {
  if (branchTypeFits(area, type)) return null;
  const words = isBranchType(type) ? BRANCH_TYPE_WORDS[type].toLowerCase() : 'branch';
  const need = AREA_BRANCH_TYPES[area].map((t) => BRANCH_TYPE_WORDS[t].toLowerCase()).join(' or ');
  const what = area === 'plant' ? 'plant records' : area === 'store' ? 'store records' : 'workshop records';
  return `${branchName} is ${/^[aeiou]/.test(words) ? 'an' : 'a'} ${words}, so it cannot hold ${what}: they belong on ${/^[aeiou]/.test(need) ? 'an' : 'a'} ${need} branch.`;
}

/**
 * The menu areas whose records live only on certain kinds of branch. Every
 * other area (customers, security, analytics, administration…) belongs to
 * the organisation or to every branch. Warranties and claims are the
 * workshop's records (the Warranty desk is a workshop department), so they
 * go with the workshop. Used by the menu, the dashboard and the branch bar,
 * so a plant never offers Inventory and a workshop never offers the line.
 */
export const MODULE_AREA: Record<string, BranchArea> = { workshop: 'workshop', inventory: 'store', warranty: 'workshop', plant: 'plant' };

/** The area a page belongs to, from its address ("/inventory/parts" → "inventory"); null when the page is not tied to a kind of branch. */
export function moduleOfPath(pathname: string | null | undefined): string | null {
  const first = String(pathname ?? '').split('?')[0]!.split('/').filter(Boolean)[0] ?? '';
  return first in MODULE_AREA ? first : null;
}

/** Whether a branch of this type has this area at all. Areas not tied to a kind of branch, and a branch whose type is unknown, always do. */
export function branchHostsModule(moduleKey: string | null | undefined, type: BranchType | string | null | undefined): boolean {
  const area = moduleKey ? MODULE_AREA[moduleKey] : undefined;
  if (!area || !type) return true;
  return branchTypeFits(area, type);
}

/**
 * The departments an assembly plant starts with (created with the branch,
 * renameable afterwards). Stable slugs: the plant's screens find the
 * department by slug, never by name.
 */
export const PLANT_DEPARTMENTS: { slug: string; name: string; why: string }[] = [
  { slug: 'plant-kit-receiving', name: 'Kit receiving & plant store', why: 'Shipments and kits checked against the packing list; the plant’s parts.' },
  { slug: 'plant-production', name: 'Production (the line)', why: 'Every station from the chassis frame to first start.' },
  { slug: 'plant-quality', name: 'Quality (QC and QA audit)', why: 'Quality gates on the line, end-of-line tests and the daily audit.' },
  { slug: 'plant-pdi', name: 'PDI', why: 'Pre-delivery inspection before the vehicle leaves.' },
  { slug: 'plant-yard', name: 'Yard & dispatch', why: 'Finished vehicles waiting, their checks, and dispatch through the gate.' },
  { slug: 'plant-maintenance', name: 'Plant maintenance', why: 'Tools, jigs, the test track and the shower test (optional).' },
];

/** The departments created with a new branch of this type. */
export function departmentsFor(type: BranchType): { slug: string; name: string }[] {
  if (type === 'ASSEMBLY_PLANT') return PLANT_DEPARTMENTS.map(({ slug, name }) => ({ slug, name }));
  return [];
}
