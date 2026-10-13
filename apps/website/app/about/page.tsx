import { siteConfig } from '@/lib/site-config';
import { PagePlaceholder } from '@/components/PagePlaceholder';

export default function Page() {
  return <PagePlaceholder title={`About ${siteConfig.legalName}`} description="Our organisation overview, history, leadership and governance." />;
}
