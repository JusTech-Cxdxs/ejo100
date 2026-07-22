import type { PlatformModuleDescriptor } from '@ejo/types';

/**
 * MODULE REGISTRY (Phase 1 client-side mirror of packages/database's
 * PlatformModule / CompanyModule tables).
 *
 * This is the single source of truth the sidebar AND route guards read
 * from. To "activate" a module for a client, flip its status here (or,
 * once the API is wired up, in the database) — no new routing or sidebar
 * code is needed because every route already exists per the Phase 1 rule.
 */
export const platformModules: PlatformModuleDescriptor[] = [
  { key: 'dashboard', name: 'Dashboard', status: 'LIVE', href: '/dashboard', icon: 'layout-dashboard' },
  { key: 'company', name: 'Company', status: 'LIVE', href: '/company', icon: 'building' },
  { key: 'business-units', name: 'Business Units', status: 'LIVE', href: '/business-units', icon: 'briefcase' },
  { key: 'countries', name: 'Countries', status: 'LIVE', href: '/countries', icon: 'globe' },
  { key: 'states', name: 'States', status: 'LIVE', href: '/states', icon: 'map' },
  { key: 'cities', name: 'Cities', status: 'LIVE', href: '/cities', icon: 'map-pin' },
  { key: 'branches', name: 'Branches', status: 'LIVE', href: '/branches', icon: 'network' },
  { key: 'departments', name: 'Departments', status: 'LIVE', href: '/departments', icon: 'sitemap' },
  { key: 'teams', name: 'Teams', status: 'LIVE', href: '/teams', icon: 'users' },
  { key: 'users', name: 'Users', status: 'LIVE', href: '/users', icon: 'user' },
  { key: 'roles', name: 'Roles', status: 'LIVE', href: '/roles', icon: 'shield' },
  { key: 'permissions', name: 'Permissions', status: 'LIVE', href: '/permissions', icon: 'key' },
  { key: 'workshop', name: 'Workshop', status: 'LIVE', href: '/workshop', icon: 'wrench' },
  { key: 'inventory', name: 'Inventory', status: 'COMING_SOON', href: '/inventory', icon: 'boxes' },
  { key: 'warehouse', name: 'Warehouse', status: 'COMING_SOON', href: '/warehouse', icon: 'warehouse' },
  { key: 'suppliers', name: 'Suppliers', status: 'COMING_SOON', href: '/suppliers', icon: 'truck' },
  { key: 'procurement', name: 'Procurement', status: 'COMING_SOON', href: '/procurement', icon: 'shopping-cart' },
  { key: 'finance', name: 'Finance', status: 'COMING_SOON', href: '/finance', icon: 'wallet' },
  { key: 'hr', name: 'HR', status: 'COMING_SOON', href: '/hr', icon: 'id-card' },
  { key: 'payroll', name: 'Payroll', status: 'COMING_SOON', href: '/payroll', icon: 'banknote' },
  { key: 'manufacturing', name: 'Manufacturing', status: 'COMING_SOON', href: '/manufacturing', icon: 'factory' },
  { key: 'documents', name: 'Documents', status: 'COMING_SOON', href: '/documents', icon: 'file-text' },
  { key: 'reports', name: 'Reports', status: 'COMING_SOON', href: '/reports', icon: 'bar-chart' },
  { key: 'notifications', name: 'Notifications', status: 'LIVE', href: '/notifications', icon: 'bell' },
  { key: 'audit-logs', name: 'Audit Logs', status: 'LIVE', href: '/audit-logs', icon: 'history' },
  { key: 'module-registry', name: 'Module Registry', status: 'LIVE', href: '/module-registry', icon: 'layout-grid' },
  { key: 'branding', name: 'Branding Engine', status: 'LIVE', href: '/branding', icon: 'palette' },
  { key: 'settings', name: 'Settings', status: 'LIVE', href: '/settings', icon: 'settings' },
  { key: 'help', name: 'Help Center', status: 'LIVE', href: '/help', icon: 'help-circle' },
];
