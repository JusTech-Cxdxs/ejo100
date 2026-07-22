import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'requiredPermission';

/**
 * Marks a route as requiring a specific permission key (see the
 * `permissions` table, e.g. "workshop.job_card.approve"). Combine with
 * PermissionsGuard. A controller/route with no @RequirePermission is
 * accessible to anyone who passes SessionAuthGuard (i.e. any
 * authenticated user) — permission checks are opt-in per route.
 */
export const RequirePermission = (permissionKey: string) => SetMetadata(PERMISSION_KEY, permissionKey);
