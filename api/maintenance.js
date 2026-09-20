import { upstash } from './_lib/upstash.js';
import { isAdmin, requireTelegramUser, validBotSecret, validMaintenanceToken } from './_lib/auth.js';
const STATUS_KEY = 'MAINTENANCE_MODE_STATUS';
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Telegram-Init-Data');
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    if (req.method === 'GET') {
      const token = req.headers['x-maintenance-token'] || req.query?.token;
      const active = (await upstash(`get/${STATUS_KEY}`)) === 'on';
      return res.status(200).json({ maintenance: active && !validMaintenanceToken(token) });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
    const user = requireTelegramUser(req, req.body || {});
    if (!isAdmin(user) && !validBotSecret(req)) return res.status(403).json({ error: 'Admin authentication required' });
    const { status } = req.body || {};
    if (!['on', 'off'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
    await upstash(`set/${STATUS_KEY}/${status}`);
    return res.status(200).json({ success: true, newStatus: status });
  } catch (e) { return res.status(500).json({ error: e.message }); }
}
