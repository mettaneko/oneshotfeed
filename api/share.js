// /api/share.js

/**
 * Асинхронная функция для отправки видео через Telegram Bot API.
 */
async function sendVideoToTelegram(token, chatId, videoUrl, caption, keyboard = null) {
    const apiUrl = `https://api.telegram.org/bot${token}/sendVideo`;
    
    const body = {
        chat_id: chatId,
        video: videoUrl,
        caption: caption,
        parse_mode: 'HTML',
        disable_web_page_preview: true
    };

    // Если есть клавиатура (кнопка), добавляем её
    if (keyboard) {
        body.reply_markup = keyboard;
    }

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    
    return response.json();
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    res.setHeader('Access-Control-Allow-Origin', '*'); 
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        // ДОБАВИЛ: id в деструктуризацию
        const { id, videoUrl, author, desc, user } = req.body;

        if (!videoUrl || !user || !user.id) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const botToken = process.env.BOT_TOKEN;
        const botUsername = 'OneShotFeedBot'; // Твой бот
        const appName = 'app'; // Твое короткое имя приложения

        const chatId = user.id;
        
        // === ГЕНЕРАЦИЯ DEEP LINK ===
        // Если ID пришел, делаем красивую ссылку, иначе просто ссылку на бота
        let deepLink = `https://t.me/${botUsername}/${appName}`;
        if (id) {
            deepLink += `?startapp=v_${id}`;
        }

        // Формируем подпись
        const caption = `📥 <b>Скачано из @OneShotFeedBot!</b>\n\n👤 Автор: <code>${author || 'unknown'}</code> ${desc || 'unknown'}\n🔗 <a href="${deepLink}">Открыть это видео в приложении</a>`;

        // Создаем кнопку "Смотреть в приложении"
        const keyboard = {
            inline_keyboard: [
                [{ text: "📱 Посмотреть в приложении!", url: deepLink }]
            ]
        };

        const tgResponse = await sendVideoToTelegram(botToken, chatId, videoUrl, caption, keyboard);

        if (tgResponse.ok) {
            return res.status(200).json({ success: true });
        } else {
            console.error('Telegram API Error:', tgResponse);
            return res.status(500).json({ error: 'Failed to send video', details: tgResponse.description });
        }

    } catch (error) {
        console.error('Share API Error:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}
