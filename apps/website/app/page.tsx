import { redirect } from 'next/navigation';

/**
 * The Zinox edition has no public marketing site: this app is the customer
 * and dealer portal. The root goes straight to its sign-in page.
 */
export default function HomePage() {
  redirect('/customer-portal');
}
