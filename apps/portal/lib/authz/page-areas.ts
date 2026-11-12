/**
 * The protected pages and the permission(s) any of which opens them (each
 * page's guardPage), and the pages everyone signed in may open. Shared by
 * the role matrix (e2e/role-matrix.spec.ts), the demo role tour
 * (lib/demo/tour.ts, tests/demo-tour.test.ts) and its e2e proof — so a
 * tour can never promise a page the catalogue refuses, or the reverse.
 */
import { STORE_COST_PERMISSIONS, type PermissionKey } from './catalogue';

/** Protected areas and the permission(s) any of which opens them (from each page's guard). */
export const AREAS: { url: string; needs: PermissionKey[] }[] = [
  { url: '/users', needs: ['admin.users.manage'] },
  { url: '/roles', needs: ['admin.roles.manage'] },
  { url: '/permissions', needs: ['admin.roles.manage'] },
  { url: '/settings', needs: ['admin.settings.manage'] },
  { url: '/organisation', needs: ['admin.organisation.manage'] },
  { url: '/structure', needs: ['admin.structure.manage'] },
  { url: '/branches', needs: ['admin.structure.manage'] },
  { url: '/audit-logs', needs: ['audit.view'] },
  { url: '/recycle-bin', needs: ['admin.recycle_bin.manage'] },
  { url: '/data-exchange', needs: ['dataexchange.import.run', 'dataexchange.import.approve'] },
  { url: '/data-requests', needs: ['privacy.requests.manage'] },
  { url: '/analytics', needs: ['analytics.business.view'] },
  { url: '/workshop', needs: ['workshop.view'] },
  { url: '/workshop/job-cards', needs: ['workshop.view'] },
  { url: '/workshop/vehicle-service', needs: ['workshop.view'] },
  { url: '/workshop/customers', needs: ['workshop.view'] },
  { url: '/workshop/custody', needs: ['workshop.view'] },
  { url: '/workshop/refunds', needs: ['workshop.view'] },
  { url: '/workshop/parts-requests', needs: ['workshop.view'] },
  { url: '/workshop/external-procurement', needs: ['workshop.view'] },
  { url: '/inventory', needs: ['store.view'] },
  { url: '/inventory/parts', needs: ['store.view'] },
  // Delivery costs and margins: the Store, Finance, management and Warranty — not the workshop floor.
  { url: '/inventory/goods-receipts', needs: STORE_COST_PERMISSIONS },
  { url: '/inventory/pricing', needs: STORE_COST_PERMISSIONS },
  { url: '/inventory/estimate-matching', needs: ['store.view'] },
  { url: '/inventory/analytics', needs: ['analytics.inventory.view'] },
  { url: '/warranty', needs: ['warranty.view'] },
  { url: '/warranty/claims', needs: ['warranty.view'] },
  { url: '/warranty/analytics', needs: ['analytics.warranty.view'] },
  { url: '/security/visitors', needs: ['security.view'] },
  { url: '/security/incidents', needs: ['security.view'] },
  { url: '/security/on-premises', needs: ['security.view'] },
  { url: '/security/deliveries', needs: ['security.view', 'store.grn.record'] },
  { url: '/security/contractors', needs: ['security.view', 'security.pass.approve'] },
  { url: '/security/road-tests', needs: ['security.view', 'workshop.job_card.view'] },
  { url: '/plant', needs: ['plant.view'] },
  { url: '/plant/vehicles', needs: ['plant.view'] },
  { url: '/plant/kits', needs: ['plant.view'] },
  { url: '/plant/shipments', needs: ['plant.view'] },
  { url: '/plant/shipments/new', needs: ['plant.kit.receive'] },
  { url: '/plant/line', needs: ['plant.view'] },
  { url: '/plant/routes', needs: ['plant.view'] },
  { url: '/plant/qa', needs: ['plant.view'] },
  { url: '/schedule', needs: ['schedule.view', 'schedule.manage'] },
  { url: '/schedule/rooms', needs: ['schedule.view', 'schedule.manage'] },
  { url: '/notifications/broadcasts/analytics', needs: ['notifications.broadcast.send'] },
];
/** Everyone signed in may open these. */
export const EVERYONE = ['/dashboard', '/approvals', '/profile', '/notifications', '/security/exit-passes', '/roadmap'];

