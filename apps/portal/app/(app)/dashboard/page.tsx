import { getWorkshopDashboardCounts } from '@/lib/actions/workshop';

/**
 * Real counts from the database — no hardcoded numbers. If there are no
 * Job Cards/customers/vehicles yet, these correctly show 0, not a fake
 * production-looking figure. See lib/actions/workshop.ts for the queries.
 */
export default async function DashboardPage() {
  const counts = await getWorkshopDashboardCounts();

  const stats = [
    { label: 'Active Job Cards', value: counts.activeJobCards },
    { label: 'Vehicles Currently In Workshop', value: counts.inWorkshop },
    { label: 'Total Customers', value: counts.totalCustomers },
    { label: 'Total Vehicles Registered', value: counts.totalVehicles },
  ];

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Dashboard</h1>
      <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">
        Kewalram Nigeria — Automobile Division — Lagos State — Isolo Branch — Workshop
      </p>

      <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5"
          >
            <p className="text-2xl font-bold text-[var(--ejo-primary)]">{s.value}</p>
            <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
        <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Modules</h2>
        <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">
          Workshop is live for Kewalram Nigeria — Automobile Division. Additional business units
          activate here as they&apos;re approved, with no change to this dashboard&apos;s structure.
        </p>
      </div>
    </div>
  );
}
