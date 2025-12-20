export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(200).send('OK');

    const body = req.body;
    const token = process.env.BOT_TOKEN;
    const adminId = process.env.ADMIN_ID;
    const webAppUrl = 'https://niko-feed.vercel.app'; // Твоя ссылка

    // === 1. ОБРАБОТКА КНОПОК (Callback Query) ===
    if (body.callback_query) {
      const callbackId = body.callback_query.id;
      const chatId = body.callback_query.message.chat.id;
      const data = body.callback_query.data;
      let textToSend = '';

      if (data === 'version_history') {
        textToSend = `
📜 <b>История версий Niko Feed:</b>
(Нумерация - Год.Месяц.Номер версии)

<b>25.12.1</b> - Бета-тест.
<b>25.12.2</b> - Добавлена предложка и подписки.
<b>25.12.3</b> - Добавлена оптимизация для Telegram Mini-apps.
<b>25.12.4</b> - Защита от спама и чуть улучшенный интерфейс.
<b>25.12.5</b> - Улучшено взаимодействие с плеером и добавлено стартовое сообщение при написании <code>/start</code>
        `;
      } else if (data === 'suggest_info') {
        textToSend = `
📹 <b>Как предложить видео?</b>

Просто отправь мне в сообщении:
1. <b>Никнейм</b> автора
2. <i>Ссылку</i> на TikTok/YouTube/Reels или <i>сам видео-файл</i>.
3. Описание (до 100 симв.), также не забудь указать <i>платформу</i>, где было взято видео, оно будет написано в приоритете.

Или сделай это прямо в приложени! 👾

И я сразу передам это в модерацию! 👇
        `;
      }

      // Отправляем ответ
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: textToSend,
          parse_mode: 'HTML'
        })
      });
      
      // Закрываем часики на кнопке
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
      const user = body.message.from;
      const msgId = body.message.message_id;
      const username = user.username ? `@${user.username}` : `ID: ${user.id}`;

      // Функция отправки меню
      const sendMenu = async () => {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: "👋 Привет! Добро пожаловать в Niko Feed.\n\nСмотри, предлагай видео или просто читай обновления!",
            reply_markup: {
              inline_keyboard: [
                [
                  { text: "📱 Открыть приложение", web_app: { url: webAppUrl } }
                ],
                [
                  { text: "📹 Предложить видео", callback_data: "suggest_info" },
                  { text: "📜 История версий", callback_data: "version_history" }
                ]
              ]
            }
          })
        });
      };

      // --- ЛОГИКА ---
      
      // 1. Команда /start
      if (text === '/start') {
        await sendMenu();
      } 
      
      // 2. Если пишет НЕ админ
      else if (chatId.toString() !== adminId) {
        
        // A) Ссылка (http)
        if (text && text.includes('http')) {
             await sendMessageToAdmin(token, adminId, `🚨 <b>ПРЕДЛОЖКА (ССЫЛКА)</b>\n👤 <b>От:</b> ${username}\n\n${text}`);
             await sendMessageToUser(token, chatId, "✅ <b>Принято!</b> Передал в модерацию.");
        } 
        
        // B) Видео-файл
        else if (body.message.video) {
             await sendMessageToAdmin(token, adminId, `🚨 <b>ПРЕДЛОЖКА (ВИДЕО)</b>\n👤 <b>От:</b> ${username}`);
             // Пересылаем видео админу
             await fetch(`https://api.telegram.org/bot${token}/forwardMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: adminId, from_chat_id: chatId, message_id: msgId })
             });
             // Если есть подпись к видео
             if (body.message.caption) {
                await sendMessageToAdmin(token, adminId, `📝 <b>Описание:</b> ${body.message.caption}`);
             }
             await sendMessageToUser(token, chatId, "✅ <b>Принято!</b> Видео ушло в модерацию.");
        }

        // C) Непонятный текст (не ссылка, не видео, не /start)
        else {
             // 1. Пытаемся удалить сообщение юзера (чтобы не мусорить)
             try {
                await fetch(`https://api.telegram.org/bot${token}/deleteMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ chat_id: chatId, message_id: msgId })
                });
             } catch (e) {} // Если бот не админ, может не сработать, игнорируем
             
             // 2. Кидаем меню (мол "я не понял, вот кнопки")
             await sendMenu();
        }
      }
    }

    res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Bot Error' });
  }
}

// Хелперы
async function sendMessageToAdmin(token, adminId, text) {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: adminId, text: text, parse_mode: 'HTML', disable_web_page_preview: true })
    });
}

async function sendMessageToUser(token, chatId, text) {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: text, parse_mode: 'HTML' })
    });
}
