export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { videoUrl, author, desc, user } = req.body;
  const token = process.env.BOT_TOKEN;

  if (!videoUrl || !user?.id) return res.status(400).json({ error: 'Data missing' });

  try {
    // ТВОЯ ФИШКА: Формирование подписи
    const caption = `📥 Скачано из @OneShotFeedBot!\n👤 Автор: ${author}\n` + 
                    (desc ? `📝 Платформа Автора: ${desc}` : '');

    // ТВОЯ ФИШКА: Попытка отправить именно как видео файл
    const telegramRes = await fetch(`https://api.telegram.org/bot${token}/sendVideo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: user.id,
        video: videoUrl,
        caption: caption,
        parse_mode: 'HTML',
        supports_streaming: true
      })
    });

    const telegramData = await telegramRes.json();

    // ТВОЯ ФИШКА: Фоллбэк, если видео не пролезает
    if (!telegramData.ok) {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: user.id,
          text: `⚠️ Не удалось загрузить видео напрямую.\n\n🔗 Ссылка: ${videoUrl}\n👤 Автор: ${author}`,
          parse_mode: 'HTML'
        })
      });
    }

    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Share error' });
  }
}