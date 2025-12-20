export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { videoUrl, author, desc, user } = req.body;

  if (!videoUrl || !user?.id) {
    return res.status(400).json({ error: 'videoUrl and user.id required' });
  }

  const BOT_TOKEN = process.env.BOT_TOKEN;
  if (!BOT_TOKEN) {
    return res.status(500).json({ error: 'Bot not configured' });
  }

  try {
    const message = 
      '📹 *Видео из фида:*\n' +
      `👤 Автор: @${author}\n` +
      `🎥 URL: ${videoUrl}\n` +
      (desc ? `📝 ${desc}` : '');

    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: user.id,
        text: message,
        parse_mode: 'Markdown'
      })
    });

    if (!response.ok) {
      throw new Error('Telegram API failed');
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Share error:', error);
    res.status(500).json({ error: 'Internal error' });
  }
}
