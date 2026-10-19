import type { Metadata } from 'next';
import { PageIntro, Prose, Section } from '@/components/site/Page';
import { siteConfig } from '@/lib/site-config';

export const metadata: Metadata = { title: 'Terms of use', description: 'The terms on which this website and the customer portal are provided.' };

export default function TermsPage() {
  const name = siteConfig.organisationName;
  return (
    <main>
      <PageIntro kicker="Terms of use" title="Using this website" lede="Short, because it should be. Last reviewed October 2026." />
      <Section narrow>
        <Prose>
          <h2 className="text-2xl font-bold">The website</h2>
          <p>This website is published by {name} to describe its businesses and to let customers and partners reach it. Its content is information, not an offer: prices, availability, specifications and warranty terms are confirmed in writing by the company that sells the product.</p>
          <h2 className="text-2xl font-bold">The assistant</h2>
          <p>The assistant answers from the group’s published information and, for signed-in customers, from their own records. It can make mistakes. Anything that matters — a price, a date, a diagnosis — is confirmed by a person before you rely on it.</p>
          <h2 className="text-2xl font-bold">The customer portal</h2>
          <p>Your sign-in is yours alone. Approving an estimate in the portal authorises the work it describes; payments recorded there are receipts. If you believe someone else has used your account, tell us at once through the portal or the contact page.</p>
          <h2 className="text-2xl font-bold">Content</h2>
          <p>Text, photographs and the group’s marks belong to {name} or are used with permission; third-party brand names and logos belong to their owners and appear to identify the products the group sells. You may quote this site with attribution; you may not copy it to pass off as your own.</p>
          <h2 className="text-2xl font-bold">Law</h2>
          <p>These terms are governed by the laws of the Federal Republic of Nigeria.</p>
        </Prose>
      </Section>
    </main>
  );
}
