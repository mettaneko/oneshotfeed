import { kv } from '@vercel/kv';

export default async function handler(req, res) {
    const secret = req.headers['x-telegram-bot-api-secret-token'];
    if (secret !== process.env.TG_WEBHOOK_SECRET) {
        return res.status(403).send('Forbidden');
    }

    const update = req.body;
    // Поддержка и постов, и редактирования постов
    const message = update.channel_post || update.edited_channel_post;

    if (!message || !message.text) {
        return res.status(200).send('OK');
    }

    const text = message.text;
    const tiktokRegex = /(https?:\/\/(?:www\.|vm\.|vt\.|m\.)?tiktok\.com\/[^\s]+)/g;
    const links = text.match(tiktokRegex);

    if (!links || links.length === 0) {
        return res.status(200).send('OK');
    }

    const videoPromises = links.map(async (link) => {
        try {
            // Запрос к TikWM
            const apiUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(link)}`;
            const response = await fetch(apiUrl);
            const jsonData = await response.json();

            if (jsonData.code === 0 && jsonData.data) {
                const v = jsonData.data;
                return {
                    id: v.id,
                    videoUrl: `https://www.tikwm.com/video/media/play/${v.id}.mp4`,
                    cover: v.cover,
                    // 🔥 ЖЕСТКО ЗАДАЕМ ОПИСАНИЕ
                    desc: 'on tiktok', 
                    // 🔥 БЕРЕМ USERNAME АВТОРА
                    author: v.author ? v.author.unique_id : 'tiktok_user',
                    date: Date.now()
                };
            }
        } catch (error) {
            console.error(`❌ Failed to fetch data for ${link}:`, error);
        }
        return null;
    });

    const results = await Promise.all(videoPromises);
    const videosToPush = results
        .filter(item => item !== null)
        .map(item => JSON.stringify(item));

    if (videosToPush.length > 0) {
        try {
            await kv.rpush('feed_videos', ...videosToPush);
            console.log(`✅ Success: Saved ${videosToPush.length} videos.`);
        } catch (error) {
            console.error('❌ Database Error:', error);
        }
    }

    res.status(200).send('OK');
}
