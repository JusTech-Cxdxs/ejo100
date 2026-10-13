import { Module } from '@nestjs/common';
import { EmailController } from './email.controller';
import { EmailService } from './email.service';

/**
 * Outbound email via Nodemailer.
 * Placeholder: registered so the route exists; no business logic yet.
 */
@Module({
  controllers: [EmailController],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
