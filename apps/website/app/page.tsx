import { HeroSlider } from '@/components/site/HeroSlider';
import { StatsSection } from '@/components/site/StatsSection';
import { AboutSection } from '@/components/site/AboutSection';
import { BusinessUnitsSection } from '@/components/site/BusinessUnitsSection';
import { NewsSection } from '@/components/site/NewsSection';
import { PartnersMarquee } from '@/components/site/PartnersMarquee';
import { CTASection } from '@/components/site/CTASection';

export default function HomePage() {
  return (
    <main>
      <HeroSlider />
      <StatsSection />
      <AboutSection />
      <BusinessUnitsSection />
      <NewsSection />
      <PartnersMarquee />
      <CTASection />
    </main>
  );
}
