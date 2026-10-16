import type { IconName } from '@/components/ui';

/** Organisation's own tabs: its printed details, and the people it publishes. */
export const ORGANISATION_TABS: { href: string; label: string; icon: IconName }[] = [
  { href: '/organisation', label: 'Details', icon: 'building' },
  { href: '/organisation/people', label: 'People we publish', icon: 'users' },
];
