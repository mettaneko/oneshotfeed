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

    // === КНОПКИ (ИСТОРИЯ ВЕРСИЙ) ===
    if (body.callback_query) {
      const chatId = body.callback_query.message.chat.id;
      if (chatId.toString().startsWith('-100')) return res.status(200).json({ ok: true });
      const data = body.callback_query.data;
      if (data === 'version_history') {
        const historyText = `📜 *История версий Niko Feed:*\n*25.12.1* - Бета-тест.\n*25.12.2* - Добавлена предложка и подписки.\n*25.12.3* - Оптимизация для Telegram Mini-apps.\n*25.12.4* - Защита от спама.\n*25.12.5* - Улучшен плеер и /start.\n*25.12.6* - Предложка напрямую.\n*25.12.7* - +1193 видео.\n*25.12.8* - Фикс 403 Forbidden.\n*25.12.9* - **Авто-автор и фильтр фото.**`;
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

    // === РЕГИСТРАЦИЯ ПОДПИСЧИКА (Твои подписки) ===
    if (msg.chat.type === 'private' && DB_URL) {
      await fetch(`${DB_URL}/sadd/feed_users/${chatId}`, {
        headers: { Authorization: `Bearer ${DB_TOKEN}` }
      });
    }

    // === АВТО-ИМПОРТ ИЗ КАНАЛА ===
    if (msg.chat.type === 'channel' && isAdmin(chatId)) {
      const tiktokRegex = /(https?:\/\/(?:www\.|vm\.|vt\.|m\.)?tiktok\.com\/[^\s]+)/g;
      const links = text.match(tiktokRegex) || [];
      if (links.length > 0) {
        let imported = 0;
        for (const link of links) {
          const res = await processVideo(link, DB_URL, DB_TOKEN);
          if (res.success) imported++;
        }
        for (const admin of adminIds) {
          if (!admin.startsWith('-100')) {
            await sendMessage(token, admin, `✅ <b>Авто-импорт:</b> +${imported} видео.`);
          }
        }
      }
      return res.status(200).json({ ok: true });
    }

    if (chatId.toString().startsWith('-100')) return res.status(200).json({ ok: true });

    // === КОМАНДЫ ===
    if (text === '/start') {
      await sendMessage(token, chatId, `Привет, <b>${user.first_name || 'друг'}</b>!`, {
        inline_keyboard: [
          [{ text: '🎬 Открыть Niko Feed', web_app: { url: webAppUrl } }],
          [{ text: '📜 История версий', callback_data: 'version_history' }]
        ]
      });
    } 
    else if (isAdmin(chatId)) {
      if (text.startsWith('/add')) {
        const url = text.split(/\s+/)[1];
        if (!url) return sendMessage(token, chatId, 'Формат: /add ссылка');
        await sendMessage(token, chatId, '⏳ Обработка...');
        const res = await processVideo(url, DB_URL, DB_TOKEN);
        if (res.success) {
          await sendMessage(token, chatId, `✅ <b>Добавлено!</b>\n👤 Автор: <code>${res.author}</code>`);
        } else {
          await sendMessage(token, chatId, `⚠️ ${res.error}`);
        }
      } 
      else if (text === '/count') {
        const dbRes = await fetch(`${DB_URL}/llen/feed_videos`, { headers: { Authorization: `Bearer ${DB_TOKEN}` } });
        const data = await dbRes.json();
        const usersRes = await fetch(`${DB_URL}/scard/feed_users`, { headers: { Authorization: `Bearer ${DB_TOKEN}` } });
        const usersData = await usersRes.json();
        await sendMessage(token, chatId, `📊 Видео: ${data.result || 0}\n👤 Подписчиков: ${usersData.result || 0}`);
      }
      else if (text === '/clear') {
        await fetch(`${DB_URL}/del/feed_videos`, { headers: { Authorization: `Bearer ${DB_TOKEN}` } });
        await sendMessage(token, chatId, '🗑 База очищена');
      }
      else if (text.startsWith('/maintenance')) {
        const mode = text.split(' ')[1] === 'on' ? 'true' : 'false';
        await fetch(`${DB_URL}/set/maintenance_mode/${mode}`, { headers: { Authorization: `Bearer ${DB_TOKEN}` } });
        await sendMessage(token, chatId, `⚙️ Тех. работы: ${mode === 'true' ? 'ВКЛ' : 'ВЫКЛ'}`);
      }
    } 
    // ПРЕДЛОЖКА (Твоя фишка)
    else if (text.includes('http')) {
      const sender = user.username ? `@${user.username}` : `ID: ${chatId}`;
      for (const admin of adminIds) {
        if (!admin.startsWith('-100')) {
          await sendMessage(token, admin, `🚨 <b>ПРЕДЛОЖКА:</b>\nОт: ${sender}\n${text}`);
        }
      }
      await sendMessage(token, chatId, '✅ Мы проверим вашу ссылку!');
    }

    res.status(200).json({ ok: true });
  } catch (e) { res.status(200).json({ ok: true }); }
}

async function processVideo(url, DB_URL, DB_TOKEN) {
  try {
    const metaRes = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`);
    if (!metaRes.ok) return { success: false, error: "Ссылка битая" };
    const metaData = await metaRes.json();
    const isPhoto = metaData.title?.toLowerCase().includes('photo') || !metaData.html?.includes('data-video-id');
    if (isPhoto) return { success: false, error: "Это фото/слайды" };
    const author = metaData.author_unique_id || metaData.author_name || 'unknown';
    const videoData = { id: Date.now().toString() + Math.floor(Math.random()*100), videoUrl: url, author, desc: 'on tiktok', date: Date.now() };
    await fetch(`${DB_URL}/rpush/feed_videos`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${DB_TOKEN}` },
      body: JSON.stringify(videoData)
    });
    return { success: true, author };
  } catch (e) { return { success: false, error: "Ссылка битая" }; }
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