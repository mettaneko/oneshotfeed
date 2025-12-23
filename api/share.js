// /api/share.js

/**
 * Асинхронная функция для отправки видео через Telegram Bot API.
 * @param {string} token - Токен твоего бота.
 * @param {number|string} chatId - ID чата, куда отправлять видео.
 * @param {string} videoUrl - Прямая ссылка на видеофайл.
 * @param {string} caption - Текст подписи к видео.
 * @returns {Promise<object>} - Ответ от API Telegram.
 */
async function sendVideoToTelegram(token, chatId, videoUrl, caption) {
    const apiUrl = `https://api.telegram.org/bot${token}/sendVideo`;
    
    // Формируем тело запроса для метода sendVideo
    const body = {
        chat_id: chatId,
        video: videoUrl,      // URL видео для отправки
        caption: caption,     // Подпись к видео
        parse_mode: 'HTML'    // Используем HTML для возможного форматирования в будущем
    };

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    
    return response.json();
}

export default async function handler(req, res) {
    // Обрабатываем только POST-запросы
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // Стандартные заголовки для CORS
    res.setHeader('Access-Control-Allow-Origin', '*'); 
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Ответ на предварительный запрос OPTIONS от браузера
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const { videoUrl, author, desc, user } = req.body;

        // Проверяем, что все нужные данные пришли с фронтенда
        if (!videoUrl || !author || !desc || !user || !user.id) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const botToken = process.env.BOT_TOKEN;
        if (!botToken) {
            console.error('BOT_TOKEN is not set in environment variables.');
            return res.status(500).json({ error: 'Server configuration error' });
        }
        
        const chatId = user.id;

        // Собираем новую подпись в нужном тебе формате
        const caption = `📥 Скачано из @OneShotFeedBot!\n👤 Автор: ${author}\n📝 Платформа Автора: ${desc}`;

        // Вызываем нашу новую функцию для отправки видео
        const tgResponse = await sendVideoToTelegram(botToken, chatId, videoUrl, caption);

        if (tgResponse.ok) {
            // Если Telegram вернул "ok", отправляем успешный ответ на сайт
            return res.status(200).json({ success: true });
        } else {
            // Если Telegram вернул ошибку, логируем её и сообщаем сайту о проблеме
            console.error('Telegram API Error:', tgResponse);
            return res.status(500).json({ error: 'Failed to send video via Telegram', details: tgResponse.description });
        }

    } catch (error) {
        console.error('Share API Error:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}
