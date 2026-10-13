import { websiteBaseUrl } from '@/lib/site-urls';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { SiteChrome } from '@/components/SiteChrome';
import { ThemeProvider } from '@/lib/theme';
import { I18nProvider } from '@/lib/i18n';
import { siteConfig } from '@/lib/site-config';
import { themeInitScript } from '@/lib/theme-init-script';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: siteConfig.tagline ? `${siteConfig.organisationName} | ${siteConfig.tagline}` : siteConfig.organisationName,
    template: `%s | ${siteConfig.companyShortName}`,
  },
  description: siteConfig.description || undefined,
  metadataBase: websiteBaseUrl() ? new URL(websiteBaseUrl()) : undefined,
  openGraph: {
    title: siteConfig.companyShortName,
    description: siteConfig.description || siteConfig.tagline || undefined,
    siteName: siteConfig.companyShortName,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: siteConfig.companyShortName,
    description: siteConfig.description || siteConfig.tagline || undefined,
  },
  // Made from public/images/logo/logo.png (public/icons).
  icons: {
    icon: [{ url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' }, { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
    shortcut: '/icons/favicon-32.png',
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
  // Added to an iPhone's home screen, the customer portal opens full screen.
  appleWebApp: { capable: true, title: siteConfig.organisationName, statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#16a34a' },
    { media: '(prefers-color-scheme: dark)', color: '#06120a' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <ThemeProvider>
          <I18nProvider>
            <SiteChrome><Header /></SiteChrome>
            {children}
            <SiteChrome><Footer /></SiteChrome>
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
