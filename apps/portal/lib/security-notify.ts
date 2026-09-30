import { prisma } from '@ejo/database';
import { sendEmail } from '@/lib/email';
import { renderWarrantyStaffNoticeEmail } from '@/lib/email-templates/warranty-staff-notice';

/**
 * Tells Security (every Security Officer and the Chief Security Officer)
 * that the Workshop has released a vehicle — so they expect it at the gate.
 * Server-only helper, never a callable action. Every email is logged in the
 * Security email log and the record's audit trail; a failure never blocks
 * the checkout itself.
 */
export async function notifyGateOfRelease(kind: 'JOB_CARD' | 'VEHICLE_SERVICE', recordId: string, actorId: string | null) {
  try {
    const rec =
      kind === 'JOB_CARD'
        ? await prisma.jobCard.findUnique({ where: { id: recordId }, select: { jobNumber: true, status: true, collectedByName: true, vehicle: { select: { make: true, model: true, plateNumber: true, chassisNumber: true } }, customer: { select: { fullName: true } }, branch: { select: { name: true, businessUnit: { select: { organisation: { select: { name: true } } } } } } } })
            .then((j) => j && { number: j.jobNumber, handBack: false, collector: j.collectedByName, vehicle: j.vehicle, customer: j.customer.fullName, branch: j.branch })
        : await prisma.vehicleService.findUnique({ where: { id: recordId }, select: { serviceNumber: true, status: true, collectedByName: true, vehicle: { select: { make: true, model: true, plateNumber: true, chassisNumber: true } }, customer: { select: { fullName: true } }, branch: { select: { name: true, businessUnit: { select: { organisation: { select: { name: true } } } } } } } })
            .then((v) => v && { number: v.serviceNumber, handBack: v.status === 'CANCELLED', collector: v.collectedByName, vehicle: v.vehicle, customer: v.customer.fullName, branch: v.branch });
    if (!rec) return;
    const gate = await prisma.user.findMany({ where: { isActive: true, roles: { some: { role: { slug: { in: ['security-officer', 'chief-security-officer'] } } } } }, select: { fullName: true, email: true } });
    if (gate.length === 0) return;
    const car = [rec.vehicle.make, rec.vehicle.model].filter(Boolean).join(' ') || 'Vehicle';
    const portal = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://ejo100-portal.vercel.app';
    const subject = `Vehicle released — ${rec.vehicle.plateNumber ?? car} may leave (${rec.number})`;
    const lines = [
      `${car}${rec.vehicle.plateNumber ? ` — ${rec.vehicle.plateNumber}` : ''}`,
      ...(rec.vehicle.chassisNumber ? [`VIN: ${rec.vehicle.chassisNumber}`] : []),
      `${rec.number} · ${rec.customer}${rec.handBack ? ' (handed back after cancellation)' : ''}`,
      ...(rec.collector ? [`Collected by: ${rec.collector}`] : []),
      'Check the plate and VIN against the release page, then confirm the exit at the gate.',
    ];
    const entityType = kind === 'JOB_CARD' ? 'JobCard' : 'VehicleService';
    for (const g of gate) {
      let sent = true;
      let error: string | null = null;
      try {
        await sendEmail(g.email, subject, renderWarrantyStaffNoticeEmail({
          recipientName: g.fullName,
          heading: 'A vehicle has been released to leave',
          lines,
          actionUrl: `${portal}/security/vehicles/release/${kind === 'JOB_CARD' ? 'job-card' : 'vehicle-service'}/${recordId}`,
          logoUrl: `${portal}/images/logo/logo.png`,
          companyName: rec.branch.businessUnit?.organisation?.name ?? 'EJO 100',
          branchName: rec.branch.name,
        }));
      } catch (err) {
        sent = false;
        error = err instanceof Error ? err.message.slice(0, 300) : 'Unknown error';
      }
      await prisma.securityEmailLog.create({ data: { entityType, entityId: recordId, recipient: `${g.fullName} <${g.email}>`, subject, sent, error } });
      await prisma.auditLog.create({ data: { userId: actorId, action: sent ? 'security.email_sent' : 'security.email_failed', entityType, entityId: recordId, metadata: { to: g.fullName, subject, ...(error ? { error } : {}) } } });
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to notify Security of a released vehicle', kind, recordId, err);
  }
}
