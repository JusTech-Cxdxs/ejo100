import { LoadingLink } from '@/components/LoadingLink';

const sections = [
  { name: 'Customers', href: '/workshop/customers', desc: 'Customer records and vehicle ownership history.' },
  { name: 'Vehicles', href: '/workshop/vehicles', desc: 'Vehicle registry, chassis/VIN, and service history.' },
  { name: 'Job Cards', href: '/workshop/job-cards', desc: 'Active and past case files for every vehicle in the shop.' },
  { name: 'Vehicle Service', href: '/workshop/vehicle-service', desc: 'Routine maintenance and minor requests — a genuinely lighter workflow than Job Card, with a real repair escalating into one.' },
  { name: 'Vehicles In Custody — Job Card', href: '/workshop/custody', desc: 'Every vehicle physically in the workshop under a Job Card, categorized by what needs attention.' },
  { name: 'Vehicles In Custody — Vehicle Service', href: '/workshop/vehicle-service-custody', desc: 'Checked In, In Service, awaiting collection (with collection deadlines and reminders), and vehicles coming due or overdue.' },
  { name: 'Service Tracker', href: '/workshop/service-tracker', desc: 'Aftercare for every vehicle after it leaves — next service due, on track / due soon / overdue, reminder history, and follow-up actions.' },
  { name: 'Parts Requests', href: '/workshop/parts-requests', desc: 'Store parts requested for Job Cards — Workshop HOD, Store, and release, in one place.' },
  { name: 'External Procurement', href: '/workshop/external-procurement', desc: 'Cash advance requests for externally-sourced parts and jobs.' },
];

/**
 * Workshop module landing page. This is the only fully-scoped business
 * module for Phase One (per the project constitution) — its sub-pages
 * exist and are structured, but business logic (creating a job card,
 * the approval workflow, inventory deduction, etc.) arrives in Phase 4+
 * per the incremental build rule.
 */
export default function WorkshopPage() {
  return (
    <div className="p-8">
      <div className="mb-2 flex items-center gap-2">
        <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Workshop</h1>
        <span className="rounded-full bg-[var(--ejo-success)]/15 px-2.5 py-0.5 text-xs font-medium text-[var(--ejo-success)]">
          Live
        </span>
      </div>
      <p className="mb-8 text-sm text-[var(--ejo-text-muted)]">
        Kewalram Nigeria — Automobile Division — Lagos State — Isolo Branch
      </p>

      <div className="grid gap-6 md:grid-cols-3">
        {sections.map((s) => (
          <LoadingLink
            key={s.href}
            href={s.href}
            className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6 transition-shadow hover:shadow-md"
          >
            <h3 className="font-semibold text-[var(--ejo-text)]">{s.name}</h3>
            <p className="mt-2 text-sm text-[var(--ejo-text-muted)]">{s.desc}</p>
          </LoadingLink>
        ))}
      </div>
    </div>
  );
}
