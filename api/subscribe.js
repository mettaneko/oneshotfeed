// api/subscribe.js
import { createClient } from '@vercel/kv';

export const config = { runtime: 'edge' };

const redis = createClient({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req) {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  try {
    const { userId, author, action } = await req.json();
    if (!userId || !author) return new Response('Missing data', { status: 400 });

    const userKey = `user:${userId}`;

    // 1. Получаем текущий список подписок (как строку)
    const currentSubsRaw = await redis.hget(userKey, 'subs');
    
    // 2. Парсим или создаем пустой массив
    let subs = [];
    if (currentSubsRaw) {
        try {
            subs = typeof currentSubsRaw === 'string' ? JSON.parse(currentSubsRaw) : currentSubsRaw;
        } catch(e) { subs = []; } // Если ошибка парсинга
    }

    // 3. Изменяем массив
    if (action === 'add') {
      if (!subs.includes(author)) {
        subs.push(author);
      }
    } else if (action === 'remove') {
      subs = subs.filter(s => s !== author);
    }

    // 4. Записываем обратно как строку
    await redis.hset(userKey, { subs: JSON.stringify(subs) });

    return new Response(JSON.stringify({ success: true, subs }), { 
      headers: { 'Content-Type': 'application/json' } 
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
