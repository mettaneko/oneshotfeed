import { createClient } from '@vercel/kv';
import { v4 as uuidv4 } from 'uuid'; // Хотя здесь не используется, оставим для унификации

const kv = createClient({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        const { exclude = [] } = req.body;
        // KV возвращает строки, их нужно парсить
        const allVideoStrings = await kv.lrange('feed_videos', 0, -1);
        const allVideoObjects = allVideoStrings.map(str => JSON.parse(str));

        const availableVideos = allVideoObjects.filter(video => 
            video && video.id && !exclude.includes(video.id)
        );

        const selectedVideos = [];
        const count = Math.min(10, availableVideos.length);

        for (let i = 0; i < count; i++) {
            const randomIndex = Math.floor(Math.random() * availableVideos.length);
            selectedVideos.push(availableVideos[randomIndex]);
            availableVideos.splice(randomIndex, 1);
        }
        
        res.status(200).json(selectedVideos);
    } catch (e) {
        console.error('Get Feed Error:', e);
        res.status(500).json([]);
    }
}
