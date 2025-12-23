import { createClient } from '@vercel/kv';
import { v4 as uuidv4 } from 'uuid';

const kv = createClient({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const BOT_TOKEN = process.env.BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

async function sendMessage(chatId, text) {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    try {
        const update = req.body;
        if (!update.message || !update.message.text) return res.status(200).end();
        
        const { message } = update;
        const text = message.text;
        const chatId = message.chat.id;

        if (text.startsWith('/add')) {
            const parts = text.split(' ').slice(1);
            if (parts.length < 2) {
                await sendMessage(chatId, 'Ошибка. Используй: /add <videoUrl> <author> [description]');
                return res.status(200).end();
            }
            const [videoUrl, author, ...descParts] = parts;
            const desc = descParts.join(' ');
            
            const videoData = { id: uuidv4(), videoUrl, author, desc: desc || '', timestamp: Date.now() };

            // В KV нужно сохранять строки, а не объекты
            await kv.lpush('feed_videos', JSON.stringify(videoData));
            await sendMessage(chatId, `✅ Видео добавлено!\nАвтор: @${author}`);
        }
    } catch (e) {
        console.error('Bot Webhook Error:', e);
        // Можно отправить сообщение об ошибке админу, если задан ADMIN_ID
        if (process.env.ADMIN_ID) {
            await sendMessage(process.env.ADMIN_ID, `Bot Error: ${e.message}`);
        }
    }
    
    res.status(200).end();
}
