import { requireTelegramUser } from './_lib/auth.js';
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Telegram-Init-Data');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const user = requireTelegramUser(req, req.body || {});
  if (!user) return res.status(401).json({ error: 'Valid Telegram initData required' });
  const userId = user.id;
  const URL = process.env.KV_REST_API_URL;
  const TOKEN = process.env.KV_REST_API_TOKEN;

  if (!URL || !TOKEN) return res.status(500).json({ error: 'DB config missing' });

  try {
    // Получаем список подписок (smembers)
    const dbRes = await fetch(`${URL}/smembers/subs:${userId}`, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    });
    
    const data = await dbRes.json();
    const subs = Array.isArray(data.result) ? data.result : [];

    res.status(200).json({ subs });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'DB Error' });
  }
}
