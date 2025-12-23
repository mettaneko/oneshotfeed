import { kv } from '@vercel/kv';
import { jwt } from 'jsonwebtoken';
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key';

export default async function handler(req, res) {
    // Тут логика ленты подписок
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const { userId } = jwt.verify(token, JWT_SECRET);
        const subscribedTo = await kv.smembers(`user:${userId}:subscriptions`);
        
        if (subscribedTo.length === 0) return res.status(200).json([]);

        // Очень упрощенная логика: берем последние видео от всех, на кого подписан
        // В проде тут нужен будет более сложный алгоритм
        let videoIds = [];
        for (const authorId of subscribedTo) {
            const authorVideos = await kv.zrange(`user:${authorId}:videos`, 0, 5, { rev: true });
            videoIds.push(...authorVideos);
        }
        
        if (videoIds.length === 0) return res.status(200).json([]);

        const pipeline = kv.pipeline();
        videoIds.forEach(id => pipeline.hgetall(`video:${id}`));
        const videos = await pipeline.exec();

        // Все видео в ленте подписок помечаются как "подписан"
        const processedVideos = videos.map(v => ({...v, subscribed: true}));

        res.status(200).json(processedVideos);

    } catch (e) {
        res.status(401).json({ error: 'Invalid token' });
    }
}
