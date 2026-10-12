import type { PlatformModuleDescriptor } from '@ejo/types';

/**
 * MODULE REGISTRY (Phase 1 client-side mirror of packages/database's
 * PlatformModule / OrganisationModule tables).
 *
 * This is the single source of truth the sidebar AND route guards read
 * from. To "activate" a module for a client, flip its status here (or,
 * once the API is wired up, in the database) — no new routing or sidebar
 * code is needed.
 *
 * Version 1: the modules below are live. Everything planned next (HR,
 * Payroll, Finance, Procurement, Suppliers, Warehouse, Manufacturing, CRM,
 * Documents, Reports, …) is on the Roadmap (lib/roadmap.ts) — shown to
 * everyone in its own "Coming next" menu section with a page describing what
 * it will do, so nobody mistakes "not yet" for "never".
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
  { key: 'inventory', name: 'Inventory', status: 'LIVE', href: '/inventory', icon: 'boxes' },
  { key: 'warranty', name: 'Warranty', status: 'LIVE', href: '/warranty', icon: 'shield' },
  { key: 'security', name: 'Security', status: 'LIVE', href: '/security', icon: 'shield' },
  { key: 'scheduling', name: 'Scheduling', status: 'LIVE', href: '/schedule', icon: 'calendar' },
  { key: 'analytics', name: 'Business Analytics', status: 'LIVE', href: '/analytics', icon: 'bar-chart' },
  { key: 'notifications', name: 'Notifications', status: 'LIVE', href: '/notifications', icon: 'bell' },
  { key: 'audit-logs', name: 'Audit Logs', status: 'LIVE', href: '/audit-logs', icon: 'history' },
  { key: 'settings', name: 'Settings', status: 'LIVE', href: '/settings', icon: 'settings' },
];
