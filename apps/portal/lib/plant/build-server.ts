/**
 * Starting a vehicle's build on the line (shared by the kit release and the
 * line board; not a server action — the callers authorise first).
 */
import { prisma, Prisma } from '@ejo/database';
import { writeAuditLog } from '@/lib/workshop-core';
import { modelByCode, PLANT_STAGE_WORDS, type PdiFamily, type PlantStage } from '@/lib/plant/pdi';
import { DEFAULT_ROUTES, type RouteStation } from '@/lib/plant/line';

/** The live route for a family at a plant: the plant's own latest version, or null for the default. */
export async function liveRoute(branchId: string, familyKey: PdiFamily) {
  return prisma.plantRoute.findFirst({ where: { branchId, familyKey, isActive: true }, orderBy: { version: 'desc' } });
}

export type StartBuild = { vehicleId: string; branchId: string; organisationId: string; modelCode: string; vin: string; stage: PlantStage; existingVisits: number; userId: string };

/**
 * Snapshots the live route into the vehicle's station visits and puts it on
 * the line. A vehicle that already has visits keeps them.
 */
export async function startBuildFor(b: StartBuild): Promise<{ ok: true; stations: number; reused?: boolean } | { ok: false; error: string }> {
  if (b.existingVisits) return { ok: true, stations: b.existingVisits, reused: true };
  if (!['KIT', 'LINE'].includes(b.stage)) return { ok: false, error: `This vehicle is ${PLANT_STAGE_WORDS[b.stage].toLowerCase()}: its build is past the line.` };
  const family = modelByCode(b.modelCode)?.family ?? null;
  if (!family) return { ok: false, error: `There is no route for the model ${b.modelCode}.` };
  const route = await liveRoute(b.branchId, family);
  const stations: RouteStation[] = route && Array.isArray(route.stations) ? (route.stations as unknown as RouteStation[]) : DEFAULT_ROUTES[family].stations;
  if (!stations.length) return { ok: false, error: 'The route has no stations yet.' };
  await prisma.$transaction(async (tx) => {
    await tx.plantStationVisit.createMany({
      data: stations.map((s, i) => ({ organisationId: b.organisationId, branchId: b.branchId, plantVehicleId: b.vehicleId, code: s.code, name: s.name, kind: s.kind, sort: i, standardMinutes: s.standardMinutes, checks: s.checks as unknown as Prisma.InputJsonValue })),
      skipDuplicates: true,
    });
    await tx.plantVehicle.updateMany({ where: { id: b.vehicleId, stage: { in: ['KIT', 'LINE'] } }, data: { stage: 'LINE', routeId: route?.id ?? null, routeVersion: route?.version ?? 0, currentStation: stations[0]!.code, lineStartedAt: new Date() } });
  });
  await writeAuditLog({ userId: b.userId, action: 'plant.build_started', entityType: 'PlantVehicle', entityId: b.vehicleId, metadata: { vin: b.vin, model: b.modelCode, route: route ? `${route.name} v${route.version}` : `${DEFAULT_ROUTES[family].name} (default)`, stations: stations.length } });
  return { ok: true, stations: stations.length };
}
