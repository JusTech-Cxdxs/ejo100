import { notFound } from 'next/navigation';
import { prisma } from '@ejo/database';
import { getWarranty } from '@/lib/actions/warranty';
import { createWarrantyClaimFormAction } from '@/lib/actions/warranty-claims-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { WarrantyClaimFields } from '@/components/WarrantyClaimFields';
import { formatDateOnly } from '@/lib/utils/format-date';

/** Start a claim against one warranty. A draft can be incomplete — the
 * readiness check on the claim page says what's still needed. */
export default async function NewWarrantyClaimPage({ searchParams }: { searchParams: Promise<{ warrantyId?: string; jobCardId?: string; error?: string }> }) {
  const { warrantyId, jobCardId, error } = await searchParams;
  if (!warrantyId) notFound();
  const w = await getWarranty(warrantyId);
  if (!w) notFound();
  const [jobCards, services] = w.vehicle
    ? await Promise.all([
        prisma.jobCard.findMany({ where: { vehicleId: w.vehicle.id }, orderBy: { createdAt: 'desc' }, take: 30, select: { id: true, jobNumber: true, createdAt: true, mileageAtCheckIn: true } }),
        prisma.vehicleService.findMany({ where: { vehicleId: w.vehicle.id }, orderBy: { createdAt: 'desc' }, take: 30, select: { id: true, serviceNumber: true, createdAt: true, odometerAtService: true } }),
      ])
    : [[], []];
  const preselectedJc = jobCardId ? jobCards.find((j: (typeof jobCards)[number]) => j.id === jobCardId) : w.jobCard ? jobCards.find((j: (typeof jobCards)[number]) => j.id === w.jobCard?.id) : undefined;
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });

  return (
    <div className="p-8">
      <LoadingLink href={`/warranty/${w.id}`} className="mb-4 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">← Back to {w.warrantyNumber}</LoadingLink>
      <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Start a warranty claim</h1>
      <p className="mt-1 mb-6 max-w-3xl text-sm text-[var(--ejo-text-muted)]">
        Against {w.warrantyNumber} — {w.subjectDescription} ({w.provider.name}). Covered {formatDateOnly(w.startsAt)} – {formatDateOnly(w.endsAt)}
        {w.startReading !== null && w.distanceLimit !== null ? ` or ${(w.startReading + w.distanceLimit).toLocaleString('en-NG')} km` : ''}.
      </p>
      {error ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="error" message={error} /></div> : null}
      <form action={createWarrantyClaimFormAction} className="max-w-3xl space-y-4 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
        <FormPendingOverlay />
        <input type="hidden" name="warrantyId" value={w.id} />
        <WarrantyClaimFields
          defaults={{
            failureDate: today,
            failureReading: preselectedJc?.mileageAtCheckIn ?? w.vehicle?.mileage ?? null,
            causalPart: w.kind === 'PART' ? w.part?.name ?? '' : '',
            causalPartNumber: w.kind === 'PART' ? w.part?.partNumber ?? null : null,
            jobCardId: preselectedJc?.id ?? null,
          }}
          jobCards={jobCards.map((j: (typeof jobCards)[number]) => ({ id: j.id, label: `${j.jobNumber} — ${formatDateOnly(j.createdAt)}${j.mileageAtCheckIn !== null ? ` — ${j.mileageAtCheckIn.toLocaleString('en-NG')} km` : ''}` }))}
          vehicleServices={services.map((v: (typeof services)[number]) => ({ id: v.id, label: `${v.serviceNumber} — ${formatDateOnly(v.createdAt)}${v.odometerAtService !== null ? ` — ${v.odometerAtService.toLocaleString('en-NG')} km` : ''}` }))}
        />
        <SubmitButton label="Save draft claim" pendingLabel="Saving…" className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90" />
      </form>
    </div>
  );
}
