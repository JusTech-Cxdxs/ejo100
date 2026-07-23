'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { siteConfig } from '@/lib/site-config';
import { useI18n } from '@/lib/i18n';
import { PoweredByBadge } from './PoweredByBadge';
import { FacebookIcon, LinkedInIcon, XIcon, YouTubeIcon, InstagramIcon } from './icons';

const SOCIALS = [
  { label: 'Facebook', icon: FacebookIcon, href: '#' },
  { label: 'LinkedIn', icon: LinkedInIcon, href: '#' },
  { label: 'X (Twitter)', icon: XIcon, href: '#' },
  { label: 'YouTube', icon: YouTubeIcon, href: '#' },
  { label: 'Instagram', icon: InstagramIcon, href: '#' },
];

export function Footer() {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  function handleSubscribe(e: FormEvent) {
    e.preventDefault();
    // No newsletter backend wired up yet — this just confirms the intent
    // was captured client-side so the form isn't a dead end.
    setSubscribed(true);
    setEmail('');
  }

  return (
    <footer className="relative bg-[var(--ejo-secondary)] text-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-6 py-16 md:grid-cols-6">
        <div className="md:col-span-2">
          <p className="text-lg font-bold">{siteConfig.companyName}</p>
          <p className="mt-3 max-w-xs text-sm text-white/60">
            A spirit of entrepreneurship that has driven the success of our businesses for over 150 years.
          </p>
          <div className="mt-5 flex gap-3">
            {SOCIALS.map(({ label, icon: Icon, href }) => (
              <a
                key={label}
                href={href}
                aria-label={label}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 hover:bg-[var(--ejo-primary)]"
              >
                <Icon />
              </a>
            ))}
          </div>
        </div>

        <FooterColumn
          title={t('footer.quickLinks')}
          links={[
            ['About Us', '/about'],
            ['Our Businesses', '/businesses'],
            ['Investors', '/investors'],
            ['Sustainability', '/sustainability'],
            ['Careers', '/careers'],
            ['News & Media', '/news'],
            ['Contact Us', '/contact'],
          ]}
        />
        <FooterColumn
          title={t('footer.ourBusinesses')}
          links={[
            ['Automotive', '/businesses/automotive'],
            ['Agriculture', '/businesses/agriculture'],
            ['Manufacturing', '/businesses/manufacturing'],
            ['Food', '/businesses/food'],
            ['Logistics', '/businesses/logistics'],
            ['Healthcare', '/businesses/healthcare'],
          ]}
        />
        <div>
          <p className="text-sm font-semibold text-white">{t('footer.contactUs')}</p>
          <address className="mt-3 space-y-2 text-sm not-italic text-white/60">
            <p>Kewalram Chanrai Group Head Office</p>
            <p>Lagos, Nigeria</p>
            <p>info@kewalram.com</p>
          </address>
        </div>

        <div>
          <p className="text-sm font-semibold text-white">{t('footer.newsletter')}</p>
          <p className="mt-3 text-sm text-white/60">{t('footer.newsletterText')}</p>
          {subscribed ? (
            <p className="mt-4 text-sm text-[var(--ejo-accent)]">{t('footer.newsletterSuccess')}</p>
          ) : (
            <form onSubmit={handleSubscribe} className="mt-4 flex gap-2">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('footer.newsletterPlaceholder')}
                className="w-full rounded-full border border-white/20 bg-white/5 px-4 py-2 text-sm text-white placeholder-white/40 outline-none focus:border-[var(--ejo-primary)]"
              />
              <button
                type="submit"
                aria-label="Subscribe"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--ejo-primary)] hover:opacity-90"
              >
                →
              </button>
            </form>
          )}
        </div>
      </div>

      <div className="border-t border-white/10 px-6 py-6">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <p className="text-xs text-white/50">
            © {new Date().getFullYear()} {siteConfig.companyName}. {t('footer.rights')}
          </p>
          <div className="flex flex-wrap items-center gap-5 text-xs text-white/50">
            <Link href="/privacy" className="hover:text-white">{t('footer.privacy')}</Link>
            <Link href="/terms" className="hover:text-white">{t('footer.terms')}</Link>
            <PoweredByBadge />
          </div>
        </div>
      </div>

      <BackToTop />
    </footer>
  );
}

function FooterColumn({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <p className="text-sm font-semibold text-white">{title}</p>
      <ul className="mt-3 space-y-2">
        {links.map(([label, href]) => (
          <li key={href}>
            <Link href={href} className="text-sm text-white/60 hover:text-[var(--ejo-accent)]">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BackToTop() {
  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="Back to top"
      className="absolute -top-6 right-6 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--ejo-primary)] text-white shadow-lg transition-transform hover:-translate-y-1"
    >
      ↑
    </button>
  );
}
