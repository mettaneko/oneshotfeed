import { upstash } from '../lib/upstash.js';
import { isAdmin, requireTelegramUser, validBotSecret } from '../lib/auth.js';
const KEY = 'config:winter_theme';
export default async function handler(req) {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, X-Telegram-Init-Data' };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  try {
    let config = { isWinter: false, version: 1 };
    const raw = await upstash(`get/${KEY}`);
    if (raw) try { config = { ...config, ...JSON.parse(raw) }; } catch {}
    if (req.method === 'GET') return new Response(JSON.stringify(config), { headers });
    if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });
    const body = await req.json();
    if (!isAdmin(requireTelegramUser(req, body)) && !validBotSecret({ headers: Object.fromEntries(req.headers.entries()) })) return new Response(JSON.stringify({ error: 'Admin authentication required' }), { status: 403, headers });
    if (typeof body.active !== 'boolean') return new Response(JSON.stringify({ error: 'active must be boolean' }), { status: 400, headers });
    config.isWinter = body.active;
    if (body.reset) config.version += 1;
    await upstash(`set/${KEY}`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(config) });
    return new Response(JSON.stringify({ ok: true, config }), { headers });
  } catch (e) { return new Response(JSON.stringify({ error: e.message }), { status: 500, headers }); }
}
