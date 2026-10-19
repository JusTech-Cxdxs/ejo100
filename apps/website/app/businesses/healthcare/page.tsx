import { BusinessPage, businessMetadata } from '@/components/site/BusinessPage';

export const metadata = businessMetadata('healthcare');
export const revalidate = 300;

export default function Page() {
  return <BusinessPage slug="healthcare" />;
}
