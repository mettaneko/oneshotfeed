export default async function handler(req, res) {
  // CORS Headers
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
    // Формируем подпись (Caption)
    const caption = 
      `📥 Скачано из @OneShotFeedBot!\n` +
      `👤 Автор: ${author}\n` + // Если author это ник без @, добавь @ вручную, если с ним - убери
      (desc ? `📝 Платформа Автора: ${desc}` : '');

    // Используем sendVideo для отправки файла
    const telegramRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendVideo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: user.id,
        video: videoUrl, // Телеграм сам скачает видео по ссылке и отправит как файл
        caption: caption,
        parse_mode: 'HTML', // HTML позволяет делать ссылки и жирный текст (если нужно)
        supports_streaming: true // Позволяет смотреть видео сразу, не дожидаясь полной загрузки
      })
    });

    const telegramData = await telegramRes.json();

    if (!telegramData.ok) {
        console.error('Telegram API Error:', telegramData);
        // Если видео слишком большое или ссылка недоступна для серверов ТГ,
        // падаем обратно на отправку ссылки текстом (фоллбэк)
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: user.id,
              text: `⚠️ Не удалось загрузить видео напрямую.\n\n🔗 Вот ссылка: ${videoUrl}\n\n👤 Автор: @${author}`,
            })
        });
    }

    res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed' });
  }
}
