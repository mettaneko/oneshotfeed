import crypto from 'crypto';

// Функция для валидации данных от Telegram
function validateTelegramAuth(initData, botToken) {
    if (!initData) return null;
    try {
        const params = new URLSearchParams(initData);
        const hash = params.get('hash');
        params.delete('hash');
        params.sort();

        let dataCheckString = '';
        for (const [key, value] of params.entries()) {
            dataCheckString += `${key}=${value}\n`;
        }
        dataCheckString = dataCheckString.slice(0, -1);

        const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
        const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
        
        if (computedHash === hash) {
            const user = JSON.parse(params.get('user'));
            return user;
        }
    } catch (e) {
        console.error('Auth validation error:', e);
    }
    return null;
}

export default async function handler(req, res) {
    // Разрешаем CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Telegram-Auth');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).end();
    
    // 1. ВАЛИДАЦИЯ ЮЗЕРА
    const initData = req.headers['x-telegram-auth'];
    const user = validateTelegramAuth(initData, process.env.BOT_TOKEN);

    if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    // 2. ЛОГИКА ПОДПИСКИ
    const { author, subscribe } = req.body;
    if (!author) return res.status(400).json({ error: 'Author is missing' });

    const DB_URL = process.env.KV_REST_API_URL;
    const DB_TOKEN = process.env.KV_REST_API_TOKEN;

    try {
        const command = subscribe ? 'SADD' : 'SREM';
        const dbKey = `user_subs:${user.id}`; // Ключ: user_subs:123456

        await fetch(`${DB_URL}/${command}/${dbKey}/${encodeURIComponent(author)}`, {
            headers: { Authorization: `Bearer ${DB_TOKEN}` }
        });

        res.status(200).json({ ok: true });
    } catch (e) {
        console.error('Subscribe DB Error:', e);
        res.status(500).json({ error: 'DB Error' });
    }
}
