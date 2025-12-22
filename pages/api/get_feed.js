export default async function handler(req, res) {
  // === 1. CORS HEADERS (ОБЯЗАТЕЛЬНО) ===
  // Разрешаем запросы с любого сайта (GitHub Pages, Localhost)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Если браузер делает предварительную проверку (OPTIONS), отвечаем сразу
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // === 2. НАСТРОЙКИ ===
  const DB_URL = process.env.KV_REST_API_URL;
  const DB_TOKEN = process.env.KV_REST_API_TOKEN;

  if (!DB_URL || !DB_TOKEN) {
    return res.status(500).json({ error: 'Server DB Config Missing' });
  }

  // === 3. ПАГИНАЦИЯ ===
  // Получаем номер страницы из URL (по умолчанию 1)
  const page = parseInt(req.query.page) || 1;
  const limit = 10; // Сколько видео грузить за 1 запрос

  // Считаем индексы для Redis (LRANGE start end)
  // Стр 1: 0...9
  // Стр 2: 10...19
  const start = (page - 1) * limit;
  const end = start + limit - 1;

  try {
    // === 4. ЗАПРОС К REDIS ===
    const response = await fetch(`${DB_URL}/lrange/feed_videos/${start}/${end}`, {
      headers: { Authorization: `Bearer ${DB_TOKEN}` }
    });
    
    const data = await response.json();
    
    // Если ключа нет или база пустая
    if (!data.result) {
        return res.status(200).json([]);
    }

    // === 5. ОБРАБОТКА ДАННЫХ ===
    // Redis хранит данные как массив строк JSON. Нам нужно их распарсить.
    const videos = data.result
      .map(item => {
        try {
           // Пробуем превратить строку "{"id":...}" в объект JS
           return typeof item === 'string' ? JSON.parse(item) : item;
        } catch (e) {
           console.error("Ошибка парсинга JSON:", e);
           return null; // Если запись битая, пропускаем её
        }
      })
      .filter(item => item !== null); // Убираем пустые (null) записи

    // Отдаем чистый массив видео
    res.status(200).json(videos);

  } catch (e) {
    console.error("API Error:", e);
    res.status(500).json({ error: 'Failed to fetch feed' });
  }
}
