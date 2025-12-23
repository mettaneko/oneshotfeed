import { kv } from '@vercel/kv';
import { jwt } from 'jsonwebtoken';
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key';

export default async function handler(req, res) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const { userId } = jwt.verify(token, JWT_SECRET);
        const { authorId } = req.body;

        const isSubscribed = await kv.sismember(`user:${userId}:subscriptions`, authorId);

        if (isSubscribed) {
            // Отписка
            await kv.srem(`user:${userId}:subscriptions`, authorId);
            await kv.srem(`user:${authorId}:subscribers`, userId);
            res.status(200).json({ subscribed: false });
        } else {
            // Подписка
            await kv.sadd(`user:${userId}:subscriptions`, authorId);
            await kv.sadd(`user:${authorId}:subscribers`, userId);
            res.status(200).json({ subscribed: true });
        }
    } catch (e) {
        res.status(401).json({ error: 'Invalid token' });
    }
}
