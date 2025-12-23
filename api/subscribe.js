import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  // Разрешаем CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, user-id');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Получаем ID пользователя и автора
  const userId = req.headers['user-id'] || req.query.userId;
  const { author } = req.body || {};

  if (!userId || !author) {
    return res.status(400).json({ error: 'Нужен userId и author' });
  }

  const key = `user:${userId}:subs`;

  try {
    // Проверяем, подписан ли уже
    const isSubscribed = await kv.sismember(key, author);

    if (isSubscribed) {
      // Если подписан — отписываемся
      await kv.srem(key, author);
      return res.status(200).json({ status: 'unsubscribed', author });
    } else {
      // Если не подписан — подписываемся
      await kv.sadd(key, author);
      return res.status(200).json({ status: 'subscribed', author });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Ошибка базы данных' });
  }
}
