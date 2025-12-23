import { createClient } from '@vercel/kv';

// Функция для перемешивания массива (Фишера-Йетса)
function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

export default async function handler(req, res) {
    // === ПУБЛИЧНЫЙ ЭНДПОИНТ, БЕЗ АВТОРИЗАЦИИ ===

    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const kv = createClient({
        url: process.env.KV_REST_API_URL,
        token: process.env.KV_REST_API_TOKEN,
    });

    try {
        // 1. Получаем последние 500 видео из базы
        const allVideoStrings = await kv.lrange('feed_videos', 0, 499);
        if (!allVideoStrings || allVideoStrings.length === 0) {
            return res.status(200).json([]);
        }
        
        const videosToShuffle = allVideoStrings
            .map(str => { try { return JSON.parse(str); } catch { return null; } })
            .filter(Boolean);

        // 2. Перемешиваем и отдаем
        const shuffledPlaylist = shuffle(videosToShuffle);
        res.status(200).json(shuffledPlaylist);

    } catch (e) {
        console.error(`Get Feed Error:`, e);
        res.status(500).json([]);
    }
}
