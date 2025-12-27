// api/migrate.js
import { createClient } from '@vercel/kv';

export const config = { runtime: 'edge' };

const redis = createClient({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req) {
  // 1. Ищем все ключи подписок (subs:*)
  // Внимание: keys() может быть медленным на огромных базах, но для старта ок.
  const keys = await redis.keys('subs:*');
  let count = 0;

  for (const key of keys) {
    const userId = key.split(':')[1]; // Вытаскиваем ID из subs:12345
    
    // Берем старые подписки (Set)
    const subsList = await redis.smembers(key);
    
    if (subsList.length > 0) {
      // Сохраняем в новый HASH user:ID
      // Поле 'subs' будет JSON-строкой
      // Поле 'streak' и 'last_complete' тоже переносим, если они были отдельно
      
      // Пробуем найти старый стрик (если он был в streak:ID)
      const oldStreak = await redis.get(`streak:${userId}`);
      const oldLastDate = await redis.get(`last_complete:${userId}`);

      const updateData = {
        subs: JSON.stringify(subsList) // ПРЕВРАЩАЕМ В СТРОКУ
      };

      if (oldStreak) updateData.streak = oldStreak;
      if (oldLastDate) updateData.last_complete = oldLastDate;

      // Записываем всё в один ключ user:ID
      await redis.hset(`user:${userId}`, updateData);
      
      // Удаляем старые ключи (раскомментируй, когда убедишься, что всё ок)
      // await redis.del(key);
      // await redis.del(`streak:${userId}`);
      // await redis.del(`last_complete:${userId}`);
      
      count++;
    }
  }

  return new Response(`Migrated ${count} users. Old keys preserved (uncomment del to clear).`);
}
