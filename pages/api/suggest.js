export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url, author, desc, user } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL required' });
  }

  const BOT_TOKEN = process.env.BOT_TOKEN;
  const ADMIN_ID = process.env.ADMIN_ID;

  if (!BOT_TOKEN || !ADMIN_ID) {
    return res.status(500).json({ error: 'Bot not configured' });
  }

  try {
    let message = '🆕 *Новое видео в предложке* 🆕\n\n';
    message += `🎥 *URL*: \`${url}\`\n`;
    message += `👤 *Автор видео*: ${author || '-'}\n`;
    if (desc) message += `📝 *Описание*: ${desc}\n`;
    if (user) {
      message += `\n👨‍💻 Отправил: ${user.first_name || 'Без имени'}\n`;
      if (user.username) message += `@${user.username}\n`;
      message += `ID: \`${user.id}\``;
    }

    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: ADMIN_ID,
        text: message,
        parse_mode: 'Markdown'
      })
    });

    if (!response.ok) {
      throw new Error('Telegram API failed');
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Suggest error:', error);
    res.status(500).json({ error: 'Internal error' });
  }
}
