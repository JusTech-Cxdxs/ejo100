import { BusinessPage, businessMetadata } from '@/components/site/BusinessPage';

export const metadata = businessMetadata('manufacturing');
export const revalidate = 300;

export default function Page() {
  return <BusinessPage slug="manufacturing" />;
}
