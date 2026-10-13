'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { startAssistSession } from '@/lib/actions/assist';
import { PasswordField } from '@/components/PasswordField';
import { AuthNotice, authButton, authInput } from '@/components/AuthNotice';

/**
 * The colleague types their own password on the assistant's screen: that is
 * their consent. The password goes straight to the server for checking and
 * is cleared from the form whatever the answer.
 */
export function AssistConsentForm({ colleagueId, colleagueName, minutes }: { colleagueId: string; colleagueName: string; minutes: number }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const first = colleagueName.split(/\s+/)[0] || colleagueName;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const typed = password;
    setPassword('');
    start(async () => {
      try {
        const r = await startAssistSession({ colleagueId, password: typed, reason });
        if (!r.ok) { setError(r.error); return; }
        router.push('/dashboard');
        router.refresh();
      } catch {
        setError('The session could not be started. Try again.');
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4" aria-label={`Start helping ${colleagueName}`}>
      <p className="text-sm text-[var(--ejo-text)]">
        Hand the keyboard to {first}. Typing their own password is how they agree to your help. You do not see it, and it is never stored.
        The session ends by itself after {minutes} minutes.
      </p>
      {error ? <AuthNotice kind="error">{error}</AuthNotice> : null}
      <PasswordField id="assist-password" label={`${first}'s password`} value={password} onChange={setPassword} autoComplete="off" placeholder={`${first} types it here`} invalid={Boolean(error)} />
      <div>
        <label htmlFor="assist-reason" className="mb-1.5 block text-sm font-medium text-[var(--ejo-text)]">What are you helping with? <span className="font-normal text-[var(--ejo-text-muted)]">(optional)</span></label>
        <input id="assist-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="For example: accepting today's Job Card and writing the estimate" className={authInput} />
      </div>
      <button type="submit" disabled={pending} className={authButton}>{pending ? 'Checking…' : `Start helping ${first}`}</button>
    </form>
  );
}
