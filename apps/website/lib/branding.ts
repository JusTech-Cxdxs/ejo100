import type { BrandingTokens } from '@ejo/types';

/**
 * Phase 1 stub for the dynamic branding engine.
 *
 * In later phases this fetches the active company's Branding row (see
 * packages/database schema) via the API using NEXT_PUBLIC_ACTIVE_COMPANY_SLUG
 * and returns it. Every page reads colours through this function (and the
 * CSS variables it powers in app/layout.tsx) instead of hardcoding hex
 * values, so swapping this stub for a real fetch is the ONLY change needed
 * to make the whole site re-theme for a different client.
 */
export function getActiveBranding(): BrandingTokens {
  return {
    companySlug: process.env.NEXT_PUBLIC_ACTIVE_COMPANY_SLUG ?? 'kewalram-nigeria',
    primaryColor: '#16A34A', // Kewalram green
    secondaryColor: '#0F172A',
    accentColor: '#22C55E',
    successColor: '#16A34A',
    warningColor: '#F59E0B',
    errorColor: '#DC2626',
    infoColor: '#2563EB',
    fontFamily: 'Inter',
  };
}
