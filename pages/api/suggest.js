export default async function handler(req, res) {
  // Настройка CORS
  res.setHeader('Access-Control-Allow-Origin', '*'); // Разрешаем всем (или укажи https://mettaneko.github.io)
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Ответ на preflight запрос браузера
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
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
    message += `👤 *Автор*: ${author || '-'}\n`;
    if (desc) message += `📝 *Описание*: ${desc}\n`;
    
    if (user) {
      message += `\n👨‍💻 От: ${user.first_name || 'noname'} (ID: ${user.id})`;
    }

    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: ADMIN_ID,
        text: message,
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      })
    });

    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed' });
  }
}
