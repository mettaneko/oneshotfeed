// api/get_subs.js
import { createClient } from '@vercel/kv';
export const config = { runtime: 'edge' };
const redis = createClient({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });

export default async function handler(req) {
  const { userId } = await req.json();
  if (!userId) return new Response('No User', { status: 400 });

  // Получаем поле subs из Hash
  const subsRaw = await redis.hget(`user:${userId}`, 'subs');
  
  let subs = [];
  if (subsRaw) {
      // Vercel KV иногда возвращает сразу объект, если это JSON, но безопаснее проверить
      subs = typeof subsRaw === 'string' ? JSON.parse(subsRaw) : subsRaw;
  }

  return new Response(JSON.stringify({ subs }), { headers: { 'Content-Type': 'application/json' } });
}
