import { kv } from '@vercel/kv';

const STATUS_KEY = 'MAINTENANCE_MODE_STATUS';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    // GET-запрос: Просто проверяет статус
    if (req.method === 'GET') {
        const status = await kv.get(STATUS_KEY);
        // По умолчанию режим выключен, если в базе ничего нет
        return res.status(200).json({ maintenance: status === 'on' });
    }

    // POST-запрос: Изменяет статус (только для админа)
    if (req.method === 'POST') {
        const { adminId, status } = req.body;
        const
         expectedAdminId = process.env.ADMIN_ID;

        if (!expectedAdminId) {
            return res.status(500).json({ error: 'Admin ID not configured' });
        }

        if (String(adminId) !== expectedAdminId) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        if (status !== 'on' && status !== 'off') {
            return res.status(400).json({ error: 'Invalid status. Use "on" or "off".' });
        }

        await kv.set(STATUS_KEY, status);
        return res.status(200).json({ success: true, newStatus: status });
    }

    return res.status(405).end();
}
