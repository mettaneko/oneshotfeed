export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  const DB_URL = process.env.KV_REST_API_URL;
  const DB_TOKEN = process.env.KV_REST_API_TOKEN;
    
  try {
    // Проверяем ключ "maintenance_mode" в Redis
    const response = await fetch(`${DB_URL}/get/maintenance_mode`, {
      headers: { Authorization: `Bearer ${DB_TOKEN}` }
    });
    const data = await response.json();
    
    // Если result == 'true', значит работы идут
    const isMaintenance = data.result === 'true';

    res.status(200).json({ maintenance: isMaintenance });
  } catch (e) {
    res.status(200).json({ maintenance: false }); // Если ошибка, считаем что сайт работает
  }
}
