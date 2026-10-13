import { ComingSoon } from '@ejo/ui';

/**
 * Wraps @ejo/ui's ComingSoon with page padding so every stub route in this
 * app renders identically. Used by every "under development" page below.
 */
export function PagePlaceholder({ title, description }: { title: string; description?: string }) {
  return (
    <main className="mx-auto max-w-5xl px-4 pb-16 pt-28 sm:px-6 sm:pb-24 sm:pt-32">
      <ComingSoon title={title} description={description} />
    </main>
  );
}
