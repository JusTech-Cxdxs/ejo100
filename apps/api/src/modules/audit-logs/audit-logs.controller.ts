import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuditLogsService, type AuditLogQuery } from './audit-logs.service';
import { SessionAuthGuard } from '../../common/guards/session-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';

/**
 * GET /api/v1/audit-logs — the audit trail, filterable by record, user,
 * action prefix and date range, cursor-paginated. Sensitive: signed-in
 * users with the "audit-logs.read" permission only (Master Admin always).
 */
@Controller('audit-logs')
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class AuditLogsController {
  constructor(private readonly auditlogsService: AuditLogsService) {}

  @Get()
  @RequirePermission('audit-logs.read')
  findAll(@Query() query: AuditLogQuery) {
    return this.auditlogsService.findAll(query);
  }
}
