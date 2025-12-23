export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(200).send('OK');

    const body = req.body;
    const token = process.env.BOT_TOKEN;
    const adminIds = (process.env.ADMIN_ID || '').split(',').map(s => s.trim()).filter(Boolean);
    const isAdmin = id => adminIds.includes(id.toString());

    const webAppUrl = 'https://feed.mettaneko.ru/';
    const DB_URL = process.env.KV_REST_API_URL;
    const DB_TOKEN = process.env.KV_REST_API_TOKEN;

    // === ОБРАБОТКА КНОПОК (Твоя история версий сохранена) ===
    if (body.callback_query) {
      const chatId = body.callback_query.message.chat.id;
      if (chatId.toString().startsWith('-100')) return res.status(200).json({ ok: true });

      const data = body.callback_query.data;
      if (data === 'version_history') {
        const historyText = `
📜 *История версий Niko Feed:*
(Нумерация - Год.Месяц.Номер версии)

*25.12.1* - Бета-тест.
*25.12.2* - Добавлена предложка и подписки.
*25.12.3* - Оптимизация для Telegram Mini-apps.
*25.12.4* - Защита от спама и чуть улучшенный интерфейс.
*25.12.5* - Улучшено взаимодействие с плеером и добавлено стартовое сообщение при написании /start.
*25.12.6* - Добавлена предложка напрямую в бота.
*25.12.6H* - Откат предыдущего апдейта.
*25.12.6R* - Фикс багов с кнопками стартового сообщения.
*25.12.7* - Добавление ~1193 новых видео по тематике, оптимизация ленты и попытки уменьшить повторы в ленте.
*25.12.8* - Исправление протухания ссылок (403 Forbidden) и добавление режима тех. работ.
*25.12.9* - Фильтр фото/слайдов и игнор битых ссылок.`;
        await sendMessage(token, chatId, historyText, null, 'Markdown');
      }
      await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: body.callback_query.id })
      });
      return res.status(200).json({ ok: true });
    }

    const msg = body.message || body.channel_post;
    if (!msg) return res.status(200).json({ ok: true });

    const chatId = msg.chat.id;
    const text = msg.text || msg.caption || '';
    const user = msg.from || { id: chatId };

    // === ПАРСИНГ ИЗ КАНАЛА (Авто-импорт с фильтрацией) ===
    if (msg.chat.type === 'channel' && isAdmin(chatId)) {
      const tiktokRegex = /(https?:\/\/(?:www\.|vm\.|vt\.|m\.)?tiktok\.com\/[^\s]+)/g;
      const allLinks = text.match(tiktokRegex) || [];

      if (allLinks.length > 0) {
        let imported = 0;
        for (const link of allLinks) {
          const result = await processAndAddVideo(link, DB_URL, DB_TOKEN);
          if (result.success) imported++;
        }
        if (imported > 0) {
          for (const admin of adminIds) {
            if (!admin.startsWith('-100')) {
              await sendMessage(token, admin, `✅ <b>Авто-импорт:</b> Добавлено ${imported} видео из канала.`, null, 'HTML');
            }
          }
        }
      }
      return res.status(200).json({ ok: true });
    }

    if (chatId.toString().startsWith('-100')) return res.status(200).json({ ok: true });

    // === КОМАНДЫ ===
    if (text === '/start') {
      await sendMessage(token, chatId, `👋 Привет! Добро пожаловать в Niko Feed. \n Делись, смотри видео по OneShot или просто следи за обновлениями!!`, {
        inline_keyboard: [
          [{ text: '🎬 Открыть Niko Feed', web_app: { url: webAppUrl } }],
          [{ text: '📜 История версий', callback_data: 'version_history' }]
        ]
      });
    } 
    
    else if (isAdmin(chatId)) {
      // ОБНОВЛЕННАЯ КОМАНДА /ADD
      if (text.startsWith('/add')) {
        const url = text.split(/\s+/)[1];
        if (!url) return sendMessage(token, chatId, 'Формат: /add ссылка');
        
        await sendMessage(token, chatId, '⏳ Обработка...');
        const result = await processAndAddVideo(url, DB_URL, DB_TOKEN);
        
        if (result.success) {
          await sendMessage(token, chatId, `✅ <b>Добавлено!</b>\n👤 Автор: <code>${result.author}</code>\n📝 Описание: on tiktok`);
        } else {
          await sendMessage(token, chatId, `⚠️ ${result.error}`);
        }
      } 
      // ВСЕ ОСТАЛЬНЫЕ ТВОИ КОМАНДЫ СОХРАНЕНЫ БЕЗ ИЗМЕНЕНИЙ
      else if (text === '/count') {
        const dbRes = await fetch(`${DB_URL}/llen/feed_videos`, { headers: { Authorization: `Bearer ${DB_TOKEN}` } });
        const data = await dbRes.json();
        await sendMessage(token, chatId, `📊 Всего видео в базе: ${data.result || 0}`);
      }
      else if (text === '/clear') {
        await fetch(`${DB_URL}/del/feed_videos`, { headers: { Authorization: `Bearer ${DB_TOKEN}` } });
        await sendMessage(token, chatId, '🗑 База видео очищена!');
      }
      else if (text.startsWith('/maintenance')) {
        const mode = text.split(' ')[1] === 'on' ? 'true' : 'false';
        await fetch(`${DB_URL}/set/maintenance_mode/${mode}`, { headers: { Authorization: `Bearer ${DB_TOKEN}` } });
        await sendMessage(token, chatId, `⚙️ Тех. работы: ${mode === 'true' ? 'ВКЛ' : 'ВЫКЛ'}`);
      }
      else if (text === '/status') {
        const mRes = await fetch(`${DB_URL}/get/maintenance_mode`, { headers: { Authorization: `Bearer ${DB_TOKEN}` } });
        const mData = await mRes.json();
        await sendMessage(token, chatId, `ℹ️ Статус системы:\nРаботы: ${mData.result === 'true' ? 'Да' : 'Нет'}`);
      }
    } 
    
    else if (text.includes('http')) {
      const sender = user.username ? `@${user.username}` : `ID: ${chatId}`;
      for (const admin of adminIds) {
        if (admin.startsWith('-100')) continue;
        await sendMessage(token, admin, `🚨 <b>ПРЕДЛОЖКА:</b>\nОт: ${sender}\nТекст: ${text}`, null, 'HTML');
      }
      await sendMessage(token, chatId, '✅ Спасибо! Мы проверим вашу ссылку.');
    }

    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Bot Error' });
  }
}

// Вспомогательная функция для обработки видео (авто-автор + фильтры)
async function processAndAddVideo(url, DB_URL, DB_TOKEN) {
  try {
    const metaRes = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`);
    if (!metaRes.ok) return { success: false, error: "Ссылка битая" };
    const metaData = await metaRes.json();

    // Фильтр фото/слайдов
    const isPhoto = metaData.title?.toLowerCase().includes('photo') || !metaData.html?.includes('data-video-id');
    if (isPhoto) return { success: false, error: "Это фото или слайды (пропущено)" };

    const author = metaData.author_unique_id || metaData.author_name || 'unknown';
    const videoData = { 
      id: Date.now().toString() + Math.floor(Math.random() * 100), 
      videoUrl: url, 
      author: author, 
      desc: 'on tiktok', 
      date: Date.now() 
    };

    await fetch(`${DB_URL}/rpush/feed_videos`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${DB_TOKEN}` },
      body: JSON.stringify(videoData)
    });

    return { success: true, author };
  } catch (e) {
    return { success: false, error: "Ссылка битая" };
  }
}

async function sendMessage(token, chatId, text, keyboard = null, parseMode = 'HTML') {
  if (chatId.toString().startsWith('-100')) return;
  const body = { chat_id: chatId, text, parse_mode: parseMode, disable_web_page_preview: true };
  if (keyboard) body.reply_markup = keyboard;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}