import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { url, userId, userName } = req.body;

  if (!url || !url.includes('tiktok.com')) {
    return res.status(400).json({ error: 'Некорректная ссылка на TikTok' });
  }

  try {
    // 1. Парсим видео через TikWM
    const response = await fetch(`https://www.tikwm.com/api/?url=${url}`);
    const data = await response.json();

    if (data.code !== 0) {
      return res.status(400).json({ error: 'Не удалось загрузить видео' });
    }

    const videoData = data.data;

    // 2. Формируем объект
    const newVideo = {
      id: videoData.id,
      videoUrl: `https://www.tikwm.com/video/media/play/${videoData.id}.mp4`,
      cover: `https://www.tikwm.com/video/cover/${videoData.id}.jpg`,
      desc: videoData.title || "Suggested video",
      author: videoData.author.unique_id,
      suggested: true,
      suggestedBy: userName || userId,
      timestamp: new Date().toISOString()
    };

    // 3. Сохраняем в очередь предложек
    await kv.lpush('suggestions_queue', JSON.stringify(newVideo));

    // 4. Отправляем уведомление всем админам (кроме каналов)
    const admins = await kv.smembers('admins'); // SET с admin_id

    for (const adminId of admins) {
      // Пропускаем ТГ каналы (ID < -100)
      if (parseInt(adminId) < -100) continue;

      // Отправляем сообщение в ТГ
      const message = `📲 Новая предложка от ${userName || userId}:\n\n🎥 ${videoData.title || 'Видео'}\n👤 @${videoData.author.unique_id}\n🔗 ${url}`;

      await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: adminId,
          text: message,
          parse_mode: 'HTML'
        })
      });
    }

    return res.status(200).json({ 
      success: true, 
      message: 'Видео отправлено админам!',
      video: newVideo 
    });

  } catch (error) {
    console.error("Suggest Error:", error);
    return res.status(500).json({ error: error.message });
  }
}
