import type { Metadata } from 'next';
import { PageIntro, Prose, Section } from '@/components/site/Page';
import { siteConfig } from '@/lib/site-config';
import { HEAD_OFFICE } from '@/lib/content/group';

export const metadata: Metadata = { title: 'Privacy', description: 'What this website and the customer portal collect, why, how long it is kept, and your rights under the Nigeria Data Protection Act 2023.' };

export default function PrivacyPage() {
  const name = siteConfig.organisationName;
  return (
    <main>
      <PageIntro kicker="Privacy" title="What we collect, and why" lede="Plain words about the data this website and the customer portal handle, written to the Nigeria Data Protection Act 2023. Last reviewed October 2026." />
      <Section narrow>
        <Prose>
          <h2 className="text-2xl font-bold">Who is responsible</h2>
          <p>{name}, {HEAD_OFFICE.address}, is the data controller for this website and the customer portal. Questions and requests about your data: use the contact page and choose “Something else”, or write to the head office.</p>

          <h2 className="text-2xl font-bold">Browsing this website</h2>
          <p>We count visits to know which pages are read and for how long. The count is anonymous and uses no cookie: a visitor is a one-way code made from the day, the internet address and the browser, which cannot be turned back into either and changes every day. Page addresses are stored without identifiers; the customer portal is not counted; browsers that send “Do Not Track” or Global Privacy Control are not counted. Counts are kept for 13 months.</p>
          <p>The site sets no advertising or analytics cookies from third parties.</p>

          <h2 className="text-2xl font-bold">The assistant (chat)</h2>
          <p>If you chat with our assistant, the conversation is stored for 90 days so you can continue it, and a random cookie (no personal data) keeps it on your browser for that time. If you ask to talk to a person, the name and contact details you give are passed to our team as a support request, with a reference you can follow. Chats may be used, with identifying details removed, to improve the assistant’s answers.</p>

          <h2 className="text-2xl font-bold">The contact form and support requests</h2>
          <p>What you write, with your name and the email address or phone number you leave, becomes a support request in our Support centre. It is used to answer you and kept for three years after it is closed. It is seen by the team that handles the topic and by their managers.</p>

          <h2 className="text-2xl font-bold">The customer portal</h2>
          <p>Customers of our automotive businesses sign in to see their vehicles, estimates, payments, warranties and requests. The portal uses a sign-in cookie and stores your account, your vehicles’ service records and the messages you exchange with us. Records are kept for the life of the customer relationship and for the period company and tax law require afterwards.</p>

          <h2 className="text-2xl font-bold">Your rights</h2>
          <p>You can ask to see the personal data we hold about you, to have it corrected, or — where the law allows — to have it deleted or to object to its use. We answer within thirty days. You can also complain to the Nigeria Data Protection Commission.</p>

          <h2 className="text-2xl font-bold">Security</h2>
          <p>Data is held on servers with encryption in transit and at rest, access limited to the people whose job needs it, and every access to customer records logged. We do not sell personal data.</p>
        </Prose>
      </Section>
    </main>
  );
}
