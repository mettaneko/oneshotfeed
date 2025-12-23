import { createClient } from '@vercel/kv';
import crypto from 'crypto';

function validateTelegramAuth(initData, botToken) {
    if (!initData) return null;
    try {
        const params = new URLSearchParams(initData);
        const hash = params.get('hash');
        params.delete('hash');
        params.sort();
        let dataCheckString = '';
        for (const [key, value] of params.entries()) { dataCheckString += `${key}=${value}\n`; }
        dataCheckString = dataCheckString.slice(0, -1);
        const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
        const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
        if (computedHash === hash) return JSON.parse(params.get('user'));
    } catch (e) { return null; }
}

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

export default async function handler(req, res) {
    // === ПРИВАТНЫЙ ЭНДПОИНТ, АВТОРИЗАЦИЯ ОБЯЗАТЕЛЬНА ===

    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Telegram-Auth');
    if (req.method === 'OPTIONS') return res.status(200).end();

    // 1. Валидация
    const initData = req.headers['x-telegram-auth'];
    const user = validateTelegramAuth(initData, process.env.BOT_TOKEN);
    if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const kv = createClient({
        url: process.env.KV_REST_API_URL,
        token: process.env.KV_REST_API_TOKEN,
    });

    try {
        // 2. Получаем подписки пользователя
        const userSubsKey = `subs:${user.id}`;
        const subscribedAuthors = await kv.smembers(userSubsKey);
        if (!subscribedAuthors || subscribedAuthors.length === 0) {
            return res.status(200).json([]);
        }

        // 3. Получаем видео и фильтруем
        const allVideoStrings = await kv.lrange('feed_videos', 0, 499);
        if (!allVideoStrings) return res.status(200).json([]);
        
        const videosToShuffle = allVideoStrings
            .map(str => JSON.parse(str))
            .filter(video => subscribedAuthors.includes(video.author));

        // 4. Перемешиваем и отдаем
        const shuffledPlaylist = shuffle(videosToShuffle);
        res.status(200).json(shuffledPlaylist);

    } catch (e) {
        console.error(`Get Subs Error:`, e);
        res.status(500).json([]);
    }
}
