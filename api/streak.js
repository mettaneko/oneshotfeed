import { requireTelegramUser } from './_lib/auth.js';
import { upstash } from './_lib/upstash.js';

function moscowDay() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(new Date());
}
function previousDay(day) {
  const [year, month, date] = day.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, date - 1));
  return d.toISOString().slice(0, 10);
}
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Telegram-Init-Data');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });
  const user = requireTelegramUser(req, req.body || {});
  if (!user) return res.status(401).json({ error: 'Valid Telegram initData required' });
  const id = String(user.id);
  const day = moscowDay();
  const metaKey = `streak:${id}:meta`;
  if (req.method === 'POST') {
    const { videoId, watchedPercent } = req.body || {};
    if (!videoId || !Number.isFinite(Number(watchedPercent)) || Number(watchedPercent) < 25) return res.status(400).json({ error: 'videoId and watchedPercent >= 25 required' });
    await upstash(`sadd/streak:${id}:${day}/${encodeURIComponent(String(videoId))}`);
    await upstash(`expire/streak:${id}:${day}/172800`);
  }
  const count = Number(await upstash(`scard/streak:${id}:${day}`) || 0);
  let meta = { day: '', streak: 0 };
  const raw = await upstash(`get/${metaKey}`);
  if (raw) try { meta = JSON.parse(raw); } catch {}
  if (count >= 5 && meta.day !== day) {
    meta = { day, streak: meta.day === previousDay(day) ? Number(meta.streak || 0) + 1 : 1 };
    await upstash(`set/${metaKey}`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(meta) });
  }
  return res.status(200).json({ day, watched: count, streak: Number(meta.streak || 0), complete: count >= 5 });
}
