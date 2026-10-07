'use client';

import { useState, type FormEvent } from 'react';
import { authClient } from '@/lib/auth-client';

const field = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';

/** Change my own password. Every other device is signed out at the same time. */
export function ChangePasswordForm() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (next.length < 8) return setMsg({ ok: false, text: 'The new password needs at least 8 characters.' });
    if (next !== confirm) return setMsg({ ok: false, text: 'The two new passwords do not match.' });
    if (next === current) return setMsg({ ok: false, text: 'Choose a password different from the current one.' });
    setBusy(true);
    try {
      const { error } = await authClient.changePassword({ currentPassword: current, newPassword: next, revokeOtherSessions: true });
      if (error) setMsg({ ok: false, text: error.status === 400 || error.status === 401 ? 'The current password is not right.' : (error.message ?? 'Could not change the password.') });
      else { setMsg({ ok: true, text: 'Password changed. Any other device you were signed in on has been signed out.' }); setCurrent(''); setNext(''); setConfirm(''); }
    } catch {
      setMsg({ ok: false, text: 'Could not reach the server. Check your connection and try again.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid max-w-md gap-3" autoComplete="off">
      <div><label htmlFor="cp-current" className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Current password</label><input id="cp-current" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} className={field} /></div>
      <div><label htmlFor="cp-new" className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">New password (at least 8 characters)</label><input id="cp-new" type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={next} onChange={(e) => setNext(e.target.value)} className={field} /></div>
      <div><label htmlFor="cp-confirm" className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">New password again</label><input id="cp-confirm" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} className={field} /></div>
      {msg ? <p role="status" className={`rounded-[var(--ejo-radius-md)] p-2 text-sm ${msg.ok ? 'bg-[var(--ejo-success)]/10 text-[var(--ejo-success)]' : 'bg-[var(--ejo-error)]/10 text-[var(--ejo-error)]'}`}>{msg.text}</p> : null}
      <div><button type="submit" disabled={busy} className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{busy ? 'Changing…' : 'Change password'}</button></div>
    </form>
  );
}
