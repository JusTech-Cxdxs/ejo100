import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { ThemeProvider } from '@/lib/theme';
import { I18nProvider } from '@/lib/i18n';
import { siteConfig } from '@/lib/site-config';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: `${siteConfig.companyShortName} | ${siteConfig.tagline}`,
    template: `%s | ${siteConfig.companyShortName}`,
  },
  description:
    'Kewalram Chanrai Group is a diversified group with interests in agriculture, automotive, manufacturing, real estate and more — creating lasting value across Africa and beyond.',
  metadataBase: process.env.NEXT_PUBLIC_WEBSITE_URL
    ? new URL(process.env.NEXT_PUBLIC_WEBSITE_URL)
    : undefined,
  openGraph: {
    title: siteConfig.companyShortName,
    description: siteConfig.tagline,
    siteName: siteConfig.companyShortName,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: siteConfig.companyShortName,
    description: siteConfig.tagline,
  },
};

// Sets the .dark class on <html> before hydration/paint so toggling
// between light/dark never causes a visible flash of the wrong theme.
// Also restores the saved language + text direction the same way, so a
// returning visitor's language choice doesn't flash back to English/LTR.
const themeInitScript = `
(function() {
  try {
    var stored = localStorage.getItem('ejo-theme');
    var preferred = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    var theme = stored || preferred;
    if (theme === 'dark') document.documentElement.classList.add('dark');

    var lang = localStorage.getItem('ejo-language');
    if (lang) {
      document.documentElement.lang = lang;
      document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    }
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <ThemeProvider>
          <I18nProvider>
            <Header />
            {children}
            <Footer />
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
