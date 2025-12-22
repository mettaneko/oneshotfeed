// bot.js - Niko Feed v25.12.8

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
*25.12.7* - Добавление ~1193 новых видео.
*25.12.8* - Фикс Cobalt API, улучшенная защита от блокировок видео (hotlink).
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
            "👋 Привет! Добро пожаловать в <b>Niko Feed v25.12.8</b>.", 
            {
             inline_keyboard: [[{ text: "📱 Открыть", web_app: { url: webAppUrl } }], [{ text: "📜 История", callback_data: "version_history" }]]
            }, 'HTML'
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
                      // 1. Пробуем TikWM
                      let tikData = null;
                      try {
                        const apiRes = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(tikTokUrl)}`);
                        const apiJson = await apiRes.json();
                        if (apiJson.code === 0 && apiJson.data) tikData = apiJson.data;
                      } catch (e) {}

                      // 2. Пробуем Cobalt (co.wuk.sh)
                      let cobaltUrl = await getCobaltLink(tikTokUrl);

                      // 3. Пробуем OEmbed
                      let oembedData = null;
                      if (!tikData) {
                          oembedData = await getTikTokMetadata(tikTokUrl);
                      }

                      // === СБОРКА ДАННЫХ ===
                      let finalVideoUrl = null;
                      let finalCover = null;
                      let finalAuthor = 'unknown';
                      let finalId = null;

                      if (tikData) {
                          finalId = tikData.id;
                          finalCover = tikData.cover;
                          finalAuthor = tikData.author ? tikData.author.unique_id : 'unknown';
                          // Приоритет Play URL от TikWM, т.к. Cobalt может быть перегружен
                          // Но если ссылка без домена, добавляем
                          finalVideoUrl = tikData.play; 
                          
                          if (tikData.images && tikData.images.length > 0) {
                             await sendMessage(token, chatId, "❌ Это слайд-шоу!");
                             return res.status(200).json({ ok: true }); 
                          }
                      } 
                      else if (cobaltUrl) {
                          finalVideoUrl = cobaltUrl;
                          finalId = extractIdFromUrl(tikTokUrl) || Date.now().toString();
                          
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

          // --- /MAINTENANCE (NEW 25.12.8) ---
          else if (text.startsWith('/maintenance')) {
             const parts = text.split(/\s+/);
             const mode = parts[1]; // on, off или пусто

             if (mode === 'on') {
                 // Включаем флаг
                 await fetch(`${DB_URL}/set/maintenance_mode/true`, { headers: { Authorization: `Bearer ${DB_TOKEN}` } });
                 await sendMessage(token, chatId, "🚧 <b>Режим обслуживания ВКЛЮЧЕН!</b>\nПользователи видят заглушку.", null, 'HTML');
             } else if (mode === 'off') {
                 // Выключаем флаг
                 await fetch(`${DB_URL}/set/maintenance_mode/false`, { headers: { Authorization: `Bearer ${DB_TOKEN}` } });
                 await sendMessage(token, chatId, "✅ <b>Режим обслуживания ВЫКЛЮЧЕН!</b>\nЛента доступна.", null, 'HTML');
             } else {
                 // Меню
                 await sendMessage(token, chatId, 
                     `🔧 <b>Тех. Меню:</b>\n\n` + 
                     `🚧 <code>/maintenance on</code> - Вкл заглушку\n` + 
                     `✅ <code>/maintenance off</code> - Выкл заглушку\n` +
                     `🗑 <code>/clear</code> - Очистить ленту\n` +
                     `📊 <code>/count</code> - Кол-во видео\n` +
                     `📡 <code>/status</code> - Статус Redis`, 
                     null, 'HTML');
             }
          }

          // --- /CLEAR ---
          else if (text === '/clear') {
              await fetch(`${DB_URL}/del/feed_videos`, { headers: { Authorization: `Bearer ${DB_TOKEN}` } });
              await sendMessage(token, chatId, "🗑 <b>База очищена!</b>", null, 'HTML');
          }

          // --- /COUNT ---
          else if (text === '/count') {
              try {
                  const r = await fetch(`${DB_URL}/llen/feed_videos`, { headers: { Authorization: `Bearer ${DB_TOKEN}` } });
                  const d = await r.json();
                  await sendMessage(token, chatId, `📊 Видео в ленте: ${d.result || 0}`, null, 'HTML');
              } catch(e) { await sendMessage(token, chatId, "❌ Ошибка Redis"); }
          }
          
          // --- /STATUS ---
          else if (text === '/status') {
              try {
                  const r = await fetch(`${DB_URL}/ping`, { headers: { Authorization: `Bearer ${DB_TOKEN}` } });
                  await sendMessage(token, chatId, `Redis: ${r.ok ? '🟢 OK' : '🔴 ERROR'}`, null, 'HTML');
              } catch(e) { await sendMessage(token, chatId, "❌ Нет подключения к Redis"); }
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
          if (text.startsWith('/add') || text.startsWith('/clear') || text.startsWith('/maintenance')) return res.status(200).json({ ok: true });
          
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

// === HELPERS ===

async function getTikTokMetadata(url) {
    try {
        const res = await fetch(`https://www.tiktok.com/oembed?url=${url}`);
        const data = await res.json();
        return {
            author_name: data.author_name, 
            title: data.title, 
            thumbnail_url: data.thumbnail_url 
        };
    } catch (e) { return null; }
}

async function getCobaltLink(url) {
    try {
        // ✅ ФИКС 25.12.8: используем co.wuk.sh
        const response = await fetch("https://co.wuk.sh/api/json", {
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
