// api/theme.js

export const config = {
    runtime: 'edge', // Оптимизировано для Vercel Edge / Cloudflare Workers
};

export default async function handler(request) {
    // Берем те же переменные, что и в bot.js
    const DB_URL = process.env.KV_REST_API_URL;
    const DB_TOKEN = process.env.KV_REST_API_TOKEN;
    
    // Ключ, где храним настройки темы
    const KEY = 'config:winter_theme'; 

    if (!DB_URL || !DB_TOKEN) {
        return new Response(JSON.stringify({ error: 'DB Config missing' }), { 
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        // === GET: Сайт спрашивает "Включена ли зима?" ===
        if (request.method === 'GET') {
            // Делаем GET запрос к Upstash REST API
            const response = await fetch(`${DB_URL}/get/${KEY}`, {
                headers: { Authorization: `Bearer ${DB_TOKEN}` }
            });
            const data = await response.json();
            
            // Upstash возвращает { result: "строка_json" } или { result: null }
            let config = { isWinter: false, version: 1 };
            
            if (data.result) {
                try {
                    config = JSON.parse(data.result);
                } catch (e) {
                    console.error("JSON parse error", e);
                }
            }

            return new Response(JSON.stringify(config), {
                status: 200,
                headers: { 
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*' // Разрешаем запросы с фронта
                }
            });
        }

        // === POST: Бот обновляет статус (команда /winter) ===
        if (request.method === 'POST') {
            const body = await request.json();
            // body приходит от бота: { active: true/false, reset: true/false }

            // 1. Сначала читаем текущий конфиг, чтобы не потерять версию
            const getRes = await fetch(`${DB_URL}/get/${KEY}`, {
                headers: { Authorization: `Bearer ${DB_TOKEN}` }
            });
            const getData = await getRes.json();
            
            let currentConfig = { isWinter: false, version: 1 };
            if (getData.result) {
                try {
                    currentConfig = JSON.parse(getData.result);
                } catch (e) {}
            }

            // 2. Обновляем статус
            currentConfig.isWinter = body.active;

            // 3. Если был флаг reset, увеличиваем версию (чтобы показать баннер всем снова)
            if (body.reset) {
                currentConfig.version = (currentConfig.version || 1) + 1;
            }

            // 4. Записываем обратно в Upstash (команда SET)
            // Важно: Value должно быть строкой
            await fetch(`${DB_URL}/set/${KEY}`, {
                method: 'POST',
                headers: { 
                    Authorization: `Bearer ${DB_TOKEN}`,
                    'Content-Type': 'text/plain' 
                },
                body: JSON.stringify(currentConfig)
            });

            return new Response(JSON.stringify({ ok: true, config: currentConfig }), { 
                status: 200, 
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Если метод не GET и не POST
        return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });

    } catch (e) {
        console.error(e);
        return new Response(JSON.stringify({ error: e.message }), { 
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
