'use client';

import { useActionState, useState } from 'react';
import { respondToRequest, type ResponseState } from '@/lib/support-response';

const btn = 'inline-flex min-h-12 items-center justify-center rounded-xl px-5 text-sm font-semibold transition';

/** The buttons on a customer's request page. Nothing happens until a button is pressed. */
export function SupportResponse({ token, resolved, closed, preset, rated }: { token: string; resolved: boolean; closed: boolean; preset: { a?: string; rate?: number }; rated: number | null }) {
  const [state, action, pending] = useActionState<ResponseState, FormData>(respondToRequest, null);
  const [score, setScore] = useState<number>(preset.rate ?? rated ?? 0);
  const labels = ['', 'Very poor', 'Poor', 'Okay', 'Good', 'Excellent'];
  return (
    <div className="space-y-6">
      {state ? <p role={state.ok ? 'status' : 'alert'} className={`rounded-xl px-4 py-3 text-sm font-medium ${state.ok ? 'bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary-dark)]' : 'bg-red-50 text-red-700'}`}>{state.message}</p> : null}
      {!resolved && !closed ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <form action={action}>
            <input type="hidden" name="token" value={token} /><input type="hidden" name="what" value="solved" />
            <button type="submit" disabled={pending} className={`${btn} w-full bg-[var(--ejo-primary)] text-white hover:brightness-110 ${preset.a === 'solved' ? 'ring-4 ring-[var(--ejo-primary)]/25' : ''}`}>Yes, this is solved</button>
          </form>
          <form action={action}>
            <input type="hidden" name="token" value={token} /><input type="hidden" name="what" value="person" />
            <button type="submit" disabled={pending} className={`${btn} w-full border border-slate-300 bg-white text-slate-900 hover:border-slate-400 ${preset.a === 'person' ? 'ring-4 ring-slate-300' : ''}`}>I still need a person</button>
          </form>
        </div>
      ) : (
        <form action={action} className="space-y-4">
          <input type="hidden" name="token" value={token} /><input type="hidden" name="what" value="rate" /><input type="hidden" name="score" value={score || ''} />
          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-slate-900">How did we do?</legend>
            <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label="Your rating">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" role="radio" aria-checked={score === n} onClick={() => setScore(n)}
                  className={`flex min-h-16 flex-col items-center justify-center rounded-xl border text-xs ${score === n ? 'border-[var(--ejo-primary)] bg-[var(--ejo-primary)]/10 font-semibold text-[var(--ejo-primary-dark)]' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'}`}>
                  <span className="text-lg font-bold">{n}</span>{labels[n]}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="block text-sm text-slate-700">Anything you would like to add? (optional)
            <textarea name="comment" rows={3} maxLength={1000} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 sm:text-sm" />
          </label>
          <button type="submit" disabled={pending || !score} className={`${btn} bg-[var(--ejo-primary)] text-white hover:brightness-110 disabled:opacity-50`}>{rated ? 'Update my rating' : 'Send my rating'}</button>
        </form>
      )}
      {resolved && !closed ? (
        <form action={action} className="text-sm text-slate-600">
          <input type="hidden" name="token" value={token} /><input type="hidden" name="what" value="person" />
          Not sorted after all? <button type="submit" disabled={pending} className="font-semibold text-[var(--ejo-primary-dark)] underline">Ask a person to look again</button>
        </form>
      ) : null}
    </div>
  );
}
