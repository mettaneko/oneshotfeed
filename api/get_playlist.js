import { createClient } from '@vercel/kv';
import crypto from 'crypto';

// ФУНКЦИЯ ВАЛИДАЦИИ TELEGRAM
function validateTelegramAuth(initData, botToken) {
    if (!initData) return null;
    try {
        const params = new URLSearchParams(initData);
        const hash = params.get('hash');
        params.delete('hash');
        params.sort();
        let dataCheckString = '';
        for (const [key, value] of params.entries()) {
            dataCheckString += `${key}=${value}\n`;
        }
        dataCheckString = dataCheckString.slice(0, -1);

        const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
        const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
        
        if (computedHash === hash) {
            const user = JSON.parse(params.get('user'));
            return user;
        }
    } catch (e) {
        console.error('Auth validation error:', e);
    }
    return null;
}

// ФУНКЦИЯ ПЕРЕМЕШИВАНИЯ МАССИВА (Алгоритм Фишера-Йетса)
function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

export default async function handler(req, res) {
    // CORS (на случай, если домены снова разойдутся)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Telegram-Auth');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const kv = createClient({
        url: process.env.KV_REST_API_URL,
        token: process.env.KV_REST_API_TOKEN,
    });

    const { type } = req.query; // 'foryou' или 'following'

    try {
        // 1. Получаем ПОСЛЕДНИЕ 500 видео из базы (разумный лимит)
        const allVideoStrings = await kv.lrange('feed_videos', 0, 499);
        if (!allVideoStrings || allVideoStrings.length === 0) {
            return res.status(200).json([]);
        }
        
        let videosToShuffle = allVideoStrings
            .map(str => { try { return JSON.parse(str); } catch { return null; } })
            .filter(Boolean);

        // 2. Если это лента подписок, ФИЛЬТРУЕМ видео
        if (type === 'following') {
            const initData = req.headers['x-telegram-auth'];
            const user = validateTelegramAuth(initData, process.env.BOT_TOKEN);
            if (!user) return res.status(401).json([]);

            const userSubsKey = `user_subs:${user.id}`;
            const subscribedAuthors = await kv.smembers(userSubsKey);

            if (!subscribedAuthors || subscribedAuthors.length === 0) {
                return res.status(200).json([]);
            }
            
            videosToShuffle = videosToShuffle.filter(video => subscribedAuthors.includes(video.author));
        }

        // 3. Перемешиваем и отдаем готовый плейлист
        const shuffledPlaylist = shuffle(videosToShuffle);
        res.status(200).json(shuffledPlaylist);

    } catch (e) {
        console.error(`Get Playlist Error (type: ${type}):`, e);
        res.status(500).json([]);
    }
}
