export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(200).send('OK');

    const body = req.body;
    const token = process.env.BOT_TOKEN;
    const adminId = process.env.ADMIN_ID;
    const webAppUrl = 'https://mettaneko.github.io/oneshotfeed/'; // ТВОЯ ССЫЛКА
    
    // Переменные базы данных (для рассылки)
    const DB_URL = process.env.KV_REST_API_URL;
    const DB_TOKEN = process.env.KV_REST_API_TOKEN;

    // === 1. ОБРАБОТКА КНОПОК (Callback Query) ===
    if (body.callback_query) {
      const callbackId = body.callback_query.id;
      const chatId = body.callback_query.message.chat.id;
      const data = body.callback_query.data;
      let textToSend = '';
      let parseMode = 'Markdown';

      if (data === 'version_history') {
        textToSend = `
📜 *История версий Niko Feed:*
(Нумерация - Год.Месяц.Номер версии)

*25.12.1* - Бета-тест.
*25.12.2* - Добавлена предложка и подписки.
*25.12.3* - Добавлена оптимизация для Telegram Mini-apps.
*25.12.4* - Защита от спама и чуть улучшенный интерфейс.
*25.12.5* - Улучшено взаимодействие с плеером и добавлено стартовое сообщение при написании \`/start\`.
*25.12.6* - Добавлена предложка напрямую в бота.
*25.12.6H* - Откат предыдущего апдейта.
*25.12.6R* - Фикс багов с кнопками стартового сообщения.
        `;
      } 
      // Блок suggest_info оставим на случай, если кто-то нажмет старую кнопку в чате
      else if (data === 'suggest_info') {
        parseMode = 'HTML';
        textToSend = `
📹 <b>Как предложить видео?</b>

Просто отправь мне в сообщении:
1. <b>Никнейм</b> автора
2. <i>Ссылку</i> на TikTok/YouTube/Reels или <i>сам видео-файл</i>.
3. Описание (до 100 симв.).

Или сделай это прямо в приложении! 👾
        `;
      }

      // Отправляем ответ
      if (textToSend) {
          await sendMessage(token, chatId, textToSend, null, parseMode);
      }
      
      // Закрываем часики загрузки
      await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: callbackId })
      });

      return res.status(200).json({ ok: true });
    }

    // === 2. ОБРАБОТКА СООБЩЕНИЙ ===
    if (body.message) {
      const chatId = body.message.chat.id;
      const text = body.message.text;
      const msgId = body.message.message_id;
      const user = body.message.from;
      const username = user.username ? `@${user.username}` : `ID: ${user.id}`;

      // --- СОХРАНЯЕМ ЮЗЕРА (для рассылки) ---
      if (DB_URL && DB_TOKEN) {
        try {
            await fetch(`${DB_URL}/sadd/all_bot_users/${chatId}`, {
                headers: { Authorization: `Bearer ${DB_TOKEN}` }
            });
        } catch (e) { console.error('DB Error', e); }
      }

      // === КОМАНДА /START ===
      if (text === '/start') {
        await sendMessage(token, chatId, 
            "👋 Привет! Добро пожаловать в Niko Feed.\nСмотри, предлагай видео или просто читай обновления!",
            {
              inline_keyboard: [
                [
                  { text: "📱 Открыть приложение", web_app: { url: webAppUrl } }
                ],
                [
                  // Кнопку предложки убрали, оставили только Историю
                  { text: "📜 История версий", callback_data: "version_history" }
                ]
              ]
            }
        );
      } 

      // === РАССЫЛКА (Только для админа) ===
      else if (text && text.startsWith('/broadcast') && chatId.toString() === adminId) {
          const broadcastText = text.replace('/broadcast', '').trim();
          if (!broadcastText) {
              await sendMessage(token, adminId, "❌ Пиши так: <code>/broadcast Текст</code>", null, 'HTML');
          } else {
              await sendMessage(token, adminId, "⏳ Рассылаю...", null, 'HTML');
              
              let users = [];
              try {
                  const dbRes = await fetch(`${DB_URL}/smembers/all_bot_users`, {
                      headers: { Authorization: `Bearer ${DB_TOKEN}` }
                  });
                  const dbData = await dbRes.json();
                  users = dbData.result || [];
              } catch(e) { users = []; }

              let count = 0;
              for (const userId of users) {
                  try {
                      await sendMessage(token, userId, `📢 <b>Новости Niko Feed:</b>\n\n${broadcastText}`, null, 'HTML');
                      count++;
                  } catch (e) {}
              }
              await sendMessage(token, adminId, `✅ Рассылка завершена. Получили: ${count}`, null, 'HTML');
          }
      }

      // === ЛОГИКА ПРЕДЛОЖКИ (Скрытая) ===
      else if (chatId.toString() !== adminId) {
        
        // A) Если прислали ССЫЛКУ
        if (text && text.includes('http')) {
             await sendMessage(token, adminId, `🚨 <b>ПРЕДЛОЖКА (ССЫЛКА)</b>\n👤 <b>От:</b> ${username}\n\n${text}`, null, 'HTML');
             await sendMessage(token, chatId, "✅ <b>Принято!</b> Передал в модерацию.", null, 'HTML');
        }
        
        // B) Если прислали ВИДЕО
        else if (body.message.video) {
             await sendMessage(token, adminId, `🚨 <b>ПРЕДЛОЖКА (ВИДЕО)</b>\n👤 <b>От:</b> ${username}`, null, 'HTML');
             await fetch(`https://api.telegram.org/bot${token}/forwardMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: adminId, from_chat_id: chatId, message_id: msgId })
             });
             if (body.message.caption) {
                await sendMessage(token, adminId, `📝 <b>Описание:</b> ${body.message.caption}`, null, 'HTML');
             }
             await sendMessage(token, chatId, "✅ <b>Принято!</b> Видео ушло в модерацию.", null, 'HTML');
        }

        // C) Если непонятный текст — удаляем и шлем меню
        else {
             try {
                await fetch(`https://api.telegram.org/bot${token}/deleteMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ chat_id: chatId, message_id: msgId })
                });
             } catch (e) {}
             
             // Шлем меню (без кнопки предложки)
             await sendMessage(token, chatId, 
                "👋 Привет! Добро пожаловать в Niko Feed.\nСмотри, предлагай видео или просто читай обновления!",
                {
                  inline_keyboard: [
                    [{ text: "📱 Открыть приложение", web_app: { url: webAppUrl } }],
                    [
                      { text: "📜 История версий", callback_data: "version_history" }
                    ]
                  ]
                }
            );
        }
      }
    }

    res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Bot Error' });
  }
}

// === ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ ===
async function sendMessage(token, chatId, text, keyboard = null, parseMode = 'Markdown') {
    const body = {
        chat_id: chatId,
        text: text,
        parse_mode: parseMode,
        disable_web_page_preview: true
    };
    if (keyboard) body.reply_markup = keyboard;

    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
}
