'use client';

/** Last resort if even the layout fails — plain, friendly, no technical text. */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: '3rem', textAlign: 'center', color: '#0F172A' }}>
        <h1 style={{ fontSize: '1.25rem' }}>EJO 100 is having a problem right now</h1>
        <p style={{ color: '#475569' }}>Please try again in a moment. If it keeps happening, tell IT{error.digest ? ` and quote reference ${error.digest}` : ''}.</p>
        <button type="button" onClick={() => window.location.reload()} style={{ marginTop: '1rem', padding: '0.5rem 1rem', borderRadius: 6, background: '#15803D', color: '#fff', border: 0 }}>Try again</button>
      </body>
    </html>
  );
}
