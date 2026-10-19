#!/usr/bin/env node
/**
 * A stand-in for an OpenAI-compatible model server, for CI and E2E tests only.
 * It never thinks; it follows markers so tests can drive Enyo exactly:
 *
 *   "[[tool:part_lookup {"query":"oil filter"}]]"  → asks for that tool (if offered)
 *   after a tool result                            → "Here is what I found: <result>"
 *   "[[say:Hello there]]"                          → answers exactly "Hello there"
 *   "[[busy]]"                                     → refuses with 429 "try again in 1m" (a free tier's per-minute budget)
 *   anything else                                  → "Hello! I'm Enyo. You said: <message>"
 *
 * Start: node packages/enyo/testing/mock-llm.mjs   (port MOCK_LLM_PORT, default 4010)
 * Point Enyo at it: ENYO_LLM_BASE_URL=http://localhost:4010/v1 ENYO_LLM_MODEL=mock ENYO_LLM_API_KEY=test
 */
import http from 'node:http';

const port = Number(process.env.MOCK_LLM_PORT || 4010);
const requiredKey = process.env.MOCK_LLM_KEY || '';

function lastText(messages) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m.role === 'user' && typeof m.content === 'string') return m.content;
  }
  return '';
}

function decide(body) {
  const messages = body.messages || [];
  const last = messages[messages.length - 1] || {};
  if (last.role === 'tool') {
    return { content: `Here is what I found: ${String(last.content).slice(0, 2000)}` };
  }
  const text = lastText(messages);
  const offered = new Set((body.tools || []).map((t) => t.function && t.function.name));
  const tool = /\[\[tool:([a-z_]+)\s*(\{.*?\})?\]\]/i.exec(text);
  if (tool && offered.has(tool[1])) {
    return { toolCalls: [{ id: `call_${Date.now()}`, name: tool[1], arguments: tool[2] || '{}' }] };
  }
  const say = /\[\[say:([\s\S]*?)\]\]/.exec(text);
  if (say) return { content: say[1] };
  return { content: `Hello! I'm Enyo. You said: ${text.slice(0, 300)}` };
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url && req.url.endsWith('/models')) {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ data: [{ id: 'mock' }] }));
    return;
  }
  if (req.method !== 'POST' || !req.url || !req.url.endsWith('/chat/completions')) {
    res.writeHead(404).end();
    return;
  }
  if (requiredKey && req.headers.authorization !== `Bearer ${requiredKey}`) {
    res.writeHead(401).end();
    return;
  }
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    let body;
    try { body = JSON.parse(raw); } catch { res.writeHead(400).end(); return; }
    if (/\[\[busy\]\]/.test(lastText(body.messages || []))) {
      res.writeHead(429, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'Rate limit reached for model `mock` on tokens per minute (TPM): Limit 8000, Used 7900, Requested 2000. Please try again in 1m2.5s.', type: 'tokens', code: 'rate_limit_exceeded' } }));
      return;
    }
    const out = decide(body);
    const usage = { prompt_tokens: Math.ceil(raw.length / 4), completion_tokens: Math.ceil((out.content || '').length / 4) };
    if (!body.stream) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        model: body.model || 'mock',
        choices: [{ index: 0, finish_reason: out.toolCalls ? 'tool_calls' : 'stop', message: {
          role: 'assistant', content: out.content || null,
          ...(out.toolCalls ? { tool_calls: out.toolCalls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.arguments } })) } : {}),
        } }],
        usage,
      }));
      return;
    }
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
    const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
    if (out.toolCalls) {
      out.toolCalls.forEach((c, index) => {
        send({ model: 'mock', choices: [{ index: 0, delta: { tool_calls: [{ index, id: c.id, type: 'function', function: { name: c.name, arguments: '' } }] } }] });
        send({ model: 'mock', choices: [{ index: 0, delta: { tool_calls: [{ index, function: { arguments: c.arguments } }] } }] });
      });
      send({ model: 'mock', choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }], usage });
    } else {
      for (const word of (out.content || '').split(/(?<=\s)/)) send({ model: 'mock', choices: [{ index: 0, delta: { content: word } }] });
      send({ model: 'mock', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage });
    }
    res.end('data: [DONE]\n\n');
  });
});

server.listen(port, () => { console.log(`mock LLM listening on http://localhost:${port}/v1`); });
