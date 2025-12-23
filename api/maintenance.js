import { kv } from '@vercel/kv';

const STATUS_KEY = 'MAINTENANCE_MODE_STATUS';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    try {
        if (req.method === 'GET') {
            const status = await kv.get(STATUS_KEY);
            return res.status(200).json({ maintenance: status === 'on' });
        }

        if (req.method === 'POST') {
            const { adminId, status } = req.body;
            // Логируем входящий запрос
            console.log(`[MAINTENANCE_API] Received request. AdminID: ${adminId}, Status: ${status}`);

            const adminIdList = (process.env.ADMIN_ID || '').split(',');
            // Логируем, какие админы настроены в системе
            console.log(`[MAINTENANCE_API] Configured Admin IDs: [${adminIdList.join(', ')}]`);

            if (!adminIdList.length || !adminIdList[0]) {
                console.error('[MAINTENANCE_API] CRITICAL: ADMIN_ID environment variable is not set or is empty.');
                return res.status(500).json({ error: 'Admin ID not configured on server' });
            }

            // Проверяем, есть ли ID пользователя в списке админов
            if (!adminIdList.includes(String(adminId))) {
                console.warn(`[MAINTENANCE_API] FORBIDDEN attempt by ID: ${adminId}. It is not in the allowed list.`);
                return res.status(403).json({ error: `Forbidden: Your ID (${adminId}) is not in the admin list.` });
            }
            
            if (status !== 'on' && status !== 'off') {
                return res.status(400).json({ error: 'Invalid status. Use "on" or "off".' });
            }

            await kv.set(STATUS_KEY, status);
            console.log(`[MAINTENANCE_API] Successfully set maintenance mode to: ${status}`);
            return res.status(200).json({ success: true, newStatus: status });
        }

        return res.status(405).json({ error: 'Method Not Allowed' });

    } catch (e) {
        console.error('[MAINTENANCE_API] FATAL: Unhandled error:', e);
        return res.status(500).json({ error: 'An unexpected server error occurred.' });
    }
}
