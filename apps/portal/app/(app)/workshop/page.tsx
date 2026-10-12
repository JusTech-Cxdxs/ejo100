import { OrgTrail } from '@/components/OrgTrail';
import { PageHeader, NavCard, type IconName } from '@/components/ui';

const sections: { name: string; href: string; desc: string; icon: IconName }[] = [
  { name: 'Customers', href: '/workshop/customers', icon: 'users', desc: 'Customer records and vehicle ownership history.' },
  { name: 'Vehicles', href: '/workshop/vehicles', icon: 'car', desc: 'Vehicle registry, chassis/VIN, and service history.' },
  { name: 'Job Cards', href: '/workshop/job-cards', icon: 'clipboard', desc: 'Active and past case files for every vehicle in the shop.' },
  { name: 'Vehicle Service', href: '/workshop/vehicle-service', icon: 'droplet', desc: 'Routine maintenance and minor requests — a genuinely lighter workflow than Job Card, with a real repair escalating into one.' },
  { name: 'Vehicles In Custody — Job Card', href: '/workshop/custody', icon: 'garage', desc: 'Every vehicle physically in the workshop under a Job Card, categorized by what needs attention.' },
  { name: 'Vehicles In Custody — Vehicle Service', href: '/workshop/vehicle-service-custody', icon: 'key', desc: 'Checked In, In Service, awaiting collection (with collection deadlines and reminders), and vehicles coming due or overdue.' },
  { name: 'Refunds', href: '/workshop/refunds', icon: 'refund', desc: 'Every refund paid back to a customer — RF receipt, Job Card or Service, amount, who received it, who refunded it, and printable receipts.' },
  { name: 'Service Tracker', href: '/workshop/service-tracker', icon: 'gauge', desc: 'Aftercare for every vehicle after it leaves — next service due, on track / due soon / overdue, reminder history, and follow-up actions.' },
  { name: 'Parts Requests', href: '/workshop/parts-requests', icon: 'package', desc: 'Store parts requested for Job Cards — Workshop HOD, Store, and release, in one place.' },
  { name: 'External Procurement', href: '/workshop/external-procurement', icon: 'cart', desc: 'Cash advance requests for externally-sourced parts and jobs.' },
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
    <div className="w-full p-4 sm:p-8">
      <PageHeader
        hero
        live
        icon="wrench"
        eyebrow="Module"
        title="Workshop"
        description={<>Every vehicle from check-in to collection — Job Cards, services, parts, refunds and aftercare. <span className="block text-xs"><OrgTrail /></span></>}
      />

      <div className="ejo-stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {sections.map((s) => (
          <NavCard key={s.href} href={s.href} icon={s.icon} title={s.name} description={s.desc} />
        ))}
      </div>
    </div>
  );
}
