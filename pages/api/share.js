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
    // Формируем подпись
    // Обрати внимание: parse_mode: 'HTML', поэтому экранируем спецсимволы, если нужно.
    // Если author пришел без @, можно добавить, если уверен, что это юзернейм.
    const caption = 
      `📥 Скачано из @OneShotFeedBot!\n` +
      `👤 Автор: <b>${author}</b>\n` + 
      (desc ? `📝 Описание / Платформа: ${desc}` : '');

    // === КНОПКА С ССЫЛКОЙ ===
    const keyboard = {
        inline_keyboard: [
            [
                { text: "🔗 Ссылка на видео", url: videoUrl }
            ]
        ]
    };

    // Используем sendVideo для отправки файла
    const telegramRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendVideo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: user.id,
        video: videoUrl,
        caption: caption,
        parse_mode: 'HTML', 
        supports_streaming: true,
        reply_markup: keyboard // <--- Добавили кнопку сюда
      })
    });

    const telegramData = await telegramRes.json();

    if (!telegramData.ok) {
        console.error('Telegram API Error:', telegramData);
        
        // ФОЛЛБЭК: Если видео не грузится, отправляем текст с той же кнопкой
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: user.id,
              text: `⚠️ Не удалось загрузить файл напрямую.\n\n👤 Автор: ${author}`,
              reply_markup: keyboard // <--- И сюда кнопку
            })
        });
    }

    res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed' });
  }
}
