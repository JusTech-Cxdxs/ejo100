/** Browser-safe: no imports. Builds what Mail's sandboxed reading frame shows (lib/mail/html.ts cleans the HTML first). */

/**
 * The document the reading pane's sandboxed frame shows: the cleaned layout
 * plus a policy that allows only inline styles and pictures (remote ones only
 * after the owner chose to load them).
 */
export function mailFrameDocument(html: string, showRemote: boolean): string {
  const body = showRemote ? html.replace(/\sdata-remote-src="([^"]*)"/g, ' src="$1"') : html;
  const csp = `default-src 'none'; img-src data:${showRemote ? ' https:' : ''}; style-src 'unsafe-inline'; font-src data:; form-action 'none'; base-uri 'none'`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="referrer" content="no-referrer"><base target="_blank"><style>html,body{margin:0;padding:0;background:#fff;color:#111827;font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;overflow-wrap:anywhere}body{padding:4px 2px}img{max-width:100%;height:auto}table{max-width:100%}pre{white-space:pre-wrap}a{color:#b40000}</style></head><body><div id="ejo-mail-root" style="display:flow-root">${body}</div></body></html>`;
}
