// api/get_feed.js
import { kv } from '@vercel/kv';

export default async function handler(req, res) {
    // Разрешаем CORS (чтобы работать с любого домена)
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');

    try {
        // Получаем номер страницы (0, 1, 2...) из URL
        // По умолчанию 0
        const page = parseInt(req.query.page || '0');
        const limit = 5; // Грузим по 5 видео за раз (Lazy Load)

        const start = page * limit;
        const end = start + limit - 1;

        // Достаем диапазон видео из списка 'feed_videos'
        // LRANGE возвращает массив строк (если ты хранил JSON как строки)
        // или массив объектов (если Vercel KV сам распарсил)
        const rawVideos = await kv.lrange('feed_videos', start, end);

        // Если данных нет — возвращаем пустой массив
        if (!rawVideos || rawVideos.length === 0) {
            return res.status(200).json([]);
        }

        // Если данные лежат как строки JSON — парсим их
        // Если уже объекты — просто отдаем
        const videos = rawVideos.map(item => {
            return typeof item === 'string' ? JSON.parse(item) : item;
        });

        res.status(200).json(videos);

    } catch (error) {
        console.error("Redis Error:", error);
        res.status(500).json({ error: 'Failed to fetch feed' });
    }
}
