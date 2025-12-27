// api/streak.js
import { createClient } from '@vercel/kv';

export const config = { runtime: 'edge' };

const redis = createClient({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req) {
  const url = new URL(req.url);
  const userId = url.searchParams.get('userId'); 

  if (req.method === 'POST') {
    const { userId: uid, videoId } = await req.json();
    if (!uid) return new Response('No ID', { status: 400 });

    const today = new Date().toISOString().split('T')[0];
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterday = yesterdayDate.toISOString().split('T')[0];

    // 1. Просмотры считаем отдельно (они живут 24 часа и удаляются)
    const viewKey = `day_views:${uid}:${today}`;
    await redis.sadd(viewKey, videoId);
    await redis.expire(viewKey, 86400);
    const todayCount = await redis.scard(viewKey);

    // 2. Работаем с профилем user:ID
    const userKey = `user:${uid}`;
    
    // Получаем текущие данные
    const userData = await redis.hmget(userKey, 'streak', 'last_complete');
    let currentStreak = parseInt(userData[0] || 0);
    const lastCompleteDate = userData[1];

    let newlyCompleted = false;

    if (todayCount >= 5) { // Цель 5
      if (lastCompleteDate !== today) {
        if (lastCompleteDate === yesterday) {
          currentStreak += 1;
        } else {
          currentStreak = 1; // Обрыв серии
        }
        
        // Пишем в Hash
        await redis.hset(userKey, {
          streak: currentStreak,
          last_complete: today
        });
        newlyCompleted = true;
      }
    }

    return new Response(JSON.stringify({
      streak: currentStreak,
      todayCount,
      target: 5,
      todayCompleted: (todayCount >= 5),
      newlyCompleted
    }));
  }

  // GET
  if (req.method === 'GET' && userId) {
    const today = new Date().toISOString().split('T')[0];
    const todayCount = await redis.scard(`day_views:${userId}:${today}`);
    
    const userData = await redis.hmget(`user:${userId}`, 'streak', 'last_complete');
    let currentStreak = parseInt(userData[0] || 0);
    // Логику визуального сброса (если пропустил день) можно добавить тут
    
    return new Response(JSON.stringify({
      streak: currentStreak,
      todayCount,
      target: 5,
      todayCompleted: (todayCount >= 5)
    }));
  }
}
