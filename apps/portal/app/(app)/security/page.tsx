import type { ReactNode } from 'react';
import { getSecurityDashboard, getSecurityRoles } from '@/lib/actions/security';
import { visitActionFormAction, exitPassActionFormAction } from '@/lib/actions/security-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { SecurityNav } from '@/components/SecurityNav';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { visitOverdueMinutes, exitPassOverdueMinutes, durationText, VEHICLE_TYPE_LABEL } from '@/lib/security-rules';
import { formatDateTimeCompact } from '@/lib/utils/format-date';

const card = 'rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5';
const btn = 'rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-3 py-1 text-xs font-medium text-white hover:opacity-90';

function Panel({ title, count, children, tone }: { title: string; count: number; children: ReactNode; tone?: string }) {
  return (
    <div className={card}>
      <h2 className={`text-sm font-semibold ${tone ?? 'text-[var(--ejo-text)]'}`}>{title} ({count})</h2>
      <div className="mt-3">{count === 0 ? <p className="text-xs text-[var(--ejo-text-muted)]">None.</p> : children}</div>
    </div>
  );
}

function Act({ action, idName, id, label, form }: { action: string; idName: string; id: string; label: string; form: (f: FormData) => Promise<void> }) {
  return (
    <form action={form}>
      <FormPendingOverlay />
      <input type="hidden" name={idName} value={id} />
      <input type="hidden" name="action" value={action} />
      <SubmitButton label={label} pendingLabel="…" className={btn} />
    </form>
  );
}

export default async function SecurityDashboardPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const [d, roles] = await Promise.all([getSecurityDashboard(), getSecurityRoles()]);
  const now = new Date();
  const overdueVisits = d.onPremises.filter((v) => visitOverdueMinutes(v, now) > 0);
  const overduePasses = d.passesOut.filter((p) => exitPassOverdueMinutes(p, now) > 0);
  const row = 'flex flex-wrap items-center justify-between gap-2 border-b border-[var(--ejo-border)] py-2 text-sm last:border-0';

  return (
    <div className="p-8">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Security</h1>
          <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">Who is expected, who is here, who is out, and what may leave — live.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <LoadingLink href="/security/visitors#register" className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90">+ Visitor</LoadingLink>
          <LoadingLink href="/security/exit-passes/new" className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90">+ Exit pass</LoadingLink>
          <LoadingLink href="/security/vehicles" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]">Vehicles leaving ({d.vehicles.length})</LoadingLink>
        </div>
      </div>
      <SecurityNav active="/security" />
      {error ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="error" message={error} /></div> : null}

      <h2 className="mb-2 text-sm font-semibold text-[var(--ejo-text)]">In the compound now</h2>
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        {([
          ['Visitors on premises', d.compound.visitors, 'Checked in, not yet out', '/security/on-premises'],
          ['Visitor vehicles', d.compound.visitorVehicles, 'Cars, motorcycles… of visitors inside', '/security/vehicles-inside?type=visitor'],
          ['Workshop vehicles', d.compound.workshopVehicles, 'Job Cards and Vehicle Services in progress', '/security/vehicles-inside?type=workshop'],
          ['Cleared, not yet out', d.compound.awaitingExit, 'Released — waiting at the gate', '/security/vehicles'],
          ['Vehicles inside (total)', d.compound.vehiclesInside, 'All of the above', '/security/vehicles-inside'],
          ['People out on passes', d.compound.peopleOut, 'Employees and others on exit passes', '/security/people-out'],
          ['Overdue', overdueVisits.length + overduePasses.length, 'Follow up or extend', '/security/overdue'],
        ] as const).map(([label, n, hint, href]) => (
          <LoadingLink key={label} href={href} className={`${card} block transition hover:border-[var(--ejo-primary)]`}>
            <p className="text-xs text-[var(--ejo-text-muted)]">{label}</p>
            <p className={`mt-1 text-2xl font-bold ${label === 'Overdue' && n > 0 ? 'text-[var(--ejo-error)]' : 'text-[var(--ejo-text)]'}`}>{n}</p>
            <p className="mt-1 text-[10px] text-[var(--ejo-text-muted)]">{hint} →</p>
          </LoadingLink>
        ))}
      </div>

      {overdueVisits.length + overduePasses.length > 0 ? (
        <div className="mb-6 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-error)]/40 bg-[var(--ejo-error)]/5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-[var(--ejo-error)]">Overdue</h2>
            <LoadingLink href="/security/overdue" className="text-xs font-medium text-[var(--ejo-primary)] hover:underline">Follow up or extend →</LoadingLink>
          </div>
          <ul className="mt-2 space-y-1 text-sm">
            {overdueVisits.map((v) => (
              <li key={v.id}><LoadingLink href={`/security/visitors/${v.id}`} className="text-[var(--ejo-primary)] hover:underline">{v.visitorName}</LoadingLink> — visiting {v.host.fullName}, over by {durationText(visitOverdueMinutes(v, now))}</li>
            ))}
            {overduePasses.map((p) => (
              <li key={p.id}><LoadingLink href={`/security/exit-passes/${p.id}`} className="text-[var(--ejo-primary)] hover:underline">{p.passNumber}</LoadingLink> — {p.people.map((x) => x.name).join(', ')}, not back; over by {durationText(exitPassOverdueMinutes(p, now))}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="On premises now" count={d.onPremises.length}>
          {d.onPremises.map((v) => (
            <div key={v.id} className={row}>
              <span className="min-w-0">
                <LoadingLink href={`/security/visitors/${v.id}`} className="font-medium text-[var(--ejo-primary)] hover:underline">{v.visitorName}</LoadingLink>
                <span className="block text-xs text-[var(--ejo-text-muted)]">{v.passNumber} · visiting {v.host.fullName} · in {v.checkedInAt ? formatDateTimeCompact(v.checkedInAt) : '—'} · {v.vehicleType === 'ON_FOOT' ? 'on foot' : `${VEHICLE_TYPE_LABEL[v.vehicleType] ?? 'Vehicle'} ${v.vehiclePlate ?? ''}`}</span>
              </span>
              {roles.isGate ? <Act action="check_out" idName="visitId" id={v.id} label="Check out" form={visitActionFormAction} /> : null}
            </div>
          ))}
        </Panel>
        <Panel title="Checked in — not yet received at reception" count={d.atGateNotReceived.length} tone="text-[var(--ejo-warning)]">
          {d.atGateNotReceived.map((v) => (
            <div key={v.id} className={row}>
              <span className="min-w-0">
                <LoadingLink href={`/security/visitors/${v.id}`} className="font-medium text-[var(--ejo-primary)] hover:underline">{v.visitorName}</LoadingLink>
                <span className="block text-xs text-[var(--ejo-text-muted)]">to see {v.host.fullName} · {v.purpose}</span>
              </span>
              {roles.isFrontDesk ? <Act action="receive" idName="visitId" id={v.id} label="Received" form={visitActionFormAction} /> : null}
            </div>
          ))}
        </Panel>
        <Panel title="Expected today" count={d.expectedToday.length}>
          {d.expectedToday.map((v) => (
            <div key={v.id} className={row}>
              <span className="min-w-0">
                <LoadingLink href={`/security/visitors/${v.id}`} className="font-medium text-[var(--ejo-primary)] hover:underline">{v.visitorName}</LoadingLink>
                <span className="block text-xs text-[var(--ejo-text-muted)]">{v.company ? `${v.company} · ` : ''}{v.purpose} · {v.host.fullName}{v.expectedAt ? ` · ${formatDateTimeCompact(v.expectedAt)}` : ''}</span>
              </span>
              {roles.isGate ? <LoadingLink href={`/security/visitors/${v.id}`} className={btn}>Check in</LoadingLink> : null}
            </div>
          ))}
        </Panel>
        <Panel title="Exit passes approved — may leave" count={d.passesReady.length}>
          {d.passesReady.map((p) => (
            <div key={p.id} className={row}>
              <span className="min-w-0">
                <LoadingLink href={`/security/exit-passes/${p.id}`} className="font-medium text-[var(--ejo-primary)] hover:underline">{p.passNumber}</LoadingLink>
                <span className="block text-xs text-[var(--ejo-text-muted)]">{p.people.map((x) => x.name).join(', ')} · {p.returning ? 'returning' : 'not returning'}</span>
              </span>
              {roles.isGate ? <Act action="gate_out" idName="passId" id={p.id} label="Time out" form={exitPassActionFormAction} /> : null}
            </div>
          ))}
        </Panel>
        <Panel title="Out on exit passes" count={d.passesOut.length}>
          {d.passesOut.map((p) => (
            <div key={p.id} className={row}>
              <span className="min-w-0">
                <LoadingLink href={`/security/exit-passes/${p.id}`} className="font-medium text-[var(--ejo-primary)] hover:underline">{p.passNumber}</LoadingLink>
                <span className={`block text-xs ${exitPassOverdueMinutes(p, now) > 0 ? 'text-[var(--ejo-error)]' : 'text-[var(--ejo-text-muted)]'}`}>
                  {p.people.map((x) => x.name).join(', ')} · back by {p.expectedReturnAt ? formatDateTimeCompact(p.expectedReturnAt) : '—'}
                </span>
              </span>
              {roles.isGate ? <Act action="gate_in" idName="passId" id={p.id} label="Time in" form={exitPassActionFormAction} /> : null}
            </div>
          ))}
        </Panel>
        <Panel title="Vehicles cleared to leave" count={d.vehicles.length}>
          {d.vehicles.slice(0, 6).map((v) => (
            <div key={`${v.kind}-${v.id}`} className={row}>
              <span className="min-w-0 text-sm">
                {[v.vehicle.make, v.vehicle.model].filter(Boolean).join(' ') || 'Vehicle'} {v.vehicle.plateNumber ? `— ${v.vehicle.plateNumber}` : ''}
                <span className="block text-xs text-[var(--ejo-text-muted)]">{v.number} · {v.customer}</span>
              </span>
              <LoadingLink href={`/security/vehicles/release/${v.kind === 'JOB_CARD' ? 'job-card' : 'vehicle-service'}/${v.id}`} className="text-xs text-[var(--ejo-primary)] hover:underline">Confirm exit →</LoadingLink>
            </div>
          ))}
        </Panel>
      </div>
    </div>
  );
}
