'use client';

import { useEffect, useState } from 'react';
import type { EnyoConversationSummary } from '@/lib/enyo/client-contract';
import { formatRelative } from '@/lib/utils/format-date';
import { deleteChat, loadConversations, renameChat } from './api';
import { EIcon } from './icons';

const iconBtn = 'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--ejo-text-muted)] hover:bg-[color-mix(in_srgb,var(--ejo-text)_6%,transparent)] hover:text-[var(--ejo-text)]';

/** Past chats: open, rename, delete. */
export function EnyoHistory({ currentId, onOpen, onDeleted }: { currentId: string | null; onOpen: (id: string) => void; onDeleted: (id: string) => void }) {
  const [items, setItems] = useState<EnyoConversationSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void loadConversations().then((r) => {
      if (!live) return;
      if (r.ok) setItems(r.items); else { setError(r.error); setItems([]); }
    });
    return () => { live = false; };
  }, []);

  async function saveTitle(id: string) {
    const title = draft.replace(/\s+/g, ' ').trim().slice(0, 80);
    setEditing(null);
    if (!title) return;
    const before = items;
    setItems((list) => list?.map((c) => (c.id === id ? { ...c, title } : c)) ?? null);
    const r = await renameChat(id, title);
    if (!r.ok) { setItems(before); setNote(r.error); } else setNote('Chat renamed.');
  }

  async function remove(id: string) {
    setConfirming(null);
    const before = items;
    setItems((list) => list?.filter((c) => c.id !== id) ?? null);
    const r = await deleteChat(id);
    if (!r.ok) { setItems(before); setNote(r.error); } else { setNote('Chat deleted.'); onDeleted(id); }
  }

  if (items === null) return <p className="p-5 text-sm text-[var(--ejo-text-muted)]" role="status">Loading your chats…</p>;

  return (
    <div className="px-3 py-3">
      {error ? <p role="alert" className="m-2 rounded-[var(--ejo-radius-md)] bg-[color-mix(in_srgb,var(--ejo-error)_8%,transparent)] p-3 text-sm text-[var(--ejo-text)]">{error}</p> : null}
      {!error && items.length === 0 ? (
        <p className="p-3 text-sm text-[var(--ejo-text-muted)]">No chats yet. Questions you ask are kept here for 12 months so you can come back to them.</p>
      ) : null}
      <ul aria-label="Past chats" className="space-y-1">
        {items.map((c) => {
          const title = c.title?.trim() || 'Untitled chat';
          const when = c.updatedAt ? formatRelative(new Date(c.updatedAt)) : '';
          return (
            <li key={c.id} className={`rounded-[var(--ejo-radius-md)] ${c.id === currentId ? 'bg-[color-mix(in_srgb,var(--ejo-primary)_8%,transparent)]' : ''}`}>
              {editing === c.id ? (
                <form className="flex items-center gap-1 p-1" onSubmit={(e) => { e.preventDefault(); void saveTitle(c.id); }}>
                  <label htmlFor={`rename-${c.id}`} className="sr-only">New name for this chat</label>
                  <input id={`rename-${c.id}`} autoFocus value={draft} maxLength={80} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setEditing(null); } }} className="min-h-11 min-w-0 flex-1 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 text-sm text-[var(--ejo-text)]" />
                  <button type="submit" className="min-h-11 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-3 text-sm font-medium text-white">Save</button>
                </form>
              ) : confirming === c.id ? (
                <div className="flex flex-wrap items-center gap-2 p-2 text-sm">
                  <span className="min-w-0 flex-1 text-[var(--ejo-text)]">Delete “{title}”?</span>
                  <button type="button" onClick={() => remove(c.id)} className="min-h-11 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-error)] px-3 font-medium text-white">Delete</button>
                  <button type="button" onClick={() => setConfirming(null)} className="min-h-11 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 text-[var(--ejo-text)]">Keep</button>
                </div>
              ) : (
                <div className="flex items-center">
                  <button type="button" onClick={() => onOpen(c.id)} className="flex min-h-11 min-w-0 flex-1 flex-col items-start rounded-[var(--ejo-radius-md)] px-3 py-2 text-left hover:bg-[color-mix(in_srgb,var(--ejo-text)_5%,transparent)]">
                    <span className="w-full truncate text-sm font-medium text-[var(--ejo-text)]">{title}</span>
                    {when ? <span className="text-xs text-[var(--ejo-text-muted)]">{when}</span> : null}
                  </button>
                  <button type="button" className={iconBtn} aria-label={`Rename ${title}`} onClick={() => { setDraft(c.title ?? ''); setEditing(c.id); }}><EIcon name="pencil" size={16} /></button>
                  <button type="button" className={`${iconBtn} hover:text-[var(--ejo-error)]`} aria-label={`Delete ${title}`} onClick={() => setConfirming(c.id)}><EIcon name="trash" size={16} /></button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {note ? <p role="status" className="px-3 pt-2 text-xs text-[var(--ejo-text-muted)]">{note}</p> : null}
    </div>
  );
}
