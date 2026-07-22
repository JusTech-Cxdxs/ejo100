import { Controller, Get } from '@nestjs/common';
import { AuditLogsService } from './audit-logs.service';

@Controller('audit-logs')
export class AuditLogsController {
  constructor(private readonly auditlogsService: AuditLogsService) {}

  @Get()
  findAll() {
    return this.auditlogsService.findAll();
  }
}
