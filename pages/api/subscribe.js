export default async function handler(req, res) {
  // CORS (разрешаем запросы с GitHub Pages)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { userId, author, action } = req.body;
  
  // Автоматические переменные от Upstash
  const URL = process.env.KV_REST_API_URL;
  const TOKEN = process.env.KV_REST_API_TOKEN;

  if (!URL || !TOKEN) return res.status(500).json({ error: 'DB config missing' });

  try {
    const key = `subs:${userId}`;
    const command = action === 'add' ? 'sadd' : 'srem'; // sadd = добавить, srem = удалить

    // Шлем запрос в базу
    const dbRes = await fetch(`${URL}/${command}/${key}/${author}`, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    });
    
    const data = await dbRes.json();
    if (data.error) throw new Error(data.error);

    res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'DB Error' });
  }
}
