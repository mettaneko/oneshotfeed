export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(200).send('OK');

    const body = req.body;
    const token = process.env.BOT_TOKEN;
    const adminId = process.env.ADMIN_ID;
    const webAppUrl = 'https://mettaneko.github.io/oneshotfeed/'; // ТВОЯ ССЫЛКА
    
    // База данных
    const DB_URL = process.env.KV_REST_API_URL;
    const DB_TOKEN = process.env.KV_REST_API_TOKEN;

    // === 1. ОБРАБОТКА КНОПОК (Callback Query) ===
    if (body.callback_query) {
      const callbackId = body.callback_query.id;
      const chatId = body.callback_query.message.chat.id;
      const data = body.callback_query.data;
      let textToSend = '';

      if (data === 'version_history') {
        textToSend = `
📜 *История версий Niko Feed:*
*25.12.1* - Бета-тест.
*25.12.2* - Добавлена предложка и подписки.
*25.12.3* - Оптимизация.
*25.12.4* - Защита от спама.
*25.12.5* - Улучшенный плеер.
*25.12.6* - Авто-парсинг TikTok.
        `;
      }

      if (textToSend) {
          await sendMessage(token, chatId, textToSend, null, 'Markdown');
      }
      
      await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: callbackId })
      });

      return res.status(200).json({ ok: true });
    }

    // === 2. ОБРАБОТКА СООБЩЕНИЙ ===
    const msg = body.message || body.channel_post;

    if (msg) {
      const chatId = msg.chat.id;
      const text = msg.text || msg.caption || '';
      const user = msg.from || { id: chatId, username: 'Channel' };

      // --- СОХРАНЯЕМ ЮЗЕРА (для рассылки) ---
      if (DB_URL && DB_TOKEN && chatId > 0) {
        try {
            await fetch(`${DB_URL}/sadd/all_bot_users/${chatId}`, {
                headers: { Authorization: `Bearer ${DB_TOKEN}` }
            });
        } catch (e) {}
      }

      // === КОМАНДА /START ===
      if (text === '/start') {
        await sendMessage(token, chatId, 
            "👋 Привет! Добро пожаловать в Niko Feed.",
            {
              inline_keyboard: [
                [{ text: "📱 Открыть приложение", web_app: { url: webAppUrl } }],
                [{ text: "📜 История версий", callback_data: "version_history" }]
              ]
            }
        );
      } 

      // === КОМАНДА /ADD (Только Админ) ===
      else if (text.startsWith('/add') && chatId.toString() === adminId) {
          // Ищем ссылку
          const parts = text.split(/\s+/);
          let tikTokUrl = parts.find(p => p.includes('http'));

          if (!tikTokUrl) {
              await sendMessage(token, chatId, "❌ Нет ссылки. Пиши: <code>/add https://vm.tiktok.com/...</code>", null, 'HTML');
          } else {
              await sendMessage(token, chatId, "⏳ <b>Загружаю...</b>", null, 'HTML');

              try {
                  const apiRes = await fetch(`https://www.tikwm.com/api/?url=${tikTokUrl}`);
                  const apiData = await apiRes.json();

                  if (apiData.code === 0 && apiData.data) {
                      const v = apiData.data;
                      
                      const newVideo = {
                          id: v.id,
                          videoUrl: v.play,
                          author: v.author.unique_id, 
                          desc: 'on tiktok', // <--- КАК ТЫ ПРОСИЛ
                          cover: v.cover
                      };

                      await fetch(`${DB_URL}/rpush/feed_videos/${JSON.stringify(newVideo)}`, {
                          headers: { Authorization: `Bearer ${DB_TOKEN}` }
                      });

                      await sendMessage(token, chatId, 
                          `✅ <b>Сохранено!</b>\n👤 @${newVideo.author}\n🔗 <a href="${newVideo.videoUrl}">Видео</a>`, 
                          null, 'HTML');

                  } else {
                      await sendMessage(token, chatId, "❌ Ошибка скачивания (приватное видео?).");
                  }
              } catch (e) {
                  await sendMessage(token, chatId, "❌ Ошибка скрипта: " + e.message);
              }
          }
      }

      // === РАССЫЛКА (/broadcast) ===
      else if (text.startsWith('/broadcast') && chatId.toString() === adminId) {
          const bText = text.replace('/broadcast', '').trim();
          if(!bText) return sendMessage(token, chatId, "Пиши: /broadcast Текст");
          
          let users = [];
          try {
             const r = await fetch(`${DB_URL}/smembers/all_bot_users`, {headers:{Authorization:`Bearer ${DB_TOKEN}`}});
             const d = await r.json();
             users = d.result || [];
          } catch(e){}

          let count = 0;
          for(const u of users) {
              try { await sendMessage(token, u, `📢 <b>Новости:</b>\n${bText}`, null, 'HTML'); count++; } catch(e){}
          }
          await sendMessage(token, chatId, `Рассылка ушла ${count} людям.`);
      }

      // === ПРЕДЛОЖКА (Юзеры) ===
      else if (chatId.toString() !== adminId && chatId > 0) {
          if (text.includes('http')) {
              await sendMessage(token, adminId, `🚨 <b>ПРЕДЛОЖКА:</b>\n${text}`, null, 'HTML');
              await sendMessage(token, chatId, "✅ Передал админу!");
          } else {
              // Удаляем лишнее
              try {
                await fetch(`https://api.telegram.org/bot${token}/deleteMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ chat_id: chatId, message_id: msg.message_id })
                });
              } catch(e){}
              
              await sendMessage(token, chatId, "Меню:", {
                  inline_keyboard: [[{ text: "📱 Открыть", web_app: { url: webAppUrl } }]]
              });
          }
      }
    }

    res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Bot Error' });
  }
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
