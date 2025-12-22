export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  const DB_URL = process.env.KV_REST_API_URL;
  const DB_TOKEN = process.env.KV_REST_API_TOKEN;

  // Если нет конфига, пробуем отдать статику (но лучше ошибку)
  if (!DB_URL || !DB_TOKEN) {
      return res.status(500).json({ error: 'Database config missing' });
  }

  try {
    // 1. ПРОВЕРКА ОБСЛУЖИВАНИЯ (Одной командой MGET для скорости, если нужно, но пока 2 запроса надежнее)
    // Проверяем ключ maintenance_mode
    const maintRes = await fetch(`${DB_URL}/get/maintenance_mode`, {
        headers: { Authorization: `Bearer ${DB_TOKEN}` }
    });
    const maintData = await maintRes.json();
    
    // Если "true", отдаем флаг
    if (maintData.result === 'true') {
        return res.status(200).json({ maintenance: true });
    }

    // 2. ПОЛУЧЕНИЕ ЛЕНТЫ
    const response = await fetch(`${DB_URL}/lrange/feed_videos/0/-1`, {
        headers: { Authorization: `Bearer ${DB_TOKEN}` }
    });
    const data = await response.json();

    const videos = (data.result || [])
      .map(item => {
        try { return JSON.parse(item); } catch { return null; }
      })
      .filter(Boolean);

    // Отдаем массив видео (перевернутый, чтобы новые были сверху)
    res.status(200).json(videos.reverse());

  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
}
