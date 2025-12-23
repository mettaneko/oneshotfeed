import crypto from 'crypto';

// Функция для валидации данных, полученных от Telegram Web App
function validateTelegramAuth(initData, botToken) {
    if (!initData) {
        return null;
    }
    try {
        const params = new URLSearchParams(initData);
        const hash = params.get('hash');
        params.delete('hash');
        params.sort(); // Ключи должны быть отсортированы

        let dataCheckString = '';
        for (const [key, value] of params.entries()) {
            dataCheckString += `${key}=${value}\n`;
        }
        dataCheckString = dataCheckString.slice(0, -1);

        const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
        const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
        
        // Если хэши совпадают, данные подлинные
        if (computedHash === hash) {
            const user = JSON.parse(params.get('user'));
            return user;
        }
    } catch (e) {
        console.error('Auth validation error:', e);
    }
    return null;
}

export default async function handler(req, res) {
    // 1. Настройка CORS для Vercel
    res.setHeader('Access-Control-Allow-Origin', '*'); // Разрешаем запросы с любого домена
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Telegram-Auth');

    // Ответ на предварительный OPTIONS-запрос от браузера
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    // Принимаем только POST-запросы
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // 2. Валидация пользователя
    const initData = req.headers['x-telegram-auth'];
    const user = validateTelegramAuth(initData, process.env.BOT_TOKEN);

    if (!user) {
        return res.status(401).json({ error: 'Unauthorized: Invalid Telegram data' });
    }

    // 3. Логика отправки видео
    const { videoUrl, author, desc } = req.body;
    const botToken = process.env.BOT_TOKEN;

    if (!videoUrl) {
        return res.status(400).json({ error: 'videoUrl is required' });
    }

    // Формируем подпись к видео
    const caption = 
      `📥 Скачано из <b>@OneShotFeedBot</b>\n` +
      `👤 Автор: <b>@${author || 'unknown'}</b>\n` + 
      (desc ? `📝 ${desc}` : '');

    // Формируем кнопки под видео
    const keyboard = {
        inline_keyboard: [[
            { text: "🔗 Ссылка на файл", url: videoUrl },
            { text: "👤 Профиль автора", url: `https://www.tiktok.com/@${author}` }
        ]]
    };

    try {
        // Отправляем видео пользователю, который нажал кнопку
        const telegramRes = await fetch(`https://api.telegram.org/bot${botToken}/sendVideo`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: user.id, // ID пользователя, который сделал запрос
                video: videoUrl,
                caption: caption,
                parse_mode: 'HTML',
                reply_markup: keyboard
            })
        });

        const telegramData = await telegramRes.json();

        if (!telegramData.ok) {
            // Если у Telegram не получилось отправить видео (например, файл слишком большой)
            console.error('Telegram API Error:', telegramData.description);
            return res.status(500).json({ error: 'Failed to send video via Telegram' });
        }

        res.status(200).json({ ok: true, message: 'Video sent successfully' });

    } catch (e) {
        console.error('Internal Server Error:', e);
        res.status(500).json({ error: 'Internal Server Error' });
    }
}
