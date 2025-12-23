import crypto from 'crypto';

// Функция валидации (та же, что и в других файлах)
function validateTelegramAuth(initData, botToken) {
    if (!initData) return null;
    try {
        const params = new URLSearchParams(initData);
        const hash = params.get('hash');
        params.delete('hash');
        params.sort();
        let dataCheckString = '';
        for (const [key, value] of params.entries()) { dataCheckString += `${key}=${value}\n`; }
        dataCheckString = dataCheckString.slice(0, -1);
        const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
        const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
        if (computedHash === hash) return JSON.parse(params.get('user'));
    } catch (e) { return null; }
}

export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Telegram-Auth');
    if (req.method === 'OPTIONS') return res.status(200).end();

    // 1. ВАЛИДАЦИЯ
    const initData = req.headers['x-telegram-auth'];
    const user = validateTelegramAuth(initData, process.env.BOT_TOKEN);

    if (!user) {
        return res.status(401).json([]); // Если не авторизован, возвращаем пустую ленту
    }

    const DB_URL = process.env.KV_REST_API_URL;
    const DB_TOKEN = process.env.KV_REST_API_TOKEN;

    try {
        // 2. ПОЛУЧАЕМ СПИСОК ПОДПИСОК ПОЛЬЗОВАТЕЛЯ
        const subsKey = `user_subs:${user.id}`;
        const subsResponse = await fetch(`${DB_URL}/smembers/${subsKey}`, {
            headers: { Authorization: `Bearer ${DB_TOKEN}` }
        });
        const subsData = await subsResponse.json();
        const subscribedAuthors = subsData.result || [];

        if (subscribedAuthors.length === 0) {
            return res.status(200).json([]); // Если подписок нет, лента пуста
        }

        // 3. ПОЛУЧАЕМ ВСЕ ВИДЕО И ФИЛЬТРУЕМ
        // Это не очень эффективно для больших баз, но для <20-30к видео будет работать.
        const feedResponse = await fetch(`${DB_URL}/lrange/feed_videos/0/-1`, {
             headers: { Authorization: `Bearer ${DB_TOKEN}` }
        });
        const feedData = await feedResponse.json();
        
        const allVideos = (feedData.result || []).map(item => JSON.parse(item));
        
        // Фильтруем видео, оставляя только те, что от авторов из подписок
        const subscribedVideos = allVideos.filter(video => 
            subscribedAuthors.includes(video.author)
        );

        // 4. ПАГИНАЦИЯ (уже от отфильтрованного списка)
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const start = (page - 1) * limit;
        const end = start + limit;
        
        const paginatedVideos = subscribedVideos.slice(start, end);

        res.status(200).json(paginatedVideos);

    } catch (e) {
        console.error('Get Subs Error:', e);
        res.status(500).json([]);
    }
}
