'use client';

import { useId, useState } from 'react';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { MAIL_PRESETS, type MailPreset, type MailSecurity } from '@/lib/mail/rules';

const input = 'min-h-11 w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2.5 text-sm text-[var(--ejo-text)]';
const label = 'mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]';

export type ConnectDefaults = Partial<Record<'preset' | 'address' | 'displayName' | 'imapHost' | 'imapPort' | 'imapSecurity' | 'smtpHost' | 'smtpPort' | 'smtpSecurity' | 'username', string>>;

/**
 * Connect a mailbox: choose the provider (fills in the servers), then the
 * address and app password. The server signs in to both servers before
 * anything is saved. The password field is never filled back in.
 */
export function ConnectForm({ action, defaults, allowInsecure, reconnect }: { action: (f: FormData) => Promise<void>; defaults: ConnectDefaults; allowInsecure: boolean; reconnect: boolean }) {
  const ids = { preset: useId(), address: useId(), name: useId(), user: useId(), pass: useId(), help: useId() };
  const start = MAIL_PRESETS.find((p) => p.key === defaults.preset) ?? (defaults.imapHost ? MAIL_PRESETS.find((p) => p.key === 'custom')! : MAIL_PRESETS[0]!);
  const [preset, setPreset] = useState<MailPreset>(start);
  const [s, setS] = useState({
    imapHost: defaults.imapHost ?? start.imapHost,
    imapPort: defaults.imapPort ?? String(start.imapPort),
    imapSecurity: (defaults.imapSecurity as MailSecurity) ?? start.imapSecurity,
    smtpHost: defaults.smtpHost ?? start.smtpHost,
    smtpPort: defaults.smtpPort ?? String(start.smtpPort),
    smtpSecurity: (defaults.smtpSecurity as MailSecurity) ?? start.smtpSecurity,
  });
  const [showPass, setShowPass] = useState(false);
  const choose = (key: string) => {
    const p = MAIL_PRESETS.find((x) => x.key === key) ?? MAIL_PRESETS[0]!;
    setPreset(p);
    if (p.key !== 'custom' || !s.imapHost) setS({ imapHost: p.imapHost, imapPort: String(p.imapPort), imapSecurity: p.imapSecurity, smtpHost: p.smtpHost, smtpPort: String(p.smtpPort), smtpSecurity: p.smtpSecurity });
  };
  const securityOptions = (
    <>
      <option value="tls">SSL/TLS</option>
      <option value="starttls">STARTTLS</option>
      {allowInsecure ? <option value="none">None (test servers only)</option> : null}
    </>
  );
  return (
    <form action={action} className="relative max-w-2xl space-y-5 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4 sm:p-6">
      <FormPendingOverlay />
      <div>
        <label htmlFor={ids.preset} className={label}>Your mail provider</label>
        <select id={ids.preset} name="preset" value={preset.key} onChange={(e) => choose(e.target.value)} className={input} aria-describedby={ids.help}>
          {MAIL_PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
        <p id={ids.help} className={`mt-2 rounded-[var(--ejo-radius-md)] px-3 py-2 text-xs leading-relaxed ${preset.supported ? 'bg-[var(--ejo-info)]/10 text-[var(--ejo-text)]' : 'bg-[var(--ejo-warning)]/10 text-[var(--ejo-warning-text)]'}`}>{preset.help}</p>
      </div>
      {preset.supported ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={ids.address} className={label}>Work email address</label>
              <input id={ids.address} name="address" type="email" required defaultValue={defaults.address ?? ''} readOnly={reconnect} autoComplete="email" className={`${input} ${reconnect ? 'opacity-70' : ''}`} />
            </div>
            <div>
              <label htmlFor={ids.name} className={label}>Name on your emails (optional)</label>
              <input id={ids.name} name="displayName" maxLength={120} defaultValue={defaults.displayName ?? ''} autoComplete="name" className={input} />
            </div>
            <div>
              <label htmlFor={ids.user} className={label}>Username (usually your email address)</label>
              <input id={ids.user} name="username" defaultValue={defaults.username ?? ''} autoComplete="username" placeholder="Same as the address" className={input} />
            </div>
            <div>
              <label htmlFor={ids.pass} className={label}>{preset.key === 'custom' ? 'Password' : 'App password'}</label>
              <div className="relative">
                <input id={ids.pass} name="password" type={showPass ? 'text' : 'password'} required autoComplete="new-password" spellCheck={false} className={`${input} pr-16`} />
                <button type="button" onClick={() => setShowPass((v) => !v)} aria-pressed={showPass} className="absolute inset-y-0 right-1 my-auto h-9 rounded-[var(--ejo-radius-md)] px-2 text-xs font-medium text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">{showPass ? 'Hide' : 'Show'}</button>
              </div>
            </div>
          </div>
          <details open={preset.key === 'custom'} className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] p-3">
            <summary className="cursor-pointer text-sm font-medium text-[var(--ejo-text)]">Server settings</summary>
            <div className="mt-3 grid gap-4 sm:grid-cols-[minmax(0,1fr)_100px_150px]">
              <div>
                <label className={label} htmlFor={`${ids.preset}-ih`}>Incoming server (IMAP)</label>
                <input id={`${ids.preset}-ih`} name="imapHost" required value={s.imapHost} onChange={(e) => setS({ ...s, imapHost: e.target.value })} placeholder="mail.yourorganisation.com" className={input} autoComplete="off" />
              </div>
              <div>
                <label className={label} htmlFor={`${ids.preset}-ip`}>Port</label>
                <input id={`${ids.preset}-ip`} name="imapPort" required inputMode="numeric" value={s.imapPort} onChange={(e) => setS({ ...s, imapPort: e.target.value })} className={input} />
              </div>
              <div>
                <label className={label} htmlFor={`${ids.preset}-is`}>Security</label>
                <select id={`${ids.preset}-is`} name="imapSecurity" value={s.imapSecurity} onChange={(e) => setS({ ...s, imapSecurity: e.target.value as MailSecurity })} className={input}>{securityOptions}</select>
              </div>
              <div>
                <label className={label} htmlFor={`${ids.preset}-sh`}>Outgoing server (SMTP)</label>
                <input id={`${ids.preset}-sh`} name="smtpHost" required value={s.smtpHost} onChange={(e) => setS({ ...s, smtpHost: e.target.value })} placeholder="mail.yourorganisation.com" className={input} autoComplete="off" />
              </div>
              <div>
                <label className={label} htmlFor={`${ids.preset}-sp`}>Port</label>
                <input id={`${ids.preset}-sp`} name="smtpPort" required inputMode="numeric" value={s.smtpPort} onChange={(e) => setS({ ...s, smtpPort: e.target.value })} className={input} />
              </div>
              <div>
                <label className={label} htmlFor={`${ids.preset}-ss`}>Security</label>
                <select id={`${ids.preset}-ss`} name="smtpSecurity" value={s.smtpSecurity} onChange={(e) => setS({ ...s, smtpSecurity: e.target.value as MailSecurity })} className={input}>{securityOptions}</select>
              </div>
            </div>
          </details>
          <p className="text-xs text-[var(--ejo-text-muted)]">We sign in to both servers to check the settings before saving. Your password is stored encrypted and is never shown again — not to you, not to administrators.</p>
          <SubmitButton label={reconnect ? 'Check and update' : 'Check and connect'} pendingLabel="Checking the connection…" className="min-h-11 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-5 py-2.5 text-sm font-medium text-white hover:brightness-110" />
        </>
      ) : null}
    </form>
  );
}
