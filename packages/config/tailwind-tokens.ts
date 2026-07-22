/**
 * Base design tokens for the EJO 100 design system.
 *
 * IMPORTANT: colour values here are FALLBACKS ONLY (used when no company
 * branding record is available, e.g. local dev). At runtime, both apps
 * override these via CSS variables populated from the Branding model
 * (packages/database) so each company's theme is applied automatically.
 * Never import a hardcoded hex colour directly into a component — read
 * the CSS variable instead (see apps/*/app/globals.css).
 */
export const baseTokens = {
  colors: {
    primary: '#16A34A', // Kewalram-default green; overridden per company
    secondary: '#0F172A',
    accent: '#22C55E',
    success: '#16A34A',
    warning: '#F59E0B',
    error: '#DC2626',
    info: '#2563EB',
  },
  radius: {
    sm: '6px',
    md: '10px',
    lg: '16px',
    xl: '24px',
  },
  font: {
    family: 'Inter, system-ui, sans-serif',
  },
} as const;
