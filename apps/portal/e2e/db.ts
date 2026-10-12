/**
 * Direct database access for the tests — ONLY for:
 *  • fixtures a spec needs that are not the thing being tested (a fresh
 *    vehicle with a never-used plate, so specs never collide and a retry
 *    always starts clean), and
 *  • cheap downstream checks the UI does not show (e.g. exactly one payment
 *    row after a double submit).
 * Never used to move a workflow along — every business step goes through
 * the browser, as the right person. CI only (throwaway test database).
 */
import { PrismaClient } from '@prisma/client';
import { CUSTOMER } from './people';

let client: PrismaClient | null = null;
export function db(): PrismaClient {
  client ??= new PrismaClient();
  return client;
}

/** A brand-new passenger vehicle for `customerEmail` (default: Ada Customer), with a unique plate. */
export async function freshVehicle(tag: string, opts: { customerEmail?: string; make?: string; model?: string; year?: number } = {}): Promise<{ id: string; plate: string; label: string }> {
  const prisma = db();
  const customer = await prisma.customer.findUniqueOrThrow({ where: { email: opts.customerEmail ?? CUSTOMER.email } });
  const stamp = Date.now().toString(36).toUpperCase().slice(-5);
  const plate = `${tag.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3).padEnd(3, 'X')}-${stamp}`;
  const v = await prisma.customerVehicle.create({
    data: { customerId: customer.id, make: opts.make ?? 'Toyota', model: opts.model ?? 'Camry', year: opts.year ?? 2018, vehicleType: 'PASSENGER', plateNumber: plate, mileage: 50000 },
  });
  return { id: v.id, plate, label: `${opts.make ?? 'Toyota'} ${opts.model ?? 'Camry'}` };
}

export async function idOfPart(partNumber: string): Promise<string> {
  const p = await db().part.findFirstOrThrow({ where: { partNumber }, select: { id: true } });
  return p.id;
}

export async function jobCardIdFromUrl(url: string): Promise<string> {
  const id = /\/workshop\/job-cards\/([^/?#]+)/.exec(url)?.[1];
  if (!id) throw new Error(`Not a Job Card URL: ${url}`);
  return id;
}

export async function paymentsOn(jobCardId: string): Promise<number> {
  return db().payment.count({ where: { jobCardId } });
}
