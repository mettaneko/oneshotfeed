export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(200).send('OK');

    const body = req.body;
    const token = process.env.BOT_TOKEN;
    
    const adminIds = (process.env.ADMIN_ID || '').split(',');
    const isAdmin = (id) => adminIds.includes(id.toString());
    
    const webAppUrl = 'https://mettaneko.github.io/oneshotfeed/';
    const DB_URL = process.env.KV_REST_API_URL;
    const DB_TOKEN = process.env.KV_REST_API_TOKEN;

    // === 1. BUTTONS ===
    if (body.callback_query) {
      const chatId = body.callback_query.message.chat.id;
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
        `;
        await sendMessage(token, chatId, historyText, null, 'Markdown');
      }
      
      await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: body.callback_query.id })
      });
      return res.status(200).json({ ok: true });
    }

    // === 2. MESSAGES ===
    const msg = body.message || body.channel_post;

    if (msg) {
      const chatId = msg.chat.id;
      const text = msg.text || msg.caption || '';
      const user = msg.from || { id: chatId, username: 'Channel' };

      // Save User
      if (DB_URL && DB_TOKEN && chatId > 0) {
        try {
            await fetch(`${DB_URL}/sadd/all_bot_users/${chatId}`, {
                headers: { Authorization: `Bearer ${DB_TOKEN}` }
            });
        } catch (e) {}
      }

      // /START
      if (text === '/start') {
        await sendMessage(token, chatId, 
            "👋 Привет! Добро пожаловать в Niko Feed.", 
            {
             inline_keyboard: [[{ text: "📱 Открыть", web_app: { url: webAppUrl } }], [{ text: "📜 История", callback_data: "version_history" }]]
            }
        );
      } 

      // === ADMIN COMMANDS ===
      else if (isAdmin(chatId)) {

          // --- /ADD ---
          if (text.startsWith('/add')) {
              const parts = text.split(/\s+/);
              let tikTokUrl = parts.find(p => p.includes('http'));

              if (!tikTokUrl) {
                  await sendMessage(token, chatId, "❌ Нет ссылки.", null, 'HTML');
              } else {
                  await sendMessage(token, chatId, "⏳ <b>Загружаю...</b>", null, 'HTML');
                  try {
                      // 1. Пробуем TikWM (лучшее качество инфы)
                      let tikData = null;
                      try {
                        const apiRes = await fetch(`https://www.tikwm.com/api/?url=${tikTokUrl}`);
                        const apiJson = await apiRes.json();
                        if (apiJson.code === 0 && apiJson.data) tikData = apiJson.data;
                      } catch (e) {}

                      // 2. Пробуем Cobalt (лучшее качество видео)
                      let cobaltUrl = await getCobaltLink(tikTokUrl);

                      // 3. Пробуем OEmbed (Запасной вариант для автора/обложки)
                      let oembedData = null;
                      if (!tikData) {
                          oembedData = await getTikTokMetadata(tikTokUrl);
                      }

                      // === СБОРКА ДАННЫХ ===
                      let finalVideoUrl = null;
                      let finalCover = null;
                      let finalAuthor = 'unknown';
                      let finalId = null;

                      // Если TikWM жив — берем всё оттуда (это идеал)
                      if (tikData) {
                          finalId = tikData.id;
                          finalCover = tikData.cover;
                          finalAuthor = tikData.author ? tikData.author.unique_id : 'unknown';
                          finalVideoUrl = cobaltUrl || tikData.play; // Cobalt приоритет для видео
                          
                          if (tikData.images && tikData.images.length > 0) {
                             await sendMessage(token, chatId, "❌ Это слайд-шоу!");
                             return res.status(200).json({ ok: true }); 
                          }
                      } 
                      // Если TikWM умер, но есть Cobalt + OEmbed
                      else if (cobaltUrl) {
                          finalVideoUrl = cobaltUrl;
                          finalId = extractIdFromUrl(tikTokUrl) || Date.now().toString();
                          
                          // Берем данные из OEmbed
                          if (oembedData) {
                              finalAuthor = oembedData.author_name || 'TikTok User';
                              finalCover = oembedData.thumbnail_url || 'https://via.placeholder.com/150';
                          } else {
                              finalAuthor = 'Niko Feed Bot';
                              finalCover = 'https://via.placeholder.com/150';
                          }
                      }

                      // === СОХРАНЕНИЕ ===
                      if (finalVideoUrl) {
                          if (!finalVideoUrl.startsWith('http')) finalVideoUrl = `https://www.tikwm.com${finalVideoUrl}`;

                          const newVideo = {
                              id: finalId, 
                              videoUrl: finalVideoUrl, 
                              author: finalAuthor, 
                              desc: 'on tiktok', 
                              cover: finalCover
                          };
                          
                          await fetch(`${DB_URL}/`, {
                              method: 'POST',
                              headers: { Authorization: `Bearer ${DB_TOKEN}`, 'Content-Type': 'application/json' },
                              body: JSON.stringify(["RPUSH", "feed_videos", JSON.stringify(newVideo)])
                          });
                          
                          await sendMessage(token, chatId, 
                              `✅ <b>Сохранено!</b>\n👤 ${newVideo.author}\n🔗 <a href="${newVideo.videoUrl}">Видео</a>`, 
                              null, 'HTML');
                      } else {
                          await sendMessage(token, chatId, "❌ <b>Ошибка!</b> Видео не скачалось.");
                      }
                  } catch (e) {
                      await sendMessage(token, chatId, "❌ Error: " + e.message);
                  }
              }
          }

          // --- /CLEAR ---
          else if (text === '/clear') {
              await fetch(`${DB_URL}/del/feed_videos`, { headers: { Authorization: `Bearer ${DB_TOKEN}` } });
              await sendMessage(token, chatId, "🗑 <b>База очищена!</b>", null, 'HTML');
          }

          // --- /BROADCAST ---
          else if (text.startsWith('/broadcast')) {
              const bText = text.replace('/broadcast', '').trim();
              let users = [];
              try {
                  const r = await fetch(`${DB_URL}/smembers/all_bot_users`, {headers:{Authorization:`Bearer ${DB_TOKEN}`}});
                  const d = await r.json();
                  users = d.result || [];
              } catch(e){}
              for(const u of users) {
                  try { await sendMessage(token, u, `📢 ${bText}`, null, 'HTML'); } catch(e){}
              }
              await sendMessage(token, chatId, `Разослано.`);
          }
      }

      // === NOT ADMIN (Silent Suggestion) ===
      else if (!isAdmin(chatId) && chatId > 0) {
          if (text.startsWith('/add') || text.startsWith('/clear')) return res.status(200).json({ ok: true });
          
          if (text.includes('http')) {
              const sender = user.username ? `@${user.username}` : `ID: ${user.id}`;
              const admins = (process.env.ADMIN_ID || '').split(',');
              for (const admin of admins) {
                  await sendMessage(token, admin, `🚨 <b>ПРЕДЛОЖКА ОТ ${sender}:</b>\n${text}`, null, 'HTML');
              }
          }
      }
    }
    res.status(200).json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Bot Error' }); }
}

// === НОВАЯ ФУНКЦИЯ ДЛЯ АВТОРОВ (OEMBED) ===
async function getTikTokMetadata(url) {
    try {
        // Официальный API ТикТока для вставки видео на сайты
        const res = await fetch(`https://www.tiktok.com/oembed?url=${url}`);
        const data = await res.json();
        return {
            author_name: data.author_name, // Имя автора (Никнейм)
            title: data.title,             // Описание видео
            thumbnail_url: data.thumbnail_url // Обложка
        };
    } catch (e) {
        console.error("OEmbed Error:", e);
        return null;
    }
}

async function getCobaltLink(url) {
    try {
        const response = await fetch("https://api.cobalt.tools/api/json", {
            method: "POST",
            headers: { "Accept": "application/json", "Content-Type": "application/json" },
            body: JSON.stringify({ url: url, vCodec: "h264", vQuality: "720", filenamePattern: "basic" })
        });
        const data = await response.json();
        return data.url || null;
    } catch (e) { return null; }
}

function extractIdFromUrl(url) {
    const match = url.match(/\/video\/(\d+)/);
    return match ? match[1] : null;
}

async function sendMessage(token, chatId, text, keyboard = null, parseMode = 'Markdown') {
    const body = { chat_id: chatId, text, parse_mode: parseMode, disable_web_page_preview: true };
    if (keyboard) body.reply_markup = keyboard;
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
}
