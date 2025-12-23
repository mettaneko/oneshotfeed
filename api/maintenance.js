import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Секретный ключ для чистки
  const secret = req.query.secret || req.body?.secret;
  if (secret !== process.env.MAINTENANCE_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const action = req.query.action || req.body?.action;

    if (action === 'clear_feed') {
      // Очищаем ленту
      await kv.del('feed_videos');
      return res.status(200).json({ message: '✅ Лента очищена' });
    }

    if (action === 'clear_suggestions') {
      // Очищаем очередь предложек
      await kv.del('suggestions_queue');
      return res.status(200).json({ message: '✅ Очередь предложек очищена' });
    }

    if (action === 'get_stats') {
      // Статистика
      const feedLen = await kv.llen('feed_videos');
      const suggestLen = await kv.llen('suggestions_queue');
      const admins = await kv.smembers('admins');

      return res.status(200).json({
        feed_videos: feedLen,
        suggestions_queue: suggestLen,
        admins_count: admins?.length || 0
      });
    }

    if (action === 'add_admin') {
      // Добавить админа
      const adminId = req.query.admin_id || req.body?.admin_id;
      if (!adminId) return res.status(400).json({ error: 'Need admin_id' });

      await kv.sadd('admins', adminId);
      return res.status(200).json({ message: `✅ Admin ${adminId} добавлен` });
    }

    return res.status(400).json({ error: 'Unknown action' });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
}
