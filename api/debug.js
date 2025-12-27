// api/debug.js
import { createClient } from '@vercel/kv';
export const config = { runtime: 'edge' };
const redis = createClient({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId');
  if (!userId) return new Response('Нужен ?userId=...');

  // Читаем всё: просмотры за сегодня и профиль
  const today = new Date().toISOString().split('T')[0];
  const viewKey = `day_views:${userId}:${today}`;
  
  const [views, profile] = await Promise.all([
    redis.smembers(viewKey), // Что смотрел сегодня
    redis.hgetall(`user:${userId}`) // Стрик, подписки
  ]);

  return new Response(JSON.stringify({ 
    info: "Данные из БД",
    key_views: viewKey,
    views_today: views,
    key_profile: `user:${userId}`,
    profile_data: profile 
  }, null, 2));
}
