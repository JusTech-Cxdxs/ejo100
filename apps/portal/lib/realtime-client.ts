/**
 * A tiny client for Supabase Realtime's standard Phoenix protocol, for the
 * "something changed" broadcast channel: join, heartbeat every 25 s, and
 * reconnect with back-off (1 s → 30 s) after any drop. Plain function (no
 * React) so it can be tested end to end. Returns a stop function.
 */
export const CHANGE_TOPIC = 'realtime:ejo-changes';

export function connectChangePings(opts: {
  url: string;
  anonKey: string;
  onPing: () => void;
  onState: (connected: boolean) => void;
  WebSocketImpl?: typeof WebSocket;
  heartbeatMs?: number;
}): () => void {
  const WS = opts.WebSocketImpl ?? WebSocket;
  const heartbeatMs = opts.heartbeatMs ?? 25000;
  let ws: WebSocket | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let delay = 1000;
  let ref = 0;
  let stopped = false;
  const send = (m: Record<string, unknown>) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); };

  const connect = () => {
    if (stopped) return;
    ws = new WS(`${opts.url.replace(/^http/, 'ws').replace(/\/$/, '')}/realtime/v1/websocket?apikey=${encodeURIComponent(opts.anonKey)}&vsn=1.0.0`);
    ws.onopen = () => {
      ref += 1;
      send({ topic: CHANGE_TOPIC, event: 'phx_join', payload: { config: { broadcast: { self: false, ack: false }, presence: { key: '' }, postgres_changes: [], private: false }, access_token: opts.anonKey }, ref: String(ref), join_ref: String(ref) });
      heartbeat = setInterval(() => { ref += 1; send({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: String(ref) }); }, heartbeatMs);
    };
    ws.onmessage = (e: MessageEvent) => {
      try {
        const m = JSON.parse(String(e.data)) as { topic?: string; event?: string; payload?: { status?: string; event?: string } };
        if (m.topic !== CHANGE_TOPIC) return;
        if (m.event === 'phx_reply' && m.payload?.status === 'ok') { opts.onState(true); delay = 1000; }
        else if (m.event === 'broadcast' && m.payload?.event === 'changed') opts.onPing();
      } catch {
        // not ours — ignore
      }
    };
    ws.onclose = () => {
      opts.onState(false);
      if (heartbeat) { clearInterval(heartbeat); heartbeat = null; }
      if (!stopped) {
        retry = setTimeout(connect, delay);
        delay = Math.min(30000, delay * 2);
      }
    };
    ws.onerror = () => ws?.close();
  };

  connect();
  return () => {
    stopped = true;
    if (heartbeat) clearInterval(heartbeat);
    if (retry) clearTimeout(retry);
    ws?.close();
  };
}
