// api/migrate.js

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST');

    const token = process.env.BOT_TOKEN;
    const DB_URL = process.env.KV_REST_API_URL;
    const DB_TOKEN = process.env.KV_REST_API_TOKEN;
    const storageChannelId = process.env.STORAGE_CHANNEL_ID;
    const webAppUrl = 'https://feed.mettaneko.ru';

    if (!token || !DB_URL || !DB_TOKEN || !storageChannelId) {
        return res.status(500).json({ error: 'Config missing' });
    }

    const BATCH_SIZE = 5;

    try {
        const getRes = await fetch(`${DB_URL}/lrange/feed_videos/0/-1`, {
            headers: { Authorization: `Bearer ${DB_TOKEN}` }
        });
        const getData = await getRes.json();
        let list = getData.result || [];

        let processed = 0;
        let failed = 0;
        const restoredNames = [];

        for (let index = 0; index < list.length; index++) {
            if (processed + failed >= BATCH_SIZE) break;

            let item = list[index];
            if (typeof item === 'string') {
                try { item = JSON.parse(item); } catch (e) { continue; }
            }

            if (item.deleted || (item.tg_file_id && !item.videoUrl.includes('api.telegram.org'))) {
                continue;
            }

            const videoId = item.id;
            const author = item.author || 'i';
            const tiktokUrl = `https://www.tiktok.com/@${author}/video/${videoId}`;

            try {
                let fileId = item.tg_file_id;

                if (!fileId) {
                    const tikRes = await fetch("https://www.tikwm.com/api/", {
                        method: "POST",
                        headers: { "Content-Type": "application/x-www-form-urlencoded" },
                        body: new URLSearchParams({ url: tiktokUrl })
                    });
                    const tikJson = await tikRes.json();

                    if (tikJson.code === 0 && tikJson.data && tikJson.data.play) {
                        const tempVideoUrl = tikJson.data.play.startsWith('http') 
                            ? tikJson.data.play 
                            : `https://www.tikwm.com${tikJson.data.play}`;

                        const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendVideo`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                chat_id: storageChannelId,
                                video: tempVideoUrl,
                                caption: `TikTok: https://www.tiktok.com/@${author}/video/${videoId}`
                            })
                        });
                        const tgData = await tgRes.json();
                        if (tgData.ok && tgData.result.video) {
                            fileId = tgData.result.video.file_id;
                        }
                    }
                }

                if (fileId) {
                    const safeVideoUrl = `${webAppUrl}/api/stream?file_id=${fileId}`;

                    const updatedItem = {
                        id: String(videoId),
                        videoUrl: safeVideoUrl,
                        author: author,
                        desc: 'on tiktok',
                        cover: item.cover,
                        tg_file_id: fileId,
                        date: item.date || Date.now()
                    };

                    await fetch(`${DB_URL}/pipeline`, {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${DB_TOKEN}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify([
                            ["LSET", "feed_videos", index, JSON.stringify(updatedItem)]
                        ])
                    });

                    list[index] = updatedItem;
                    processed++;
                    restoredNames.push(`@${author}`);
                } else {
                    item.deleted = true;
                    await fetch(`${DB_URL}/pipeline`, {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${DB_TOKEN}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify([
                            ["LSET", "feed_videos", index, JSON.stringify(item)]
                        ])
                    });
                    list[index] = item;
                    failed++;
                }
            } catch (err) {
                failed++;
            }

            await new Promise(r => setTimeout(r, 200));
        }

        const totalRemaining = list.filter(v => {
            const parsed = typeof v === 'string' ? JSON.parse(v) : v;
            return !parsed.deleted && (!parsed.tg_file_id || (parsed.videoUrl && parsed.videoUrl.includes('api.telegram.org')));
        }).length;

        const ownerId = process.env.OWNER_ID || '5710960426';
        if (totalRemaining % 5 === 0 || totalRemaining === 0) {
            const text = totalRemaining === 0 
                ? `🎉 <b>Миграция полностью завершена!</b> Все 2733 видео перенесены.`
                : `📊 <b>Прогресс миграции:</b>\nОсталось: <b>${totalRemaining}</b> из ${list.length}`;
                
            await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: ownerId,
                    text: text,
                    parse_mode: 'HTML'
                })
            }).catch(() => {});
        }
        return res.status(200).json({
            ok: true,
            processed,
            failed,
            remaining: totalRemaining,
            total: list.length,
            restoredNames
        });

    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
}
