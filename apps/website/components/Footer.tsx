'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { useI18n, type TranslationKey } from '@/lib/i18n';
import { siteConfig } from '@/lib/site-config';
import { SiteWordmark } from './SiteWordmark';
import { FooterBadge } from './FooterBadge';
import { PoweredByBadge } from './PoweredByBadge';
import { FacebookIcon, LinkedInIcon, XIcon, YouTubeIcon, InstagramIcon } from './icons';

// Social links come from lib/site-config.ts; only the ones that are set show.
const SOCIALS = [
  { label: 'Facebook', icon: FacebookIcon, href: siteConfig.social.facebook },
  { label: 'LinkedIn', icon: LinkedInIcon, href: siteConfig.social.linkedin },
  { label: 'X (Twitter)', icon: XIcon, href: siteConfig.social.x },
  { label: 'YouTube', icon: YouTubeIcon, href: siteConfig.social.youtube },
  { label: 'Instagram', icon: InstagramIcon, href: siteConfig.social.instagram },
].filter((s) => s.href);

// Upload up to three files to public/images/footer-badges/ with these exact
// names; the trimmed copies in /trim (no transparent margins) are what is shown.
const BADGES = [
  { src: '/images/footer-badges/trim/footer-badge-1.png', alt: 'ISO certified' },
  { src: '/images/footer-badges/trim/footer-badge-2.png', alt: 'Five-star rated' },
  { src: '/images/footer-badges/trim/footer-badge-3.png', alt: 'Award of excellence' },
];

const QUICK_LINKS: [TranslationKey, string][] = [
  ['nav.about', '/about'],
  ['nav.businesses', '/businesses'],
  ['nav.investors', '/investors'],
  ['nav.sustainability', '/sustainability'],
  ['nav.careers', '/careers'],
  ['nav.news', '/news'],
  ['nav.contact', '/contact'],
];

const BUSINESS_LINKS: [TranslationKey, string][] = [
  ['business.automotive', '/businesses/automotive'],
  ['business.agriculture', '/businesses/agriculture'],
  ['business.manufacturing', '/businesses/manufacturing'],
  ['business.food', '/businesses/food'],
  ['business.logistics', '/businesses/logistics'],
  ['business.healthcare', '/businesses/healthcare'],
];

export function Footer() {
  const { t } = useI18n();
  const contact = siteConfig.contact;
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  function handleSubscribe(e: FormEvent) {
    e.preventDefault();
    // There is no newsletter service yet; this only acknowledges the sign-up.
    setSubscribed(true);
    setEmail('');
  }

  return (
    <footer className="relative bg-[var(--ejo-secondary)] text-white">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-x-6 gap-y-10 px-4 py-14 sm:px-6 md:grid-cols-6 md:py-16">
        {/* Column 1 — logo, name, description, badge row, social icons */}
        <div className="col-span-2">
          <SiteWordmark tone="light" size="footer" />
          <p className="mt-3 max-w-xs text-sm text-white/60">{t('footer.companyDescription')}</p>

          {/* Three badges in one row, small and never stretched: each box is a fixed
              height, the picture keeps its proportions inside it. */}
          <div className="mt-5 flex flex-nowrap items-center gap-3" aria-label="Certifications and awards">
            {BADGES.map((badge) => (
              <FooterBadge key={badge.src} src={badge.src} alt={badge.alt} />
            ))}
          </div>

          {SOCIALS.length > 0 ? (
          <div className="mt-5 flex gap-3">
            {SOCIALS.map(({ label, icon: Icon, href }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={label}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 hover:bg-[var(--ejo-primary)]"
              >
                <Icon />
              </a>
            ))}
          </div>
          ) : null}
        </div>

        <FooterColumn title={t('footer.quickLinks')} links={QUICK_LINKS} />
        <FooterColumn title={t('footer.ourBusinesses')} links={BUSINESS_LINKS} />

        <div className="col-span-2 sm:col-span-1">
          <p className="text-sm font-semibold text-white">{t('footer.contactUs')}</p>
          <address className="mt-3 space-y-2 text-sm not-italic text-white/60">
            <p>{t('footer.headOffice')}</p>
            {contact.address ? <p>{contact.address}</p> : null}
            {contact.phone ? <p><a href={`tel:${contact.phone.replace(/[^\d+]/g, '')}`} className="hover:text-white">{contact.phone}</a></p> : null}
            {contact.email ? <p><a href={`mailto:${contact.email}`} className="hover:text-white">{contact.email}</a></p> : null}
          </address>
        </div>

        <div className="col-span-2 sm:col-span-1">
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
                className="min-h-11 w-full min-w-0 rounded-full border border-white/20 bg-white/5 px-4 py-2 text-sm text-white placeholder-white/40 outline-none focus:border-[var(--ejo-primary)]"
              />
              <button
                type="submit"
                aria-label="Subscribe"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--ejo-primary)] hover:opacity-90"
              >
                →
              </button>
            </form>
          )}
        </div>
      </div>

      <div className="border-t border-white/10 px-4 py-6 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <p className="text-xs text-white/50">
            © {new Date().getFullYear()} {siteConfig.legalName}. {t('footer.rights')}
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

function FooterColumn({ title, links }: { title: string; links: [TranslationKey, string][] }) {
  const { t } = useI18n();
  return (
    <div>
      <p className="text-sm font-semibold text-white">{title}</p>
      <ul className="mt-3 space-y-1">
        {links.map(([key, href]) => (
          <li key={href}>
            <Link href={href} className="inline-block py-1 text-sm text-white/60 hover:text-[var(--ejo-accent)]">
              {t(key)}
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
