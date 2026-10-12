import { siteConfig } from '@/lib/site-config';
import { PagePlaceholder } from '@/components/PagePlaceholder';

export default function Page() {
  return <PagePlaceholder title="Our Businesses" description={`An overview of every ${siteConfig.organisationName} business unit.`} />;
}
