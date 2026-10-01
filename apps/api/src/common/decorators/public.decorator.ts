import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * The API is secure by default: every route requires a valid session
 * (SessionAuthGuard is global). Only routes marked @Public() — health
 * checks — are open. Never put @Public() on anything that reads or
 * changes business data.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
