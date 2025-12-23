export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    
    const DB_URL = process.env.KV_REST_API_URL;
    const DB_TOKEN = process.env.KV_REST_API_TOKEN;

    try {
        const response = await fetch(`${DB_URL}/lrange/feed_videos/0/-1`, {
            headers: { Authorization: `Bearer ${DB_TOKEN}` }
        });
        const data = await response.json();

        // Превращаем строки из Redis в объекты и переворачиваем (новые сверху)
        const videos = (data.result || [])
            .map(str => JSON.parse(str))
            .reverse();

        // Получаем статус техработ (если есть)
        const maintRes = await fetch(`${DB_URL}/get/maintenance_mode`, {
            headers: { Authorization: `Bearer ${DB_TOKEN}` }
        });
        const maintData = await maintRes.json();

        res.status(200).json({
            videos: videos,
            maintenance: maintData.result === 'true'
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}