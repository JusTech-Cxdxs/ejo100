import type { ReactNode } from 'react';
import { prisma } from '@ejo/database';
import { getOrganisation } from '@/lib/actions/organisation';
import { getVehiclePassport, recordVehiclePrint, type LabelKind, type VehiclePassport } from '@/lib/actions/vehicle-passport';
import { getWorkshopBranchId } from '@/lib/workshop-core';
import { portalBaseUrl } from '@/lib/portal-url';
import { vehicleScanPath } from '@/lib/vin';

/**
 * What every vehicle printout needs: the vehicle (as the person printing it
 * may see it), the letterhead, the address the QR code opens, and the print
 * recorded (a reprint keeps the same codes and is counted). A person who may
 * not print vehicle papers gets a plain refusal, never the document.
 */
export async function loadVehiclePrint(raw: string, kind: LabelKind): Promise<
  | { ok: true; p: VehiclePassport; scanUrl: string; printed: number; organisation: NonNullable<Awaited<ReturnType<typeof getOrganisation>>>; branch: NonNullable<Awaited<ReturnType<typeof prisma.branch.findUnique>>> }
  | { ok: false; status: 'not-found' | 'refused'; message: string }
> {
  const p = await getVehiclePassport(decodeURIComponent(raw)).catch(() => null);
  if (!p) return { ok: false, status: 'not-found', message: 'EJO has no vehicle with this VIN.' };
  let printed = 0;
  try { printed = await recordVehiclePrint(p.vin, kind); } catch (e) { return { ok: false, status: 'refused', message: (e as Error).message }; }
  const [organisation, branch] = await Promise.all([getOrganisation(), prisma.branch.findUnique({ where: { id: await getWorkshopBranchId() } })]);
  if (!organisation || !branch) return { ok: false, status: 'not-found', message: 'The organisation is not set up yet.' };
  return { ok: true, p, scanUrl: `${portalBaseUrl().replace(/\/$/, '')}${vehicleScanPath(p.vin)}`, printed, organisation, branch };
}

export function PrintRefusal({ message }: { message: string }) {
  return <p style={{ margin: '48px auto', maxWidth: '32rem', fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '14px', color: '#0F172A' }}>{message}</p>;
}

/** "Printed 3 times" in small print: a reprint is visible on the paper itself. */
export function PrintStamp({ printed, children }: { printed: number; children?: ReactNode }) {
  return <span style={{ fontSize: '8px', color: '#475569' }}>{children}{printed > 1 ? `${children ? ' · ' : ''}reprint ${printed - 1}` : ''}</span>;
}
