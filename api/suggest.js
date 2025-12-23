export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Only POST' });

  const { url, author, desc, user } = req.body;
  const token = process.env.BOT_TOKEN;
  // Читаем список админов
  const adminIds = (process.env.ADMIN_ID || '').split(',').map(s => s.trim()).filter(Boolean);
  
  const DB_URL = process.env.KV_REST_API_URL;
  const DB_TOKEN = process.env.KV_REST_API_TOKEN;

  if (!url) return res.status(400).json({ error: 'No URL' });

  try {
    // === 1. ТВОЯ ФИШКА: ЗАЩИТА ОТ СПАМА ===
    if (user && user.id && DB_URL) {
      const checkRes = await fetch(`${DB_URL}/get/spam_sug:${user.id}`, {
        headers: { Authorization: `Bearer ${DB_TOKEN}` }
      });
      const checkData = await checkRes.json();
      if (checkData.result) return res.status(429).json({ error: 'Too many requests' });

      await fetch(`${DB_URL}/setex/spam_sug:${user.id}/60/1`, {
        headers: { Authorization: `Bearer ${DB_TOKEN}` }
      });
    }

    // === 2. ОТПРАВКА ВСЕМ АДМИНАМ (Игнорируя каналы) ===
    const sender = user ? (user.username ? `@${user.username}` : `ID: ${user.id}`) : 'Аноним';
    const text = `🎥 <b>Новое видео в предложку!</b>\n\n👤 <b>От:</b> ${sender}\n🔗 <b>Ссылка:</b> ${url}\n✍️ <b>Автор:</b> ${author || 'Не указан'}\n📝 <b>Описание:</b> ${desc || 'Пусто'}`;

    for (const adminId of adminIds) {
      if (adminId.startsWith('-100')) continue; // Фишка: не шлем в каналы

      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: adminId,
          text: text,
          parse_mode: 'HTML'
        })
      });
    }

    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}