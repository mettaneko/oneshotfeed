export default async function handler(req, res) {
    // Настраиваем CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    // Используем переменные окружения Vercel
    const KV_URL = process.env.KV_REST_API_URL;
    const KV_TOKEN = process.env.KV_REST_API_TOKEN;

    if (!KV_URL || !KV_TOKEN) {
        return res.status(500).json({ error: 'Server Error: Database config missing' });
    }

    // Хелпер для запросов к Redis
    async function redisCmd(command, ...args) {
        const path = [command, ...args.map(a => encodeURIComponent(String(a)))].join('/');
        const url = `${KV_URL}/${path}`;
        
        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${KV_TOKEN}` }
        });
        
        if (!response.ok) throw new Error(`Upstash error: ${response.statusText}`);
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        return data.result;
    }

    const TARGET = 5;
    
    // Дата по Москве
    const getMoscowDate = (offsetMs = 0) => {
        return new Date(Date.now() + offsetMs).toLocaleDateString('en-CA', { 
            timeZone: 'Europe/Moscow' 
        });
    };

    const today = getMoscowDate();
    const yesterday = getMoscowDate(-86400000);

    try {
        // === GET: Получить статус ===
        if (req.method === 'GET') {
            const { userId } = req.query;
            if (!userId) return res.status(400).json({ error: 'Missing userId' });

            const [streakRaw, todayCountRaw, lastDate] = await Promise.all([
                redisCmd('GET', `streak:${userId}`),
                redisCmd('SCARD', `day:${userId}:${today}`),
                redisCmd('GET', `last_complete:${userId}`)
            ]);

            return res.json({
                streak: Number(streakRaw) || 0,
                todayCount: Number(todayCountRaw) || 0,
                todayCompleted: lastDate === today,
                target: TARGET
            });
        }

        // === POST: Засчитать просмотр ===
        if (req.method === 'POST') {
            const { userId, videoId } = req.body;
            if (!userId || !videoId) return res.status(400).json({ error: 'Missing data' });

            await redisCmd('SADD', `day:${userId}:${today}`, videoId);
            await redisCmd('EXPIRE', `day:${userId}:${today}`, 172800);

            const todayCount = Number(await redisCmd('SCARD', `day:${userId}:${today}`)) || 0;
            let streak = Number(await redisCmd('GET', `streak:${userId}`)) || 0;
            const lastDate = await redisCmd('GET', `last_complete:${userId}`);

            let newCompleted = false;

            if (todayCount >= TARGET && lastDate !== today) {
                if (lastDate === yesterday) {
                    streak++;
                    await redisCmd('INCR', `streak:${userId}`);
                } else {
                    streak = 1;
                    await redisCmd('SET', `streak:${userId}`, 1);
                }
                
                await redisCmd('SET', `last_complete:${userId}`, today);
                newCompleted = true;
            }

            return res.json({
                streak,
                todayCount,
                todayCompleted: newCompleted || lastDate === today,
                target: TARGET,
                newlyCompleted: newCompleted
            });
        }
        
        return res.status(405).json({ error: 'Method not allowed' });

    } catch (error) {
        console.error("Streak API Error:", error);
        return res.status(500).json({ error: error.message });
    }
}
