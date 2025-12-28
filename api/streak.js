import { createClient } from '@vercel/kv';

export const config = { runtime: 'edge' };

const redis = createClient({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const DAILY_TARGET = 5;
const FREEZE_LIMIT = 3;
const FREEZE_WINDOW_DAYS = 60;
const TZ = 'Europe/Moscow';

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

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function daysBetween(a, b) {
  // a,b: Date objects
  const ms = 24 * 60 * 60 * 1000;
  return Math.floor((b.getTime() - a.getTime()) / ms);
}

async function notifyAdmin(text) {
  // Опционально: уведомление “тебе” (админу) в TG, если заданы переменные окружения
  const token = process.env.BOT_TOKEN;
  const adminIds = (process.env.ADMIN_ID || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!token || adminIds.length === 0) return;

  await Promise.all(adminIds.map(async (chatId) => {
    try {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      });
    } catch {}
  }));
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
    const url = new URL(req.url);
    const userId = url.searchParams.get('userId');

    const now = new Date();
    const today = dayInTZ(TZ, now);
    const yesterday = dayInTZ(TZ, addDays(now, -1));

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
        redis.hmget(userKey, 'streak', 'last_complete', 'freeze_uses', 'freeze_window_start'),
      ]);

      const streakRaw = Array.isArray(hmgetArr) ? hmgetArr[0] : hmgetArr?.streak;
      const lastComplete = Array.isArray(hmgetArr) ? hmgetArr[1] : hmgetArr?.last_complete;
      const freezeUsesRaw = Array.isArray(hmgetArr) ? hmgetArr[2] : hmgetArr?.freeze_uses;
      const freezeWindowStart = Array.isArray(hmgetArr) ? hmgetArr[3] : hmgetArr?.freeze_window_start;

      const storedStreak = parseInt(streakRaw || 0, 10);
      const todayCompleted = (lastComplete === today) || (todayCount >= DAILY_TARGET);

      // “Заморожен”, если серия есть, но последний completion не сегодня и не вчера
      const frozen = storedStreak > 0 && lastComplete && lastComplete !== today && lastComplete !== yesterday;

      // Лимит разморозок: 3 / 60 дней
      let freezeUses = parseInt(freezeUsesRaw || 0, 10);
      let windowStart = freezeWindowStart;

      if (!windowStart) {
        windowStart = today;
        freezeUses = 0;
        await redis.hset(userKey, { freeze_window_start: windowStart, freeze_uses: String(freezeUses) });
      } else {
        const wsDate = new Date(`${windowStart}T00:00:00`);
        const days = daysBetween(wsDate, new Date(`${today}T00:00:00`));
        if (days >= FREEZE_WINDOW_DAYS) {
          windowStart = today;
          freezeUses = 0;
          await redis.hset(userKey, { freeze_window_start: windowStart, freeze_uses: String(freezeUses) });
        }
      }

      const freezeRemaining = Math.max(0, FREEZE_LIMIT - freezeUses);

      return new Response(JSON.stringify({
        streak: storedStreak,
        todayCount,
        target: DAILY_TARGET,
        todayCompleted,
        frozen,
        freezeRemaining,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // ===== POST =====
    if (req.method === 'POST') {
      const body = await req.json();
      const { userId: uid, videoId, action } = body || {};

      if (!uid) {
        return new Response(JSON.stringify({ error: 'Missing userId' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      const userKey = `user:${uid}`;

      // --- action: unfreeze ---
      if (action === 'unfreeze') {
        const hmgetArr = await redis.hmget(userKey, 'streak', 'last_complete', 'freeze_uses', 'freeze_window_start');

        const streakRaw = Array.isArray(hmgetArr) ? hmgetArr[0] : hmgetArr?.streak;
        const lastComplete = Array.isArray(hmgetArr) ? hmgetArr[1] : hmgetArr?.last_complete;
        const freezeUsesRaw = Array.isArray(hmgetArr) ? hmgetArr[2] : hmgetArr?.freeze_uses;
        const freezeWindowStart = Array.isArray(hmgetArr) ? hmgetArr[3] : hmgetArr?.freeze_window_start;

        const storedStreak = parseInt(streakRaw || 0, 10);

        // eligibility: серия была и она реально “сломана”
        const isFrozen = storedStreak > 0 && lastComplete && lastComplete !== today && lastComplete !== yesterday;

        // window reset
        let freezeUses = parseInt(freezeUsesRaw || 0, 10);
        let windowStart = freezeWindowStart || today;

        const wsDate = new Date(`${windowStart}T00:00:00`);
        const days = daysBetween(wsDate, new Date(`${today}T00:00:00`));
        if (days >= FREEZE_WINDOW_DAYS) {
          windowStart = today;
          freezeUses = 0;
        }

        const freezeRemaining = Math.max(0, FREEZE_LIMIT - freezeUses);

        if (!isFrozen) {
          return new Response(JSON.stringify({
            ok: false,
            reason: 'not_frozen',
            streak: storedStreak,
            freezeRemaining,
          }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders }});
        }

        if (freezeRemaining <= 0) {
          return new Response(JSON.stringify({
            ok: false,
            reason: 'limit_reached',
            streak: storedStreak,
            freezeRemaining: 0,
          }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders }});
        }

        // ключевой трюк: ставим last_complete = yesterday, чтобы при выполнении today streak продолжился
        freezeUses += 1;
        await redis.hset(userKey, {
          last_complete: yesterday,
          freeze_window_start: windowStart,
          freeze_uses: String(freezeUses),
        });

        return new Response(JSON.stringify({
          ok: true,
          unfrozen: true,
          streak: storedStreak,
          freezeRemaining: Math.max(0, FREEZE_LIMIT - freezeUses),
        }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders }});
      }

      // --- обычный просмотр видео ---
      if (!videoId) {
        return new Response(JSON.stringify({ error: 'Missing videoId' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      const viewKey = `day_views:${uid}:${today}`;

      await redis.sadd(viewKey, String(videoId));
      await redis.expire(viewKey, 86400);

      const todayCount = await redis.scard(viewKey);

      const hmgetArr = await redis.hmget(userKey, 'streak', 'last_complete');
      const streakRaw = Array.isArray(hmgetArr) ? hmgetArr[0] : hmgetArr?.streak;
      const lastComplete = Array.isArray(hmgetArr) ? hmgetArr[1] : hmgetArr?.last_complete;

      let streak = parseInt(streakRaw || 0, 10);
      let newlyCompleted = false;

      if (todayCount >= DAILY_TARGET && lastComplete !== today) {
        if (lastComplete === yesterday) streak += 1;
        else streak = 1;

        await redis.hset(userKey, { streak: String(streak), last_complete: today });
        newlyCompleted = true;

        // “уведомление тебе” (опционально)
        // notifyAdmin(`🥞 <New daily streak complete>: user ${uid}, streak = ${streak}`).catch(() => {});
      }

      return new Response(JSON.stringify({
        streak,
        todayCount,
        target: DAILY_TARGET,
        todayCompleted: (todayCount >= DAILY_TARGET) || (lastComplete === today),
        newlyCompleted,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  } catch (e) {
    console.error('Streak API Error:', e);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}
