import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

/**
 * On phones and tablets a list page's side form (Open Job Card, Register
 * vehicle…) sits under the whole list. This button takes you straight to it;
 * from 1280px the form is beside the list and the button hides.
 */
export function FormJumpLink({ target, children, icon = 'plus' }: { target: string; children: ReactNode; icon?: IconName }) {
  return (
    <a
      href={`#${target}`}
      className="ejo-press mb-4 inline-flex min-h-11 items-center gap-1.5 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 text-sm font-medium text-white shadow-sm shadow-[var(--ejo-primary)]/20 transition hover:brightness-110 xl:hidden print:hidden"
    >
      <Icon name={icon} size={16} />
      {children}
    </a>
  );
}
