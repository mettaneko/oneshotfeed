// api/get_feed.js
export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (req.method === 'OPTIONS') return res.status(200).end();

    // 1. ПРОВЕРКА ПЕРЕМЕННЫХ
    const DB_URL = process.env.KV_REST_API_URL;
    const DB_TOKEN = process.env.KV_REST_API_TOKEN;

    if (!DB_URL || !DB_TOKEN) {
        console.error("Missing ENV variables");
        return res.status(500).json({ 
            error: 'Configuration Error', 
            details: 'KV_REST_API_URL or KV_REST_API_TOKEN is missing in Vercel Environment Variables.' 
        });
    }

    try {
        // 2. ЗАПРОС К БАЗЕ
        // Используем fetch, но оборачиваем в try/catch для деталей
        const page = parseInt(req.query.page) || 1;
        const start = (page - 1) * 10;
        const end = start + 9;

        const upstreamRes = await fetch(`${DB_URL}/lrange/feed_videos/${start}/${end}`, {
            headers: { Authorization: `Bearer ${DB_TOKEN}` }
        });

        if (!upstreamRes.ok) {
            const text = await upstreamRes.text();
            throw new Error(`Upstash Error ${upstreamRes.status}: ${text}`);
        }

        const data = await upstreamRes.json();
        
        // 3. ОБРАБОТКА ДАННЫХ
        if (!data.result) {
            return res.status(200).json([]); // Пустой результат, если ключа нет
        }

        const videos = data.result.map(str => {
            try { return JSON.parse(str); } catch (e) { return null; }
        }).filter(Boolean);

        res.status(200).json(videos);

    } catch (e) {
        console.error("Crash Details:", e);
        res.status(500).json({ 
            error: 'Server Crash', 
            message: e.message 
        });
    }
}
