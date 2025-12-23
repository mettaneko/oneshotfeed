import { kv } from '@vercel/kv';
// Тут должна быть логика твоей ленты "Для вас"

export default async function handler(req, res) {
    // Пока просто отдаем все видео подряд
    const page = parseInt(req.query.page || '0');
    const limit = 5;
    const start = page * limit;
    const end = start + limit - 1;

    const videoIds = await kv.zrange('feed:global', start, end, { rev: true });
    if (videoIds.length === 0) return res.status(200).json([]);
    
    const pipeline = kv.pipeline();
    videoIds.forEach(id => pipeline.hgetall(`video:${id}`));
    const videos = await pipeline.exec();
    
    // Добавим информацию о подписке (пока заглушка)
    const processedVideos = videos.map(v => ({...v, subscribed: false}));

    res.status(200).json(processedVideos);
}
