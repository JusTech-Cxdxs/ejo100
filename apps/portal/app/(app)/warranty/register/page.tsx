import { prisma } from '@ejo/database';
import { requireUser } from '@/lib/actions/workshop';
import { listWarrantyPolicies, listWarrantiesFor } from '@/lib/actions/warranty';
import { registerAssetWarrantyFormAction } from '@/lib/actions/warranty-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { WarrantyList } from '@/components/WarrantyList';

/**
 * Register a vehicle (asset) warranty — the manual bridge until the sales
 * branch (e.g. Afprint) feeds warranties directly. Find the vehicle by
 * VIN or plate, pick the policy, enter the delivery date and odometer, and
 * record the evidence (invoice / delivery note). A second person verifies
 * it before it covers anything.
 */
export default async function RegisterWarrantyPage({ searchParams }: { searchParams: Promise<{ vehicleId?: string; q?: string; error?: string }> }) {
  const { vehicleId, q, error } = await searchParams;
  await requireUser();
  const [policies, matches, vehicle] = await Promise.all([
    listWarrantyPolicies('ASSET'),
    !vehicleId && q?.trim()
      ? prisma.customerVehicle.findMany({
          where: {
            OR: [
              { chassisNumber: { contains: q.trim(), mode: 'insensitive' } },
              { plateNumber: { contains: q.trim(), mode: 'insensitive' } },
              { customer: { fullName: { contains: q.trim(), mode: 'insensitive' } } },
            ],
          },
          take: 20,
          select: { id: true, make: true, model: true, year: true, plateNumber: true, chassisNumber: true, customer: { select: { fullName: true } } },
        })
      : Promise.resolve([]),
    vehicleId
      ? prisma.customerVehicle.findUnique({
          where: { id: vehicleId },
          select: { id: true, make: true, model: true, year: true, plateNumber: true, chassisNumber: true, mileage: true, customer: { select: { fullName: true } } },
        })
      : Promise.resolve(null),
  ]);
  const active = policies.filter((p: (typeof policies)[number]) => p.isActive);
  const existing = vehicle ? await listWarrantiesFor({ vehicleId: vehicle.id }) : [];
  const input = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';

  return (
    <div className="p-8">
      <LoadingLink href="/warranty" className="mb-4 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">
        ← Back to Warranty
      </LoadingLink>
      <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Register vehicle warranty</h1>
      <p className="mt-1 mb-6 max-w-3xl text-sm text-[var(--ejo-text-muted)]">
        For a vehicle sold with a manufacturer&apos;s warranty. The warranty starts on the delivery date; a second person verifies the
        evidence before it covers anything.
      </p>
      {error ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="error" message={error} /></div> : null}

      {!vehicle ? (
        <div className="max-w-2xl">
          <form className="mb-4 flex gap-2" action="/warranty/register">
            <input type="search" name="q" defaultValue={q ?? ''} placeholder="Find the vehicle by VIN, plate or customer…" className={input} />
            <button type="submit" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]">Find</button>
          </form>
          {q && matches.length === 0 ? (
            <p className="text-sm text-[var(--ejo-text-muted)]">
              No vehicle found. Register the vehicle first under{' '}
              <LoadingLink href="/workshop/vehicles" className="text-[var(--ejo-primary)] hover:underline">Workshop → Vehicles</LoadingLink>, then come back.
            </p>
          ) : null}
          <div className="space-y-2">
            {matches.map((m: (typeof matches)[number]) => (
              <LoadingLink
                key={m.id}
                href={`/warranty/register?vehicleId=${m.id}`}
                className="block rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-3 hover:border-[var(--ejo-primary)]"
              >
                <p className="text-sm font-medium text-[var(--ejo-text)]">{[m.year, m.make, m.model].filter(Boolean).join(' ') || 'Vehicle'} {m.plateNumber ? `— ${m.plateNumber}` : ''}</p>
                <p className="text-xs text-[var(--ejo-text-muted)]">{m.customer.fullName}{m.chassisNumber ? ` · VIN ${m.chassisNumber}` : ''}</p>
              </LoadingLink>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid max-w-5xl gap-6 lg:grid-cols-[1fr_1fr]">
          <form action={registerAssetWarrantyFormAction} className="space-y-4 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
            <FormPendingOverlay />
            <input type="hidden" name="vehicleId" value={vehicle.id} />
            <div>
              <p className="text-xs text-[var(--ejo-text-muted)]">Vehicle</p>
              <p className="text-sm font-medium text-[var(--ejo-text)]">
                {[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'Vehicle'} {vehicle.plateNumber ? `— ${vehicle.plateNumber}` : ''}
              </p>
              <p className="text-xs text-[var(--ejo-text-muted)]">{vehicle.customer.fullName}{vehicle.chassisNumber ? ` · VIN ${vehicle.chassisNumber}` : ' · no VIN recorded'}</p>
              <LoadingLink href="/warranty/register" className="text-xs text-[var(--ejo-primary)] hover:underline">Choose a different vehicle</LoadingLink>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Warranty policy</label>
              {active.length === 0 ? (
                <p className="text-xs text-[var(--ejo-warning)]">
                  No active vehicle policies yet — add one (or load the samples) under{' '}
                  <LoadingLink href="/warranty/policies" className="text-[var(--ejo-primary)] hover:underline">Policies</LoadingLink>.
                </p>
              ) : (
                <select name="policyId" required className={input}>
                  {active.map((p: (typeof active)[number]) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {p.durationMonths} months{p.distanceLimit ? ` / ${p.distanceLimit.toLocaleString('en-NG')} km` : ''} ({p.provider.name}){p.isSample ? ' — SAMPLE' : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Delivery date (warranty start)</label>
                <input type="date" name="startsAt" required className={input} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Odometer at delivery (km)</label>
                <input type="number" name="startReading" min={0} placeholder="e.g. 12" className={input} />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Evidence</label>
              <textarea name="evidenceNote" required rows={3} placeholder="e.g. Sales invoice INV-0098 dated 25 Sep 2026; delivery note DN-0431" className={input} />
            </div>
            <SubmitButton label="Register warranty" pendingLabel="Registering…" className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90" />
          </form>
          <WarrantyList warranties={existing} title="This vehicle's warranties" emptyText="No warranties recorded for this vehicle yet." />
        </div>
      )}
    </div>
  );
}
