import type { Metadata } from 'next';
import { Button, LinkRow, PageIntro, Section } from '@/components/site/Page';

export const metadata: Metadata = { title: 'Services', description: 'Workshop service and repairs, fleet programmes, parts supply, agricultural services, logistics and distribution.' };

export default function ServicesPage() {
  return (
    <main>
      <PageIntro kicker="Services" title="What we do for you" lede="Service that stays with the product: the workshop behind every vehicle we sell, agronomy behind every bag of seed, distribution behind every carton." />
      <Section title="Automotive">
        <div className="max-w-3xl">
          <LinkRow href="/businesses/automotive/workshop" title="Workshop service and repairs" text="Maintenance, diagnostics, mechanical, electrical, body and paint — every job followed online." />
          <LinkRow href="/businesses/automotive/vehicle-sales" title="Fleet programmes" text="One account manager, scheduled servicing, stocked parts and cost reporting for business fleets." />
          <LinkRow href="/businesses/automotive/spare-parts" title="Parts and tyre fitting" text="Genuine parts, Bridgestone and Firestone tyres, batteries and lubricants, fitted and balanced." />
          <LinkRow href="/customer-portal" title="The customer portal" text="Your vehicles, estimates to approve, payments, warranties and support requests, in one place." />
        </div>
      </Section>
      <Section tone="tint" title="Agriculture, food and logistics">
        <div className="max-w-3xl">
          <LinkRow href="/businesses/agriculture" title="Agronomy and farm supply" text="Seed, crop protection and fertiliser advice for growers, with tractors serviced and parts stocked." />
          <LinkRow href="/businesses/agriculture" title="Grain and oilseed processing" text="Cleaning, sorting and milling to export grade in Kano, Zaria and Yola." />
          <LinkRow href="/businesses/food" title="Food distribution" text="Sunola and staples to wholesalers and retailers across Nigeria." />
          <LinkRow href="/businesses/logistics" title="Logistics" text="Vehicle and parts distribution, agricultural haulage, warehousing, clearing." />
        </div>
      </Section>
      <Section tone="dark" title="Not sure which team?" lead="Write once; your message reaches the right people and you get a reference to follow.">
        <Button href="/contact" variant="light">Contact us</Button>
      </Section>
    </main>
  );
}
