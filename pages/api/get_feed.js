export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  
  const DB_URL = process.env.KV_REST_API_URL;
  const DB_TOKEN = process.env.KV_REST_API_TOKEN;

  if (!DB_URL) return res.status(500).json({ error: 'No DB config' });

  try {
    // Получаем список видео
    const response = await fetch(`${DB_URL}/lrange/feed_videos/0/-1`, {
      headers: { Authorization: `Bearer ${DB_TOKEN}` }
    });
    const data = await response.json();
    
    // Превращаем строки Redis обратно в объекты
    const videos = (data.result || [])
      .map(item => {
        try { return JSON.parse(item); } catch { return null; }
      })
      .filter(Boolean);

    res.status(200).json(videos);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
