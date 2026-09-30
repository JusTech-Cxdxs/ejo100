import { listVehiclesClearedToLeave, listRecentVehicleExits, getSecurityRoles } from '@/lib/actions/security';
import { confirmVehicleExitFormAction } from '@/lib/actions/security-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { SecurityNav } from '@/components/SecurityNav';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { formatDateTimeCompact } from '@/lib/utils/format-date';

export default async function SecurityVehiclesPage({ searchParams }: { searchParams: Promise<{ status?: string; error?: string }> }) {
  const { status, error } = await searchParams;
  const [cleared, exits, roles] = await Promise.all([listVehiclesClearedToLeave(), listRecentVehicleExits(), getSecurityRoles()]);
  const input = 'rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-1.5 text-sm text-[var(--ejo-text)]';
  const link = 'text-[var(--ejo-primary)] hover:underline';
  const card = 'rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6';
  return (
    <div className="p-8">
      <h1 className="mb-1 text-2xl font-bold text-[var(--ejo-text)]">Vehicles leaving</h1>
      <p className="mb-4 text-sm text-[var(--ejo-text-muted)]">Released by the Workshop — confirm each one through the gate. A vehicle not on this list has not been released.</p>
      <SecurityNav active="/security/vehicles" />
      {status === 'vehicle_out' ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="success" message="Vehicle recorded leaving — print its gate slip from Recently left." /></div> : null}
      {error ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="error" message={error} /></div> : null}
      <div className={`${card} mb-6`}>
        <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Cleared to leave ({cleared.length})</h2>
        {cleared.length === 0 ? <p className="mt-2 text-sm text-[var(--ejo-text-muted)]">No vehicles waiting to leave.</p> : (
          <ul className="mt-3 divide-y divide-[var(--ejo-border)]">
            {cleared.map((v) => (
              <li key={`${v.kind}-${v.id}`} className="grid gap-3 py-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                <div className="min-w-0 text-sm">
                  <LoadingLink href={`/workshop/vehicles/${v.vehicle.id}/edit`} className={`font-medium ${link}`}>
                    {[v.vehicle.make, v.vehicle.model].filter(Boolean).join(' ') || 'Vehicle'}{v.vehicle.plateNumber ? ` — ${v.vehicle.plateNumber}` : ''}
                  </LoadingLink>
                  <p className="text-xs text-[var(--ejo-text-muted)]">
                    {v.vehicle.chassisNumber ? `VIN ${v.vehicle.chassisNumber} · ` : ''}
                    <LoadingLink href={v.kind === 'JOB_CARD' ? `/workshop/job-cards/${v.id}` : `/workshop/vehicle-service/${v.id}`} className={link}>{v.number}</LoadingLink>
                    {' · '}{v.customer}{v.cancelled ? ' · handed back (cancelled)' : ''}
                  </p>
                  <p className="text-xs text-[var(--ejo-text-muted)]">Released {v.releasedAt ? formatDateTimeCompact(v.releasedAt) : '—'}{v.collectedBy ? ` · collected by ${v.collectedBy}` : ''}</p>
                </div>
                {roles.isGate ? (
                  <form action={confirmVehicleExitFormAction} className="flex flex-wrap items-center gap-2">
                    <FormPendingOverlay />
                    <input type="hidden" name="kind" value={v.kind} />
                    <input type="hidden" name="recordId" value={v.id} />
                    <input name="driverName" defaultValue={v.collectedBy ?? ''} placeholder="Driver's name" className={`${input} min-w-0 flex-1`} />
                    <input name="notes" placeholder="Notes (optional)" className={`${input} min-w-0 flex-1`} />
                    <SubmitButton label="Confirm exit" pendingLabel="Saving…" className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90" />
                  </form>
                ) : <p className="text-xs text-[var(--ejo-text-muted)]">Security confirms the exit.</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className={card}>
        <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Recently left</h2>
        {exits.length === 0 ? <p className="mt-2 text-sm text-[var(--ejo-text-muted)]">None yet.</p> : (
          <ul className="mt-3 divide-y divide-[var(--ejo-border)] text-sm">
            {exits.map((x) => (
              <li key={x.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span className="min-w-0">
                  <span className="font-medium text-[var(--ejo-text)]">{x.exitNumber}</span>{' · '}
                  <LoadingLink href={`/workshop/vehicles/${x.vehicle.id}/edit`} className={link}>{[x.vehicle.make, x.vehicle.model].filter(Boolean).join(' ') || 'Vehicle'}{x.vehicle.plateNumber ? ` — ${x.vehicle.plateNumber}` : ''}</LoadingLink>
                  {' · '}
                  {x.jobCard ? <LoadingLink href={`/workshop/job-cards/${x.jobCard.id}`} className={link}>{x.jobCard.jobNumber}</LoadingLink> : null}
                  {x.vehicleService ? <LoadingLink href={`/workshop/vehicle-service/${x.vehicleService.id}`} className={link}>{x.vehicleService.serviceNumber}</LoadingLink> : null}
                  <span className="block text-xs text-[var(--ejo-text-muted)]">{x.driverName ? `Driven by ${x.driverName} · ` : ''}confirmed by {x.exitedBy.fullName}{x.notes ? ` · ${x.notes}` : ''}</span>
                </span>
                <span className="text-right text-xs text-[var(--ejo-text-muted)]">
                  {formatDateTimeCompact(x.exitedAt)}
                  <a href={`/print/vehicle-exit/${x.id}`} target="_blank" rel="noreferrer" className={`block ${link}`}>Print gate slip</a>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
