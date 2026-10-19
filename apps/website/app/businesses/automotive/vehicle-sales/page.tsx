import type { Metadata } from 'next';
import { Button, PageIntro, Prose, Section } from '@/components/site/Page';

export const metadata: Metadata = { title: 'Vehicle sales', description: 'SOUEAST SUVs, Isuzu and Foton trucks, Mitsubishi, Jeep, Dodge, Fiat and Chery — new vehicles with warranty and after-sales in Lagos.' };

const RANGE = [
  { brand: 'SOUEAST', what: 'S05, S06, S07 and S09 SUVs — the S06 and S07 assembled in Lagos. Five-year or 100,000 km warranty.' },
  { brand: 'Isuzu', what: 'Light and medium trucks and pickups, sold and serviced by Koncept Autocentre.' },
  { brand: 'Foton', what: 'Trucks, pickups and minibuses — Nigeria’s first locally assembled truck came off our line in 2016.' },
  { brand: 'Mitsubishi', what: 'Pickups and SUVs through Massilia Motors, the group’s joint venture with CFAO.' },
  { brand: 'Jeep, Dodge, Fiat, Chery', what: 'SUVs, sedans and crossovers for families and fleets.' },
];

export default function VehicleSalesPage() {
  return (
    <main>
      <PageIntro kicker="Automotive" title="Vehicle sales" lede="New trucks, pickups, buses and SUVs from the brands we represent — with the warranty, parts and workshop behind them in the same group." tone="dark" image="/images/business/automotive.jpg">
        <div className="flex flex-wrap gap-3"><Button href="/contact?topic=sales" variant="light">Ask for a quote or test drive</Button></div>
      </PageIntro>
      <Section title="The range">
        <div className="divide-y divide-[var(--ejo-border)]">
          {RANGE.map((r) => (
            <div key={r.brand} className="grid gap-2 py-5 sm:grid-cols-[14rem_minmax(0,1fr)] sm:gap-6"><h3 className="text-xl font-semibold">{r.brand}</h3><p className="leading-relaxed text-[var(--ejo-text-muted)]">{r.what}</p></div>
          ))}
        </div>
      </Section>
      <Section tone="tint" title="For fleets" lead="Businesses that run ten vehicles or a thousand.">
        <Prose>
          <p>Fleet buyers get one account manager, scheduled servicing across the fleet, parts stocked for the models they run, and reporting on what each vehicle has cost. Assembly in Lagos means delivery times measured in weeks, not a season at sea.</p>
          <p>Tell us the routes, the loads and the drivers, and we will specify the vehicles with you.</p>
        </Prose>
        <div className="mt-8"><Button href="/contact?topic=sales">Talk to the fleet team</Button></div>
      </Section>
    </main>
  );
}
