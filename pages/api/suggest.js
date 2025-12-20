export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  
  const { url, author, desc, user } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required' });

  const BOT_TOKEN = process.env.BOT_TOKEN;
  const ADMIN_ID = process.env.ADMIN_ID;

  if (!BOT_TOKEN || !ADMIN_ID) return res.status(500).json({ error: 'No config' });

  try {
    const text = `🆕 *Предложка*\n🎥 ${url}\n👤 ${author || '-'}\n📝 ${desc || ''}\n\nОт: ${user?.first_name || 'anonym'} (ID: ${user?.id || '-'})`;
    
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: ADMIN_ID, text, parse_mode: 'Markdown' })
    });

    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed' });
  }
}
