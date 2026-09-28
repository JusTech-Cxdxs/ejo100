import { prisma } from '@ejo/database';
import { sendEmail } from '@/lib/email';
import { renderWarrantyStaffNoticeEmail } from '@/lib/email-templates/warranty-staff-notice';
import { splitLines, durationLabel } from '@/lib/warranty-state';

/**
 * Tells the warranty department (Warranty HOD + Warranty Officers at the
 * branch) whenever a part's warranty is set, changed or removed — with the
 * full detail of the part and the policy. Server-only helper, never a
 * callable action. Never throws: a notice failing must not undo the change.
 */
export async function notifyWarrantyDepartmentOfPartWarranty(opts: { partId: string; previousPolicyId: string | null; actorId: string; context: 'CREATED' | 'CHANGED' }) {
  try {
    const part = await prisma.part.findUnique({
      where: { id: opts.partId },
      select: {
        id: true, name: true, partNumber: true, category: true, trackingType: true, baseUnitOfMeasure: true, branchId: true,
        warrantyPolicy: { select: { code: true, name: true, durationMonths: true, durationUnit: true, distanceLimit: true, coversParts: true, coversLabour: true, coversLogistics: true, defaultRemedy: true, coverageSummary: true, isSample: true, provider: { select: { name: true } } } },
      },
    });
    if (!part) return;
    const [previous, actor, recipients] = await Promise.all([
      opts.previousPolicyId ? prisma.warrantyPolicy.findUnique({ where: { id: opts.previousPolicyId }, select: { code: true, name: true } }) : Promise.resolve(null),
      prisma.user.findUnique({ where: { id: opts.actorId }, select: { fullName: true } }),
      prisma.user.findMany({
        where: { isActive: true, roles: { some: { role: { slug: { in: ['warranty-hod', 'warranty-officer'] } } } } },
        select: { fullName: true, email: true },
      }),
    ]);
    if (recipients.length === 0) return;
    const org = await prisma.organisation.findFirst({ select: { name: true } });
    const branch = await prisma.branch.findUnique({ where: { id: part.branchId }, select: { name: true } });
    const p = part.warrantyPolicy;
    const pays = p ? [p.coversParts ? 'parts' : null, p.coversLabour ? 'labour' : null, p.coversLogistics ? 'logistics' : null].filter(Boolean).join(', ') : '';
    const remedy = p ? { REIMBURSEMENT: 'reimbursement (payment or credit)', REPLACEMENT: 'replacement part', REPAIR: 'repair by the provider' }[p.defaultRemedy] : '';
    const heading = !p ? 'A part no longer carries a warranty' : opts.context === 'CREATED' ? 'A new part was added with a warranty' : 'A part’s warranty was changed';
    const lines = [
      `Part: ${part.name}${part.partNumber ? ` (${part.partNumber})` : ''}${part.category ? ` — ${part.category}` : ''}`,
      `Tracking: ${part.trackingType.toLowerCase()} · unit: ${part.baseUnitOfMeasure}`,
      ...(previous ? [`Previous warranty: ${previous.name} (${previous.code})`] : opts.context === 'CHANGED' ? ['Previous warranty: none'] : []),
      ...(p
        ? [
            `Warranty: ${p.name} (${p.code})${p.isSample ? ' — sample terms' : ''}`,
            `Term: ${durationLabel(p)}${p.distanceLimit ? ` or ${p.distanceLimit.toLocaleString('en-NG')} km, whichever comes first` : ''}`,
            `Provider: ${p.provider.name} · pays for: ${pays} · usual remedy: ${remedy}`,
            `Covers: ${splitLines(p.coverageSummary).join('; ')}`,
            'Every unit released to a customer from now on gets its own warranty number automatically.',
          ]
        : ['Units released from now on will not get a warranty number. Warranties already issued are unchanged.']),
      `Changed by: ${actor?.fullName ?? 'a staff member'}`,
    ];
    const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://ejo100-portal.vercel.app';
    for (const r of recipients) {
      await sendEmail(
        r.email,
        `${heading} — ${part.name}`,
        renderWarrantyStaffNoticeEmail({
          recipientName: r.fullName,
          heading,
          lines,
          actionUrl: `${portalUrl}/inventory/parts/${part.id}#warranty`,
          logoUrl: `${portalUrl}/images/logo/logo.png`,
          companyName: org?.name ?? 'EJO 100',
          branchName: branch?.name ?? '',
        }),
      );
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to notify the warranty department', err);
  }
}
