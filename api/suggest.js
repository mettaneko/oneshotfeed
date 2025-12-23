import crypto from 'crypto';

// Функция валидации (та же, что и в subscribe.js)
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
    } catch (e) {
        console.error('Auth validation error:', e);
    }
    return null;
}

export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Telegram-Auth');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).end();

    // 1. ВАЛИДАЦИЯ
    const initData = req.headers['x-telegram-auth'];
    const user = validateTelegramAuth(initData, process.env.BOT_TOKEN);

    if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    // 2. ЛОГИКА ПРЕДЛОЖКИ
    const { link, comment } = req.body;
    if (!link) return res.status(400).json({ error: 'Link is missing' });

    const adminIds = (process.env.ADMIN_ID || '').split(',');
    const botToken = process.env.BOT_TOKEN;

    const text = 
      `📬 *Новая предложка!*\n\n` +
      `От: [${user.first_name || 'User'} ${user.last_name || ''}](tg://user?id=${user.id})\n` +
      `Ссылка: \`${link}\`\n` +
      `Комментарий: _${comment || 'нет'}_`;
      
    try {
        // Отправляем сообщение всем админам
        const promises = adminIds.map(adminId => 
            fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: adminId,
                    text: text,
                    parse_mode: 'Markdown'
                })
            })
        );
        await Promise.all(promises);
        res.status(200).json({ ok: true });
    } catch (e) {
        console.error('Suggest Send Error:', e);
        res.status(500).json({ error: 'TG Send Error' });
    }
}
