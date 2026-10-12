import type { PlatformModuleDescriptor } from '@ejo/types';

/**
 * Module registry: the in-code mirror of the PlatformModule /
 * OrganisationModule tables. The sidebar and route guards read it, so
 * activating a module means changing its status here; no routing or sidebar
 * code changes.
 *
 * The modules below are live in version 1. Planned modules (HR, Payroll,
 * Finance, Procurement, Suppliers, Warehouse, Manufacturing, Sales,
 * Documents, Reports, …) are on the Roadmap (lib/roadmap.ts), shown in the
 * "Coming next" menu section with a page describing each.
 */
export const platformModules: PlatformModuleDescriptor[] = [
  { key: 'dashboard', name: 'Dashboard', status: 'LIVE', href: '/dashboard', icon: 'layout-dashboard' },
  { key: 'organisation', name: 'Organisation', status: 'LIVE', href: '/organisation', icon: 'building' },
  { key: 'structure', name: 'Structure', status: 'LIVE', href: '/structure', icon: 'sitemap' },
  { key: 'branches', name: 'Branches', status: 'LIVE', href: '/branches', icon: 'network' },
  { key: 'users', name: 'Users', status: 'LIVE', href: '/users', icon: 'user' },
  { key: 'roles', name: 'Roles', status: 'LIVE', href: '/roles', icon: 'shield' },
  { key: 'permissions', name: 'Permissions', status: 'LIVE', href: '/permissions', icon: 'key' },
  { key: 'workshop', name: 'Workshop', status: 'LIVE', href: '/workshop', icon: 'wrench' },
  { key: 'crm', name: 'Customers', status: 'LIVE', href: '/crm', icon: 'users' },
  { key: 'inventory', name: 'Inventory', status: 'LIVE', href: '/inventory', icon: 'boxes' },
  { key: 'warranty', name: 'Warranty', status: 'LIVE', href: '/warranty', icon: 'shield' },
  { key: 'security', name: 'Security', status: 'LIVE', href: '/security', icon: 'shield' },
  { key: 'scheduling', name: 'Scheduling', status: 'LIVE', href: '/schedule', icon: 'calendar' },
  { key: 'analytics', name: 'Business Analytics', status: 'LIVE', href: '/analytics', icon: 'bar-chart' },
  { key: 'notifications', name: 'Notifications', status: 'LIVE', href: '/notifications', icon: 'bell' },
  { key: 'audit-logs', name: 'Audit Logs', status: 'LIVE', href: '/audit-logs', icon: 'history' },
  { key: 'settings', name: 'Settings', status: 'LIVE', href: '/settings', icon: 'settings' },
];
