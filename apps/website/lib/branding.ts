import type { BrandingTokens } from '@ejo/types';

/**
 * Branding tokens for the website. Returns fixed defaults for now; when the
 * active organisation's Branding row (packages/database) is fetched here,
 * every page re-themes, since pages read colours through this function and
 * the CSS variables it sets in app/layout.tsx.
 */
export function getActiveBranding(): BrandingTokens {
  return {
    organisationSlug: process.env.NEXT_PUBLIC_ACTIVE_ORGANISATION_SLUG ?? '',
    primaryColor: '#E10600', // brand green
    secondaryColor: '#0F172A',
    accentColor: '#FF3B3B',
    successColor: '#E10600',
    warningColor: '#F59E0B',
    errorColor: '#DC2626',
    infoColor: '#2563EB',
    fontFamily: 'Inter',
  };
}
