"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.platformModules = void 0;
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
exports.platformModules = [
    { key: 'dashboard', name: 'Dashboard', status: 'LIVE', href: '/dashboard', icon: 'layout-dashboard' },
    { key: 'organisation', name: 'Organisation', status: 'LIVE', href: '/organisation', icon: 'building' },
    { key: 'structure', name: 'Structure', status: 'LIVE', href: '/structure', icon: 'sitemap' },
    { key: 'branches', name: 'Branches', status: 'LIVE', href: '/branches', icon: 'network' },
    { key: 'users', name: 'Users', status: 'LIVE', href: '/users', icon: 'user' },
    { key: 'roles', name: 'Roles', status: 'LIVE', href: '/roles', icon: 'shield' },
    { key: 'permissions', name: 'Permissions', status: 'LIVE', href: '/permissions', icon: 'key' },
    // The vehicle workshop is not part of the Zinox edition (kept in code, off the menu).
    { key: 'workshop', name: 'Workshop', status: 'DISABLED', href: '/workshop', icon: 'wrench' },
    { key: 'catalogue', name: 'Catalogue', status: 'LIVE', href: '/catalogue', icon: 'package' },
    { key: 'production', name: 'Production', status: 'LIVE', href: '/production', icon: 'bolt' },
    { key: 'warehouse', name: 'Warehouses', status: 'LIVE', href: '/warehouse', icon: 'boxes' },
    { key: 'procurement', name: 'Procurement', status: 'LIVE', href: '/procurement', icon: 'cart' },
    { key: 'sales', name: 'Sales', status: 'LIVE', href: '/sales', icon: 'receipt' },
    { key: 'service', name: 'Service Centre', status: 'LIVE', href: '/service', icon: 'wrench' },
    { key: 'projects', name: 'Projects', status: 'LIVE', href: '/projects', icon: 'rocket' },
    { key: 'crm', name: 'Customers', status: 'LIVE', href: '/crm', icon: 'users' },
    { key: 'inventory', name: 'Components store', status: 'LIVE', href: '/inventory', icon: 'layers' },
    { key: 'warranty', name: 'Warranty', status: 'LIVE', href: '/warranty', icon: 'shield' },
    { key: 'security', name: 'Security', status: 'LIVE', href: '/security', icon: 'shield' },
    { key: 'scheduling', name: 'Scheduling', status: 'LIVE', href: '/schedule', icon: 'calendar' },
    { key: 'analytics', name: 'Business Analytics', status: 'LIVE', href: '/analytics', icon: 'bar-chart' },
    { key: 'notifications', name: 'Notifications', status: 'LIVE', href: '/notifications', icon: 'bell' },
    { key: 'audit-logs', name: 'Audit Logs', status: 'LIVE', href: '/audit-logs', icon: 'history' },
    { key: 'recycle-bin', name: 'Recycle bin', status: 'LIVE', href: '/recycle-bin', icon: 'trash' },
    { key: 'settings', name: 'Settings', status: 'LIVE', href: '/settings', icon: 'settings' },
];
