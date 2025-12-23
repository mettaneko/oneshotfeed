import { createClient } from '@vercel/kv';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Telegram-Auth');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const kv = createClient({
        url: process.env.KV_REST_API_URL,
        token: process.env.KV_REST_API_TOKEN,
    });

    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const start = (page - 1) * limit;
        const end = start + limit - 1;

        const videoStrings = await kv.lrange('feed_videos', start, end);

        if (!videoStrings || videoStrings.length === 0) {
            return res.status(200).json([]);
        }

        const videos = videoStrings.map(item => {
            try { return typeof item === 'string' ? JSON.parse(item) : item; } 
            catch (e) { return null; }
        }).filter(Boolean);

        res.status(200).json(videos);

    } catch (e) {
        console.error('get_feed API Error:', e);
        res.status(500).json([]);
    }
}
