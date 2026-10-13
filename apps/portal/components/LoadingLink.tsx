'use client';

import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from 'react';
import { useNavigationLoading } from './NavigationLoadingProvider';

/**
 * Use instead of next/link for internal links so every navigation shows the
 * loader (see NavigationLoadingProvider). Renders a normal <a href>, so new
 * tab and copy link still work; only a plain left-click is intercepted.
 */
export function LoadingLink({
  href,
  children,
  className,
  ...rest
}: {
  href: string;
  children: ReactNode;
  className?: string;
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'className' | 'children'>) {
  const { navigate } = useNavigationLoading();

  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    // Let the browser handle modified clicks (new tab, new window, etc.)
    // normally — only intercept a plain left-click.
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      return;
    }
    e.preventDefault();
    navigate(href);
  }

  return (
    <a href={href} onClick={handleClick} className={className} {...rest}>
      {children}
    </a>
  );
}
