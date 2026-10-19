import type { Metadata } from 'next';
import Link from 'next/link';
import { Button, PageIntro, Section } from '@/components/site/Page';

export const metadata: Metadata = { title: 'Products', description: 'Vehicles, tyres and parts, farm inputs, foods and healthcare products from the group’s businesses in Nigeria.' };

const LINES: { group: string; href: string; items: { name: string; text: string }[] }[] = [
  { group: 'Vehicles', href: '/businesses/automotive/vehicle-sales', items: [
    { name: 'SOUEAST SUVs', text: 'S05, S06, S07, S09 — the S06 and S07 assembled in Lagos; five-year or 100,000 km warranty.' },
    { name: 'Isuzu trucks and pickups', text: 'Light and medium commercial vehicles through Koncept Autocentre.' },
    { name: 'Foton trucks, pickups and minibuses', text: 'Assembled at the group’s Lagos hub since 2016.' },
    { name: 'Mitsubishi, Jeep, Dodge, Fiat, Chery', text: 'Pickups, SUVs, sedans and crossovers.' },
  ] },
  { group: 'Tyres, parts and consumables', href: '/businesses/automotive/spare-parts', items: [
    { name: 'Bridgestone and Firestone tyres', text: 'Passenger, SUV, light-truck and truck sizes, fitted and balanced.' },
    { name: 'Genuine spare parts', text: 'For every brand we sell, matched by chassis number.' },
    { name: 'Bosch components, batteries and lubricants', text: 'For servicing and repairs.' },
  ] },
  { group: 'Farm inputs and machinery', href: '/businesses/agriculture', items: [
    { name: 'Seeds and crop protection', text: 'Springfield Agro’s range for grain, vegetable and cash-crop growers.' },
    { name: 'Fertiliser', text: 'Blends for Nigerian soils and seasons.' },
    { name: 'Tractors and implements', text: 'Sold with service and parts.' },
  ] },
  { group: 'Foods', href: '/businesses/food', items: [
    { name: 'Sunola cooking oil', text: 'Refined vegetable oil in household and catering sizes.' },
    { name: 'Grains and staples', text: 'Cleaned and packed for retail and wholesale.' },
    { name: 'Poultry feed', text: 'From the Zaria mills, for commercial farms.' },
  ] },
  { group: 'Healthcare', href: '/businesses/healthcare', items: [
    { name: 'Pharmaceuticals', text: 'Imported and distributed by Chanrai Healthcare to hospitals and pharmacies.' },
  ] },
];

export default function ProductsPage() {
  return (
    <main>
      <PageIntro kicker="Products" title="What we make and sell" lede="From an SUV assembled in Isolo to a bottle of Sunola on a kitchen shelf. Every product line below is sold and supported by the business that makes or imports it." />
      <Section>
        <div className="space-y-14">
          {LINES.map((l) => (
            <div key={l.group} className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
              <div><h2 className="text-2xl font-bold tracking-[-0.01em]">{l.group}</h2><Link href={l.href} className="mt-2 inline-block font-semibold text-[var(--ejo-primary)] hover:underline">The business →</Link></div>
              <ul className="divide-y divide-[var(--ejo-border)]">
                {l.items.map((i) => <li key={i.name} className="py-4"><h3 className="font-semibold">{i.name}</h3><p className="mt-1 text-[15px] leading-relaxed text-[var(--ejo-text-muted)]">{i.text}</p></li>)}
              </ul>
            </div>
          ))}
        </div>
      </Section>
      <Section tone="dark" title="Looking for a price, a part or a dealer?" lead="Tell us what you need and the right company will answer — with a reference number you can follow.">
        <div className="flex flex-wrap gap-3"><Button href="/contact" variant="light">Contact us</Button><Button href="/customer-portal" variant="line" className="border-white/30 text-white hover:bg-white/10">Customer portal</Button></div>
      </Section>
    </main>
  );
}
