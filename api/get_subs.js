import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Access-Control-Allow-Headers', 'user-id');

  const userId = req.headers['user-id'] || req.query.userId;

  if (!userId) {
    return res.status(400).json([]);
  }

  try {
    // 1. Получаем список авторов, на которых подписан юзер
    const subsKey = `user:${userId}:subs`;
    const subscribedAuthors = await kv.smembers(subsKey); // Возвращает массив авторов

    if (!subscribedAuthors || subscribedAuthors.length === 0) {
      return res.status(200).json([]); // Нет подписок — пустая лента
    }

    // 2. Получаем последние 1000 видео из общей ленты (Upstash KV не умеет делать сложные WHERE запросы, фильтруем в коде)
    // Используем raw JSON list, который мы сделали в фиксе базы
    // Сначала пробуем получить как массив JSON
    let allVideos = [];
    
    // Пытаемся получить feed_videos. Если это массив JSON (после нашего фикса)
    const rawData = await kv.get('feed_videos');
    
    if (rawData && Array.isArray(rawData)) {
        allVideos = rawData;
    } else {
        // Если вдруг используется старый формат списка (LRANGE)
        const listData = await kv.lrange('feed_videos', 0, 1000);
        allVideos = listData.map(item => typeof item === 'string' ? JSON.parse(item) : item);
    }

    // 3. Фильтруем: оставляем только тех, кто есть в подписках
    const subFeed = allVideos.filter(video => {
        // Очищаем автора от @ на всякий случай для сравнения
        const cleanAuthor = (video.author || "").replace('@', '');
        return subscribedAuthors.includes(cleanAuthor);
    });

    return res.status(200).json(subFeed);

  } catch (error) {
    console.error("Subs Error:", error);
    return res.status(500).json([]);
  }
}
