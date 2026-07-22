import { ComingSoon } from '@ejo/ui';

/**
 * Wraps @ejo/ui's ComingSoon with page padding so every stub route in this
 * app renders identically. Used by every "under development" page below.
 */
export function PagePlaceholder({ title, description }: { title: string; description?: string }) {
  return (
    <main className="mx-auto max-w-5xl px-6 pt-32 pb-24">
      <ComingSoon title={title} description={description} />
    </main>
  );
}
