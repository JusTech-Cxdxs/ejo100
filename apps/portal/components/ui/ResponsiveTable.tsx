import type { CSSProperties, ReactNode } from 'react';

/**
 * The one wrapper every staff-portal table sits in, so nothing collides on a
 * phone (styles in app/globals.css).
 *
 *  layout "stack"  — everyday lists. Where the box is narrow (phones, and
 *                    side columns on laptops) each row becomes a small card;
 *                    give every <td> a data-label with its column name. A
 *                    <td> without data-label spans the card (the main line,
 *                    an empty-state row), data-actions lays out its buttons as
 *                    touch targets, data-hide-stacked hides a cell on a card.
 *                    Wider boxes show the table, scrolling sideways inside
 *                    the box when it still does not fit.
 *  layout "scroll" — wide admin and analytics tables: always a table, which
 *                    scrolls sideways inside the box with a soft edge shadow.
 *
 * flush: the table already sits inside a padded card, so stacked rows add
 * no side padding of their own.
 * minWidth is the narrowest the table may get before it scrolls (default 40rem).
 * fadeBg is the colour behind the table, so the edge shadow blends in
 * (default the card surface).
 */
export function ResponsiveTable({
  layout = 'stack',
  minWidth,
  fadeBg,
  label,
  flush = false,
  className = '',
  children,
}: {
  layout?: 'stack' | 'scroll';
  minWidth?: string;
  fadeBg?: string;
  /** For the scroll layout: names the scrolling box for keyboard and screen-reader users. */
  label?: string;
  flush?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const style = {
    ...(minWidth ? { '--ejo-table-min': minWidth } : {}),
    ...(fadeBg ? { '--ejo-fade-bg': fadeBg } : {}),
  } as CSSProperties;
  const scrollOnly = layout === 'scroll';
  return (
    <div
      className={`${scrollOnly ? '' : 'ejo-stack '}${flush ? 'ejo-stack-flush ' : ''}ejo-scroll-x ${className}`}
      style={style}
      {...(scrollOnly && label ? { tabIndex: 0, 'aria-label': label } : {})}
    >
      {children}
    </div>
  );
}
