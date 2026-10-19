import type { Metadata } from 'next';
import { PageIntro } from '@/components/site/Page';
import { Store } from '@/components/store/Store';
import { Refer } from '@/components/store/Refer';
import { AdStrip } from '@/components/store/AdStrip';
import { CATEGORIES, type Category } from '@/lib/store/catalogue';
import { siteConfig } from '@/lib/site-config';

export const metadata: Metadata = { title: 'Store', description: 'SOUEAST SUVs, Isuzu and Foton trucks, pickups and buses, Bridgestone and Firestone tyres and genuine parts — with launch prices.' };

export default async function StorePage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
  const initial = CATEGORIES.some((x) => x.key === c) ? (c as Category) : 'all';
  return (
    <main>
      <PageIntro kicker="Store" title={<>Vehicles, tyres and parts. <br className="hidden sm:block" />Launch prices, this season.</>} lede={`Every model ${siteConfig.organisationName} sells in Nigeria, with indicative launch prices for this season. Pick a model to read about it, then reserve with the sales team, who confirm the price and availability within a working day. Online checkout is on its way.`} tone="dark" image="/images/business/automotive.jpg" />
      <AdStrip />
      <div className="px-4 sm:px-6"><Store initial={initial} /></div>
      <Refer />
    </main>
  );
}
