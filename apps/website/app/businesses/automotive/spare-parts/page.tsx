import type { Metadata } from 'next';
import { Button, PageIntro, Prose, Section } from '@/components/site/Page';

export const metadata: Metadata = { title: 'Spare parts and tyres', description: 'Genuine parts for the brands we sell, Bridgestone and Firestone tyres, batteries and lubricants, from the group’s own store.' };

export default function SparePartsPage() {
  return (
    <main>
      <PageIntro kicker="Automotive" title="Spare parts and tyres" lede="Genuine parts for the vehicles we sell, Bridgestone and Firestone tyres through Asahi Brands, Bosch components, batteries and lubricants — from a store that stocks for the roads here." tone="dark" image="/images/business/automotive.jpg">
        <div className="flex flex-wrap gap-3"><Button href="/contact?topic=parts" variant="light">Ask about a part</Button></div>
      </PageIntro>
      <Section title="What the store carries">
        <div className="grid gap-10 lg:grid-cols-2">
          <Prose>
            <p><strong>Genuine parts</strong> for SOUEAST, Isuzu, Foton, Mitsubishi, Jeep, Dodge, Fiat and Chery — filters, brakes, suspension, electrical, body panels and glass — matched to the vehicle by chassis number so the first part fitted is the right one.</p>
            <p><strong>Tyres</strong>: Bridgestone and Firestone, passenger to truck sizes, fitted and balanced in the workshop, with wheel alignment.</p>
            <p><strong>Consumables</strong>: batteries, lubricants, coolants, wiper blades and bulbs for everyday servicing.</p>
          </Prose>
          <Prose>
            <p>Parts for a job in our workshop are reserved from the store the moment the estimate is approved, so the job is never waiting on a part that has gone elsewhere. Parts for your own mechanic are sold over the counter with a receipt and a warranty.</p>
            <p>Not in stock? We source it through the brand’s own supply chain and tell you the date.</p>
          </Prose>
        </div>
      </Section>
    </main>
  );
}
