import { redirect, notFound } from 'next/navigation';
import { normaliseVin, isChassisLike, vehiclePagePath } from '@/lib/vin';

export const dynamic = 'force-dynamic';

/**
 * The address in a vehicle's QR code (/v/VIN): short, so the code stays
 * small and scans from a phone at arm's length. Signing in is required
 * (the sign-in page returns here); the vehicle's page checks what the
 * person may see.
 */
export default async function ScanVehicle({ params }: { params: Promise<{ vin: string }> }) {
  const { vin } = await params;
  const v = normaliseVin(decodeURIComponent(vin));
  if (!isChassisLike(v)) notFound();
  redirect(vehiclePagePath(v));
}
