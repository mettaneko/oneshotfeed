// pages/api/bot.js
export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(200).send('OK');

    const body = req.body;
    const token = process.env.BOT_TOKEN;
    const adminId = process.env.ADMIN_ID;
    const webAppUrl = 'https://niko-feed.vercel.app'; // ТВОЯ ССЫЛКА НА САЙТ

    // 1. Обработка нажатия кнопки (Callback Query)
    if (body.callback_query) {
      const callbackId = body.callback_query.id;
      const chatId = body.callback_query.message.chat.id;
      const data = body.callback_query.data;

      if (data === 'version_history') {
        // Текст истории версий
        const historyText = `
📜 *История версий Niko Feed:*
(Нумерация - Год.Месяц.Номер версии)

*25.12.1* - Бета-тест.
*25.12.2* - Добавлена предложка и подписки.
*25.12.3* - Добавлена оптимизация для Telegram Mini-apps.
*25.12.4* - Защита от спама и чуть улучшенный интерфейс.
*25.12.5* - Улучшено взаимодействие с плеером и добавлено стартовое сообщение при написании \`/start\`.
*25.12.6* - Добавлена предложка напрямую в бота.
*25.12.6H* - Откат предыдущего апдейта.
        `;
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: historyText,
            parse_mode: 'Markdown'
          })
        });
      }
      
      // Закрываем часики загрузки на кнопке
      await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: callbackId })
      });

      return res.status(200).json({ ok: true });
    }

    // 2. Обработка сообщений
    if (body.message) {
      const chatId = body.message.chat.id;
      const text = body.message.text;
      const msgId = body.message.message_id;

      // Команда /start
      if (text === '/start') {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: "👋 Привет! Добро пожаловать в Niko Feed.\nСмотри, предлагай видео или просто читай обновления!",
            reply_markup: {
              inline_keyboard: [
                [
                  { text: "📱 Открыть приложение", web_app: { url: webAppUrl } }
                ],
                [
                  { text: "📜 История версий", callback_data: "version_history" }
                ]
              ]
            }
          })
        });
      } 
      // ЛЮБОЕ другое сообщение — пересылаем админу
      else if (chatId.toString() !== adminId) {
        await fetch(`https://api.telegram.org/bot${token}/forwardMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: adminId,    // Куда (тебе)
            from_chat_id: chatId,// Откуда (от юзера)
            message_id: msgId    // Какое сообщение
          })
        });
      }
    }

    res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Bot Error' });
  }
}
