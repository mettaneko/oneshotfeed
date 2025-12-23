import { createClient } from '@vercel/kv';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const kv = createClient({
        url: process.env.KV_REST_API_URL,
        token: process.env.KV_REST_API_TOKEN,
    });

    try {
        const { exclude = [] } = req.body;
        const allVideoStrings = await kv.lrange('feed_videos', 0, -1); // Берем все
        
        const availableVideos = allVideoStrings
            .map(str => JSON.parse(str))
            .filter(video => video && video.id && !exclude.includes(video.id));

        const selectedVideos = [];
        const count = Math.min(10, availableVideos.length);

        for (let i = 0; i < count; i++) {
            const randomIndex = Math.floor(Math.random() * availableVideos.length);
            selectedVideos.push(availableVideos[randomIndex]);
            availableVideos.splice(randomIndex, 1); // Удаляем, чтобы не выбрать снова
        }
        
        res.status(200).json(selectedVideos);

    } catch (e) {
        console.error(`Get Feed Error:`, e);
        res.status(500).json([]);
    }
}
