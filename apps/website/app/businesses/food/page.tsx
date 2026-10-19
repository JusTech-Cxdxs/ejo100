import { BusinessPage, businessMetadata } from '@/components/site/BusinessPage';

export const metadata = businessMetadata('food');
export const revalidate = 300;

export default function Page() {
  return <BusinessPage slug="food" />;
}
