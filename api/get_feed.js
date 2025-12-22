export default async function handler(req, res) {
  // CORS заголовки (на всякий случай)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  const DB_URL = process.env.KV_REST_API_URL;
  const DB_TOKEN = process.env.KV_REST_API_TOKEN;

  if (!DB_URL) return res.status(500).json({ error: 'No DB config' });

  try {
    // Параллельный запрос статуса и видео
    const [maintRes, feedRes] = await Promise.all([
        fetch(`${DB_URL}/get/maintenance_mode`, { headers: { Authorization: `Bearer ${DB_TOKEN}` } }),
        fetch(`${DB_URL}/lrange/feed_videos/0/-1`, { headers: { Authorization: `Bearer ${DB_TOKEN}` } })
    ]);

    const maintData = await maintRes.json();
    const feedData = await feedRes.json();
    
    // Определяем режим
    const isMaintenance = maintData.result === 'true';

    // Парсим видео (новые сверху)
    const videos = (feedData.result || [])
      .map(item => { try { return JSON.parse(item); } catch { return null; } })
      .filter(Boolean)
      .reverse();

    // Отдаем всё вместе. Фронтенд сам решит, показывать или нет.
    res.status(200).json({
        maintenance: isMaintenance,
        result: videos
    });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
