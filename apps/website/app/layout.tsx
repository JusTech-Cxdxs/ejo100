import { websiteBaseUrl } from '@/lib/site-urls';
import type { Metadata } from 'next';
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
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
    apple: '/apple-touch-icon.png',
  },
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
