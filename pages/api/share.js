export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  const { videoUrl, author, desc, user } = req.body;

  if (!videoUrl || !user?.id) {
    return res.status(400).json({ error: 'Data missing' });
  }

  const BOT_TOKEN = process.env.BOT_TOKEN;
  if (!BOT_TOKEN) {
    return res.status(500).json({ error: 'Bot not configured' });
  }

  try {
    const message = 
      '📹 *Видео из фида:*\n\n' +
      `👤 Автор:  \`@${author} \`\n` +
      `🎥 URL:  \`${videoUrl} \`\n` +
      (desc ? `📝 ${desc}` : '');

    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: user.id,
        text: message,
        parse_mode: 'Markdown'
      })
    });

    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed' });
  }
}
