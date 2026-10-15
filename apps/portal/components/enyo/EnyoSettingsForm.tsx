'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { EnyoAdminSettings, EnyoConnectionTest, EnyoProviderInfo } from '@/lib/enyo/client-contract';
import { getEnyoStatus, saveSettings, testConnection } from './api';

const card = 'rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5 sm:p-6';

const FEATURES: { key: 'staffAssistant' | 'customerAssistant' | 'publicAssistant' | 'mailAi'; label: string; help: string }[] = [
  { key: 'staffAssistant', label: 'Assistant for staff', help: 'The chat panel in this portal, and "Refine" on text boxes.' },
  { key: 'customerAssistant', label: 'Assistant for customers', help: 'Answers signed-in customers about their own vehicles and bookings in the customer portal.' },
  { key: 'publicAssistant', label: 'Assistant on the website', help: 'Answers visitors to the public website and can pass them to a person.' },
  { key: 'mailAi', label: 'Help with email', help: 'Short summaries and suggested replies in connected mailboxes.' },
];

const MODES: { value: EnyoAdminSettings['predictionsMode']; label: string; help: string }[] = [
  { value: 'SHADOW', label: 'Shadow', help: 'Enyo quietly predicts the parts and labour a job will need and compares them with what is finally approved. Nobody sees the predictions; you see how accurate they are.' },
  { value: 'SUGGEST', label: 'Suggest', help: 'The predictions are shown to the people building estimates as suggestions they can accept or ignore.' },
  { value: 'OFF', label: 'Off', help: 'No predictions are made.' },
];

function Switch({ id, checked, onChange, label, help, disabled }: { id: string; checked: boolean; onChange: (v: boolean) => void; label: string; help: string; disabled?: boolean }) {
  return (
    <div className={`flex items-start justify-between gap-4 py-3.5 ${disabled ? 'opacity-55' : ''}`}>
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium text-[var(--ejo-text)]">{label}</label>
        <p id={`${id}-help`} className="mt-0.5 text-xs text-[var(--ejo-text-muted)]">{help}</p>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={`${id}-help`}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="relative inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center"
      >
        <span aria-hidden="true" className={`relative inline-flex h-6 w-11 rounded-full transition-colors ${checked ? 'bg-[var(--ejo-primary)]' : 'bg-[color-mix(in_srgb,var(--ejo-text-muted)_40%,transparent)]'}`}>
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
        </span>
      </button>
    </div>
  );
}

/** Enyo's switches for the organisation, the model status and a connection test. */
export function EnyoSettingsForm({ initial, provider }: { initial: EnyoAdminSettings; provider: EnyoProviderInfo }) {
  const router = useRouter();
  const [s, setS] = useState<EnyoAdminSettings>(initial);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<EnyoConnectionTest | null>(null);
  const set = <K extends keyof EnyoAdminSettings>(k: K, v: EnyoAdminSettings[K]) => { setS((x) => ({ ...x, [k]: v })); setFeedback(null); };
  const changed = JSON.stringify(s) !== JSON.stringify(initial);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const displayName = s.displayName.replace(/\s+/g, ' ').trim();
    if (displayName.length < 2 || displayName.length > 30) { setFeedback({ ok: false, text: 'The display name must be 2 to 30 characters.' }); return; }
    setSaving(true);
    const r = await saveSettings({ ...s, displayName });
    setSaving(false);
    if (r.ok) {
      setFeedback({ ok: true, text: 'Enyo settings saved.' });
      void getEnyoStatus(true);
      router.refresh();
    } else setFeedback({ ok: false, text: r.error });
  }

  async function runTest() {
    setTesting(true);
    setTest(null);
    setTest(await testConnection());
    setTesting(false);
  }

  return (
    <div className="grid gap-6">
      <form onSubmit={save} className={card} aria-labelledby="enyo-switches">
        <h2 id="enyo-switches" className="text-sm font-semibold text-[var(--ejo-text)]">Switches</h2>
        <div className="mt-1 divide-y divide-[var(--ejo-border)]">
          <Switch id="enyo-enabled" checked={s.enabled} onChange={(v) => set('enabled', v)} label="Enyo is on" help="The master switch. Off hides every Enyo feature; the portal works exactly as before." />
          {FEATURES.map((f) => (
            <Switch key={f.key} id={`enyo-${f.key}`} checked={s[f.key]} onChange={(v) => set(f.key, v)} label={f.label} help={f.help} disabled={!s.enabled} />
          ))}
        </div>

        <div className="mt-5">
          <label htmlFor="enyo-name" className="text-sm font-medium text-[var(--ejo-text)]">Display name</label>
          <p id="enyo-name-help" className="mt-0.5 text-xs text-[var(--ejo-text-muted)]">What staff and customers see the assistant called.</p>
          <input id="enyo-name" aria-describedby="enyo-name-help" value={s.displayName} maxLength={30} onChange={(e) => set('displayName', e.target.value)} className="mt-2 min-h-11 w-full max-w-xs rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 text-sm text-[var(--ejo-text)]" />
        </div>

        <fieldset className="mt-6">
          <legend className="text-sm font-medium text-[var(--ejo-text)]">Predictions for estimates</legend>
          <div className="mt-2 grid gap-2">
            {MODES.map((m) => (
              <label key={m.value} className={`flex cursor-pointer gap-3 rounded-[var(--ejo-radius-md)] border p-3 ${s.predictionsMode === m.value ? 'border-[var(--ejo-primary)] bg-[color-mix(in_srgb,var(--ejo-primary)_5%,var(--ejo-bg))]' : 'border-[var(--ejo-border)] bg-[var(--ejo-bg)]'}`}>
                <input type="radio" name="predictionsMode" value={m.value} checked={s.predictionsMode === m.value} onChange={() => set('predictionsMode', m.value)} className="mt-1 h-4 w-4 shrink-0" />
                <span>
                  <span className="block text-sm font-medium text-[var(--ejo-text)]">{m.label}</span>
                  <span className="mt-0.5 block text-xs text-[var(--ejo-text-muted)]">{m.help}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="mt-6 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] p-4">
          <label htmlFor="enyo-learn-from" className="text-sm font-medium text-[var(--ejo-text)]">Learn from records opened on or after</label>
          <p id="enyo-learn-from-help" className="mt-0.5 text-xs text-[var(--ejo-text-muted)]">
            Set this to the day you started using the portal for real. Anything typed before it, such as test jobs, is never learned from: not by the suggestions, the training export or the trained models. Leave it empty to learn from all history.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input id="enyo-learn-from" type="date" aria-describedby="enyo-learn-from-help" value={s.learnFrom ?? ''} max={new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())} min="2000-01-01" onChange={(e) => set('learnFrom', e.target.value || null)} className="min-h-11 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-3 text-sm text-[var(--ejo-text)]" />
            {s.learnFrom ? <button type="button" onClick={() => set('learnFrom', null)} className="min-h-11 rounded-[var(--ejo-radius-md)] px-3 text-sm font-medium text-[var(--ejo-primary)] hover:underline">Use all history</button> : null}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button type="submit" disabled={saving || !changed} className="min-h-11 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-5 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save Enyo settings'}
          </button>
          {feedback ? <p role={feedback.ok ? 'status' : 'alert'} className={`text-sm ${feedback.ok ? 'text-[var(--ejo-success)]' : 'text-[var(--ejo-error)]'}`}>{feedback.text}</p> : null}
        </div>
      </form>

      <section className={card} aria-labelledby="enyo-model">
        <h2 id="enyo-model" className="text-sm font-semibold text-[var(--ejo-text)]">Language model</h2>
        {provider.configured ? (
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
            <div><dt className="text-xs text-[var(--ejo-text-muted)]">Status</dt><dd className="mt-0.5 font-medium text-[var(--ejo-success)]">Set up</dd></div>
            <div className="min-w-0"><dt className="text-xs text-[var(--ejo-text-muted)]">Provider</dt><dd className="mt-0.5 truncate text-[var(--ejo-text)]">{provider.label ?? 'Model server'}</dd></div>
            <div className="min-w-0"><dt className="text-xs text-[var(--ejo-text-muted)]">Model</dt><dd className="mt-0.5 truncate font-mono text-xs text-[var(--ejo-text)]" title={provider.model}>{provider.model ?? '—'}</dd></div>
          </dl>
        ) : (
          <p className="mt-2 text-sm text-[var(--ejo-text)]">No model is set up yet. Your IT team adds ENYO_LLM_BASE_URL, ENYO_LLM_MODEL and ENYO_LLM_API_KEY to the server settings; Enyo stays hidden until then.</p>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" onClick={runTest} disabled={testing || !provider.configured} className="min-h-11 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-4 text-sm font-medium text-[var(--ejo-text)] hover:border-[var(--ejo-primary)] disabled:opacity-50">
            {testing ? 'Testing…' : 'Test connection'}
          </button>
          {test ? (
            <p role={test.ok ? 'status' : 'alert'} className={`text-sm ${test.ok ? 'text-[var(--ejo-success)]' : 'text-[var(--ejo-error)]'}`}>
              {test.ok ? `Connected.${typeof test.latencyMs === 'number' ? ` The model answered in ${(test.latencyMs / 1000).toFixed(1)} seconds.` : ''}` : `${test.error}${test.ref ? ` (reference ${test.ref})` : ''}`}
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
