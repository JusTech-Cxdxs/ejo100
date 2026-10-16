/** Plain text with its web addresses as links (https only; a link never runs script). */
export function LinkedText({ text }: { text: string }) {
  const parts = text.split(/(https:\/\/[^\s<>()"']+)/g);
  return (
    <p className="whitespace-pre-wrap break-words">
      {parts.map((p, i) => {
        if (i % 2 === 0) return <span key={i}>{p}</span>;
        const url = p.replace(/[).,;:!?]+$/, '');
        const tail = p.slice(url.length);
        return <span key={i}><a href={url} className="font-medium text-[var(--ejo-primary)] underline" rel="noopener noreferrer">{url}</a>{tail}</span>;
      })}
    </p>
  );
}
