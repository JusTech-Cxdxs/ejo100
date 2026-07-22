const stats = [
  { label: 'Active Jobs', value: '32' },
  { label: 'Pending Approvals', value: '7' },
  { label: 'Vehicles In Workshop', value: '18' },
  { label: 'Technicians On Duty', value: '11' },
];

export default function DashboardPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Welcome back, John 👋</h1>
      <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">
        Here&apos;s what&apos;s happening at Isolo Branch — Workshop today.
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
