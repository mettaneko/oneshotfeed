import { createClient } from '@vercel/kv';

const kv = createClient({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
    
    try {
        const { userId, author, action } = req.body;
        if (!userId || !author || !action) return res.status(400).json({ error: 'userId, author, and action are required.' });
        
        const userSubsKey = `subs:${userId}`;

        if (action === 'add') {
            await kv.sadd(userSubsKey, author);
        } else if (action === 'remove') {
            await kv.srem(userSubsKey, author);
        }
        
        res.status(200).json({ success: true });
    } catch (e) {
        console.error('Subscribe Error:', e);
        res.status(500).json({ error: 'Failed to update subscriptions.' });
    }
}
