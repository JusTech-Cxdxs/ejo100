import { BusinessPage, businessMetadata } from '@/components/site/BusinessPage';
import { LinkRow, Section } from '@/components/site/Page';

export const metadata = businessMetadata('automotive');
export const revalidate = 300;

export default function Page() {
  return (
    <BusinessPage slug="automotive">
      <Section title="Sales, service and parts" lead="Three doors into the same business: buy a vehicle, keep it running, and get the right part the first time.">
        <div className="max-w-3xl">
          <LinkRow href="/businesses/automotive/vehicle-sales" title="Vehicle sales" text="Trucks, pickups, buses and SUVs — showroom, test drives and fleet programmes." />
          <LinkRow href="/businesses/automotive/workshop" title="Workshop" text="Maintenance, diagnostics, body and paint, with every job followed in the customer portal." />
          <LinkRow href="/businesses/automotive/spare-parts" title="Spare parts and tyres" text="Genuine parts, Bridgestone and Firestone tyres, batteries and lubricants." />
        </div>
      </Section>
    </BusinessPage>
  );
}
