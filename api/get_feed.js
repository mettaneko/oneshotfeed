export default async function handler(req, res) {
    // 1. ЖЕСТКИЕ CORS ЗАГОЛОВКИ (Чтобы браузер не ругался)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Telegram-Auth');
    
    // Ответ на префлайт запрос
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // 2. ПОДКЛЮЧЕНИЕ К БАЗЕ ЧЕРЕЗ FETCH (Самый надежный способ)
    const DB_URL = process.env.KV_REST_API_URL;
    const DB_TOKEN = process.env.KV_REST_API_TOKEN;

    if (!DB_URL || !DB_TOKEN) {
        console.error("❌ KV_REST_API_URL or TOKEN is missing!");
        return res.status(500).json({ error: 'Database config missing' });
    }

    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const start = (page - 1) * limit;
        const end = start + limit - 1;

        // Запрос к Upstash REST API
        const response = await fetch(`${DB_URL}/lrange/feed_videos/${start}/${end}`, {
            headers: {
                Authorization: `Bearer ${DB_TOKEN}`
            }
        });

        if (!response.ok) {
            throw new Error(`Upstash API Error: ${response.statusText}`);
        }

        const data = await response.json();
        
        // В Upstash данные лежат в поле result
        const videoStrings = data.result;

        if (!videoStrings || videoStrings.length === 0) {
            return res.status(200).json([]);
        }

        // Парсим JSON-строки
        const videos = videoStrings.map(item => {
            try { return typeof item === 'string' ? JSON.parse(item) : item; } 
            catch (e) { return null; }
        }).filter(Boolean);

        res.status(200).json(videos);

    } catch (e) {
        console.error('SERVER ERROR:', e);
        // Возвращаем JSON с ошибкой, чтобы фронт не гадал
        res.status(500).json({ error: e.message });
    }
}
