import { redirect } from 'next/navigation';
import { allows } from '@/lib/authz/server';
import type { ReactNode } from 'react';
import { getSecurityDashboard, getSecurityRoles } from '@/lib/actions/security';
import { visitActionFormAction, exitPassActionFormAction } from '@/lib/actions/security-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { SecurityNav } from '@/components/SecurityNav';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { visitOverdueMinutes, exitPassOverdueMinutes, roadTestOverdueMinutes, durationText, VEHICLE_TYPE_LABEL } from '@/lib/security-rules';
import { formatDateTimeCompact } from '@/lib/utils/format-date';
import { PageHeader, HeaderAction, SectionCard, StatTile, Icon, type IconName, type Tone } from '@/components/ui';

const COMPOUND_ICON: Record<string, IconName> = {
  'Visitors on premises': 'badge', 'Visitor vehicles': 'car', 'Workshop vehicles': 'wrench', 'Cleared, not yet out': 'check-circle', 'Vehicles inside (total)': 'garage',
  'People out on passes': 'walk', 'On road test': 'road', 'Contractors on site': 'hardhat', 'Deliveries on site': 'truck', 'Open incidents': 'alert', Overdue: 'clock',
};
const btn = 'rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-3 py-1 text-xs font-medium text-white hover:opacity-90';

function Panel({ title, count, children, tone, icon = 'list' }: { title: string; count: number; children: ReactNode; tone?: Tone; icon?: IconName }) {
  return (
    <SectionCard icon={icon} tone={tone} title={<>{title} <span className="ml-1 rounded-full bg-[var(--ejo-bg)] px-2 py-0.5 text-xs font-semibold text-[var(--ejo-text-muted)] ring-1 ring-[var(--ejo-border)]">{count}</span></>}>
      {count === 0 ? <p className="flex items-center gap-2 text-xs text-[var(--ejo-text-muted)]"><Icon name="check" size={14} />None.</p> : children}
    </SectionCard>
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
  // Employees who are not on the Security desk use Security only for their own exit passes.
  if (!(await allows('security.view'))) redirect('/security/exit-passes');
  const { error } = await searchParams;
  const [d, roles] = await Promise.all([getSecurityDashboard(), getSecurityRoles()]);
  const now = new Date();
  const overdueVisits = d.onPremises.filter((v) => visitOverdueMinutes(v, now) > 0);
  const overduePasses = d.passesOut.filter((p) => exitPassOverdueMinutes(p, now) > 0);
  const overdueTests = d.roadTestsOut.filter((r) => roadTestOverdueMinutes(r, now) > 0);
  const row = 'flex flex-wrap items-center justify-between gap-2 border-b border-[var(--ejo-border)] py-2 text-sm last:border-0';

  return (
    <div className="w-full p-4 sm:p-8">
      <PageHeader
        hero
        live
        icon="lock"
        eyebrow="Module · Gate & reception"
        title="Security"
        description="Who is expected, who is here, who is out, and what may leave — live."
        actions={<>
          <HeaderAction href="/security/visitors#register" icon="user-plus">+ Visitor</HeaderAction>
          <HeaderAction href="/security/exit-passes/new" icon="exit">+ Exit pass</HeaderAction>
          <HeaderAction href="/security/vehicles" icon="car" variant="secondary">Vehicles leaving ({d.vehicles.length})</HeaderAction>
        </>}
      />
      <SecurityNav active="/security" />
      {error ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="error" message={error} /></div> : null}

      <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ejo-text-muted)]"><Icon name="pin" size={13} />In the compound now</h2>
      <div className="ejo-stagger mb-6 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-5">
        {([
          ['Visitors on premises', d.compound.visitors, d.compound.visits === d.compound.visitors ? 'Checked in, not yet out' : `People on ${d.compound.visits} ${d.compound.visits === 1 ? 'pass' : 'passes'} (groups counted in full)`, '/security/on-premises'],
          ['Visitor vehicles', d.compound.visitorVehicles, 'Cars, motorcycles… of visitors inside', '/security/vehicles-inside?type=visitor'],
          ['Workshop vehicles', d.compound.workshopVehicles, 'Job Cards and Vehicle Services not yet released (cancelled ones awaiting collection included)', '/security/vehicles-inside?type=workshop'],
          ['Cleared, not yet out', d.compound.awaitingExit, 'Released — waiting at the gate', '/security/vehicles'],
          ['Vehicles inside (total)', d.compound.vehiclesInside, 'Visitor, workshop, cleared and delivery vehicles', '/security/vehicles-inside'],
          ['People out on passes', d.compound.peopleOut, 'Employees and others on exit passes', '/security/people-out'],
          ['On road test', d.compound.onRoadTest, 'Workshop vehicles out on a road test', '/security/road-tests?tab=out'],
          ['Contractors on site', d.compound.contractorsOnSite, d.compound.contractorsAfterHours ? `${d.compound.contractorsAfterHours} ${d.compound.contractorsAfterHours === 1 ? 'team' : 'teams'} past 5 pm` : `${d.compound.contractorTeamsOnSite} ${d.compound.contractorTeamsOnSite === 1 ? 'team' : 'teams'} signed in`, '/security/contractors?tab=on_site'],
          ['Deliveries on site', d.compound.deliveriesOnSite, 'At the gate or received, not yet out', '/security/deliveries?tab=at_gate'],
          ['Open incidents', d.compound.openIncidents, 'Open or under review', '/security/incidents?tab=open'],
          ['Overdue', overdueVisits.length + overduePasses.length + overdueTests.length, 'Follow up or extend', '/security/overdue'],
        ] as const).map(([label, n, hint, href]) => (
          <StatTile key={label} icon={COMPOUND_ICON[label] ?? 'grid'} label={label} value={n} hint={hint} href={href} tone={(label === 'Overdue' || label === 'Open incidents') && n > 0 ? 'error' : 'brand'} emphasis={(label === 'Overdue' || label === 'Open incidents') && n > 0} />
        ))}
      </div>

      {overdueVisits.length + overduePasses.length + overdueTests.length > 0 ? (
        <div className="mb-6 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-error)]/40 bg-[var(--ejo-error)]/5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--ejo-error)]"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--ejo-error)]/12"><Icon name="clock" size={15} /></span>Overdue</h2>
            <LoadingLink href="/security/overdue" className="text-xs font-medium text-[var(--ejo-primary)] hover:underline">Follow up or extend →</LoadingLink>
          </div>
          <ul className="mt-2 space-y-1 text-sm">
            {overdueVisits.map((v) => (
              <li key={v.id}><LoadingLink href={`/security/visitors/${v.id}`} className="text-[var(--ejo-primary)] hover:underline">{v.visitorName}</LoadingLink> — visiting {v.host.fullName}, over by {durationText(visitOverdueMinutes(v, now))}</li>
            ))}
            {overdueTests.map((r) => (
              <li key={r.id}><LoadingLink href={`/security/road-tests/${r.id}`} className="text-[var(--ejo-primary)] hover:underline">{r.permitNumber}</LoadingLink> — {r.vehicle.plateNumber ?? 'vehicle'} on road test with {r.driver.fullName}, late by {durationText(roadTestOverdueMinutes(r, now))}</li>
            ))}
            {overduePasses.map((p) => (
              <li key={p.id}><LoadingLink href={`/security/exit-passes/${p.id}`} className="text-[var(--ejo-primary)] hover:underline">{p.passNumber}</LoadingLink> — {p.people.map((x) => x.name).join(', ')}, not back; over by {durationText(exitPassOverdueMinutes(p, now))}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel icon="badge" title="On premises now" count={d.onPremises.length}>
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
        <Panel icon="door" title="Checked in — not yet received at reception" count={d.atGateNotReceived.length} tone="warning">
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
        <Panel icon="calendar" title="Expected today" count={d.expectedToday.length}>
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
        <Panel icon="exit" title="Exit passes approved — may leave" count={d.passesReady.length}>
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
        <Panel icon="walk" title="Out on exit passes" count={d.passesOut.length}>
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
        <Panel icon="road" title="Road tests — approved, may go out" count={d.roadTestsReady.length}>
          {d.roadTestsReady.map((r) => (
            <div key={r.id} className={row}>
              <span className="min-w-0">
                <LoadingLink href={`/security/road-tests/${r.id}`} className="font-medium text-[var(--ejo-primary)] hover:underline">{r.permitNumber}</LoadingLink>
                <span className="block text-xs text-[var(--ejo-text-muted)]">{r.vehicle.plateNumber ?? 'Vehicle'} · driver {r.driver.fullName} · {durationText(r.expectedDurationMinutes)}</span>
              </span>
              {roles.isGate ? <LoadingLink href={`/security/road-tests/${r.id}`} className={btn}>Time out</LoadingLink> : null}
            </div>
          ))}
        </Panel>
        <Panel icon="gauge" title="Out on road test" count={d.roadTestsOut.length}>
          {d.roadTestsOut.map((r) => (
            <div key={r.id} className={row}>
              <span className="min-w-0">
                <LoadingLink href={`/security/road-tests/${r.id}`} className="font-medium text-[var(--ejo-primary)] hover:underline">{r.permitNumber}</LoadingLink>
                <span className={`block text-xs ${roadTestOverdueMinutes(r, now) > 0 ? 'text-[var(--ejo-error)]' : 'text-[var(--ejo-text-muted)]'}`}>{r.vehicle.plateNumber ?? 'Vehicle'} · {r.driver.fullName} · out {r.gateOutAt ? formatDateTimeCompact(r.gateOutAt) : '—'}</span>
              </span>
              {roles.isGate ? <LoadingLink href={`/security/road-tests/${r.id}`} className={btn}>Time in</LoadingLink> : null}
            </div>
          ))}
        </Panel>
        <Panel icon="car" title="Vehicles cleared to leave" count={d.vehicles.length}>
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
