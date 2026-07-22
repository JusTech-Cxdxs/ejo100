/**
 * @ejo/types
 * Shared TypeScript types used across apps/website, apps/portal and apps/api.
 * Keep this package free of framework-specific imports (no React, no Nest)
 * so it stays usable everywhere.
 */

export type ModuleStatus = 'LIVE' | 'COMING_SOON' | 'DISABLED';

/** Entry in the module registry that drives sidebar + routing gating. */
export interface PlatformModuleDescriptor {
  key: string;
  name: string;
  description?: string;
  status: ModuleStatus;
  icon?: string;
  href: string;
}

/** Branding tokens resolved for the active company (dynamic branding engine). */
export interface BrandingTokens {
  companySlug: string;
  logoUrl?: string;
  logoDarkUrl?: string;
  faviconUrl?: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  successColor: string;
  warningColor: string;
  errorColor: string;
  infoColor: string;
  fontFamily: string;
}

/** Minimal org-hierarchy node shape shared by selectors/breadcrumbs across apps. */
export interface OrgNode {
  id: string;
  name: string;
  slug?: string;
  children?: OrgNode[];
}

export interface AuthenticatedUser {
  id: string;
  fullName: string;
  email: string;
  companyId: string;
  branchId?: string;
  departmentId?: string;
  roles: string[];
}
