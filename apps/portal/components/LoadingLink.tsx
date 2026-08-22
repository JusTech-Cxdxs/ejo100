'use client';

import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from 'react';
import { useNavigationLoading } from './NavigationLoadingProvider';

/**
 * Drop-in replacement for `next/link`'s `<Link>` — this should be used
 * for every internal navigation link going forward, not plain `<Link>`,
 * so "every click shows the loader" stays true automatically rather
 * than needing to be remembered per new page. See
 * NavigationLoadingProvider for why this exists instead of relying on
 * `loading.tsx` alone.
 *
 * Renders a real `<a href>` (so middle-click/open-in-new-tab, right-
 * click "copy link", and search-engine crawling all still work exactly
 * like a normal link) but intercepts a plain left-click to route
 * through the shared loading state instead of a full browser navigation.
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
