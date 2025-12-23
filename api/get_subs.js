import { createClient } from '@vercel/kv';
import crypto from 'crypto';

const kv = createClient({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

// УЛУЧШЕННАЯ ФУНКЦИЯ ВАЛИДАЦИИ
function validateTelegramAuth(initData, botToken) {
    if (typeof initData !== 'string' || !initData) return null;
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;

    const dataCheckArr = [];
    params.forEach((value, key) => {
        if (key !== 'hash') dataCheckArr.push(`${key}=${value}`);
    });
    
    dataCheckArr.sort();
    const dataCheckString = dataCheckArr.join('\n');

    try {
        const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
        const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
        
        if (computedHash === hash) {
            return JSON.parse(params.get('user'));
        }
        return null;
    } catch (e) {
        console.error('Auth validation crypto error:', e);
        return null;
    }
}


export default async function handler(req, res) {
    // ... остальной код такой же ...
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Telegram-Auth');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const initData = req.headers['x-telegram-auth'];
    const user = validateTelegramAuth(initData, process.env.BOT_TOKEN);
    
    if (!user) {
        console.log('Auth failed. Received initData:', initData ? 'present' : 'missing');
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // ... код для получения подписок ...
    try {
        const { exclude = [] } = req.body;
        const userSubsKey = `subs:${user.id}`;
        const subscribedAuthors = await kv.smembers(userSubsKey);
        if (!subscribedAuthors || subscribedAuthors.length === 0) return res.status(200).json([]);

        const allVideoStrings = await kv.lrange('feed_videos', 0, -1);
        const allVideoObjects = allVideoStrings.map(str => {
            try { return JSON.parse(str); } catch (e) { return null; }
        }).filter(Boolean);
        
        const availableVideos = allVideoObjects.filter(video => 
            video && video.id && subscribedAuthors.includes(video.author) && !exclude.includes(video.id)
        );
        
        const selectedVideos = [];
        const count = Math.min(10, availableVideos.length);

        for (let i = 0; i < count; i++) {
            const randomIndex = Math.floor(Math.random() * availableVideos.length);
            selectedVideos.push(availableVideos[randomIndex]);
            availableVideos.splice(randomIndex, 1);
        }

        res.status(200).json(selectedVideos);
    } catch (e) {
        console.error('Get Subs Error:', e);
        res.status(500).json({error: "Server crash in get_subs"});
    }
}
