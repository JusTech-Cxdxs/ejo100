import { HeroSlider } from '@/components/site/HeroSlider';
import { StatsSection } from '@/components/site/StatsSection';
import { AboutSection } from '@/components/site/AboutSection';
import { BusinessUnitsSection } from '@/components/site/BusinessUnitsSection';
import { NewsSection } from '@/components/site/NewsSection';
import { PartnersMarquee } from '@/components/site/PartnersMarquee';
import { CTASection } from '@/components/site/CTASection';
import { OffersSection } from '@/components/site/OffersSection';
import { TestimonialsSection } from '@/components/site/TestimonialsSection';

/** The home page is rebuilt every five minutes (the news section reads News & media). */
export const revalidate = 300;

export default function HomePage() {
  return (
    <main>
      <HeroSlider />
      <StatsSection />
      <AboutSection />
      <OffersSection />
      <BusinessUnitsSection />
      <TestimonialsSection />
      <NewsSection />
      <PartnersMarquee />
      <CTASection />
    </main>
  );
}
