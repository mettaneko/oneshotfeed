export default async function handler(req, res) {
  // === CORS (РАЗРЕШАЕМ ЗАПРОСЫ) ===
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Если браузер "спрашивает" разрешение (Preflight request)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Only POST' });

  const { url, author, desc, user } = req.body;
  const token = process.env.BOT_TOKEN;
  const adminId = process.env.ADMIN_ID;
  
  const DB_URL = process.env.KV_REST_API_URL;
  const DB_TOKEN = process.env.KV_REST_API_TOKEN;

  if (!url) return res.status(400).json({ error: 'No URL' });

  try {
    // === 1. ЗАЩИТА ОТ СПАМА (REDIS) ===
    if (user && user.id && DB_URL) {
      const userId = user.id;
      // Проверяем блокировку
      const checkRes = await fetch(`${DB_URL}/get/spam_sug:${userId}`, {
        headers: { Authorization: `Bearer ${DB_TOKEN}` }
      });
      const checkData = await checkRes.json();
      
      if (checkData.result) {
        return res.status(429).json({ error: 'Too many requests' }); 
      }

      // Ставим блокировку на 60 секунд
      await fetch(`${DB_URL}/setex/spam_sug:${userId}/60/1`, {
        headers: { Authorization: `Bearer ${DB_TOKEN}` }
      });
    }

    // === 2. ОТПРАВКА АДМИНУ ===
    const sender = user ? (user.username ? `@${user.username}` : `ID: ${user.id}`) : 'Аноним';
    
    const text = `
🎥 <b>Новое видео в предложку!</b>

👤 <b>От:</b> ${sender}
🔗 <b>Ссылка:</b> ${url}
✍️ <b>Автор видео:</b> ${author || 'Не указан'}
📝 <b>Описание:</b> ${desc || 'Пусто'}
    `;

    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: adminId,
        text: text,
        parse_mode: 'HTML',
        disable_web_page_preview: false
      })
    });

    res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server Error' });
  }
}
