export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { videoUrl, author, desc, user } = req.body;
  if (!user?.id) return res.status(400).json({ error: 'No user ID' });

  const BOT_TOKEN = process.env.BOT_TOKEN;
  if (!BOT_TOKEN) return res.status(500).json({ error: 'No config' });

  try {
    const text = `📹 *Видео:*\n👤 @${author}\n🎥 ${videoUrl}\n${desc ? '📝 ' + desc : ''}`;
    
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: user.id, text, parse_mode: 'Markdown' })
    });

    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed' });
  }
}
