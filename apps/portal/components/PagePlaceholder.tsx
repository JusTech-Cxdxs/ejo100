import { ComingSoon } from '@ejo/ui';

export function PagePlaceholder({ title, description }: { title: string; description?: string }) {
  return (
    <div className="p-8">
      <ComingSoon title={title} description={description} />
    </div>
  );
}
