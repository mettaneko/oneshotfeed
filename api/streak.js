import { createClient } from '@vercel/kv';

export const config = { runtime: 'edge' };

const redis = createClient({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

function dayInTZ(tz, d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);

  const y = parts.find(p => p.type === 'year')?.value;
  const m = parts.find(p => p.type === 'month')?.value;
  const day = parts.find(p => p.type === 'day')?.value;

  return `${y}-${m}-${day}`; // YYYY-MM-DD
}

export default async function handler(req) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const tz = 'Europe/Moscow';

    const url = new URL(req.url);
    const userId = url.searchParams.get('userId');

    const now = new Date();
    const today = dayInTZ(tz, now);
    const yesterday = dayInTZ(tz, new Date(now.getTime() - 24 * 60 * 60 * 1000));

    const DAILY_TARGET = 5;

    // ===== GET =====
    if (req.method === 'GET') {
      if (!userId) {
        return new Response(JSON.stringify({ error: 'Missing userId' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      const viewKey = `day_views:${userId}:${today}`;
      const userKey = `user:${userId}`;

      const [todayCount, hmgetArr] = await Promise.all([
        redis.scard(viewKey),
        redis.hmget(userKey, 'streak', 'last_complete'),
      ]);

      const streakRaw = Array.isArray(hmgetArr) ? hmgetArr[0] : hmgetArr?.streak;
      const lastComplete = Array.isArray(hmgetArr) ? hmgetArr[1] : hmgetArr?.last_complete;

      let streak = parseInt(streakRaw || 0, 10);

      // Визуально: если не было completion ни сегодня, ни вчера — показываем 0
      if (lastComplete !== today && lastComplete !== yesterday) {
        streak = 0;
      }

      return new Response(JSON.stringify({
        streak,
        todayCount,
        target: DAILY_TARGET,
        todayCompleted: (lastComplete === today),
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // ===== POST =====
    if (req.method === 'POST') {
      const body = await req.json();
      const { userId: uid, videoId } = body || {};

      if (!uid || !videoId) {
        return new Response(JSON.stringify({ error: 'Missing data' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      const viewKey = `day_views:${uid}:${today}`;
      const userKey = `user:${uid}`;

      // 1) Уникальный просмотр за день
      await redis.sadd(viewKey, String(videoId));
      await redis.expire(viewKey, 86400);

      // 2) Кол-во просмотров сегодня
      const todayCount = await redis.scard(viewKey);

      // 3) Данные пользователя
      const hmgetArr = await redis.hmget(userKey, 'streak', 'last_complete');
      const streakRaw = Array.isArray(hmgetArr) ? hmgetArr[0] : hmgetArr?.streak;
      const lastComplete = Array.isArray(hmgetArr) ? hmgetArr[1] : hmgetArr?.last_complete;

      let streak = parseInt(streakRaw || 0, 10);
      let newlyCompleted = false;

      // 4) Засчитываем completion 1 раз в сутки
      if (todayCount >= DAILY_TARGET && lastComplete !== today) {
        if (lastComplete === yesterday) streak += 1;
        else streak = 1;

        await redis.hset(userKey, {
          streak: String(streak),
          last_complete: today,
        });

        newlyCompleted = true;
      }

      // Визуально: если цель не выполнена, а completion был давно — показываем 0
      if (todayCount < DAILY_TARGET && lastComplete !== today && lastComplete !== yesterday) {
        streak = 0;
      }

      return new Response(JSON.stringify({
        streak,
        todayCount,
        target: DAILY_TARGET,
        todayCompleted: (lastComplete === today) || (todayCount >= DAILY_TARGET),
        newlyCompleted,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  } catch (error) {
    console.error('Streak API Error:', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}
