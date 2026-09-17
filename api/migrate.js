// api/migrate.js

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST');

    const token = process.env.BOT_TOKEN;
    const DB_URL = process.env.KV_REST_API_URL;
    const DB_TOKEN = process.env.KV_REST_API_TOKEN;
    const storageChannelId = process.env.STORAGE_CHANNEL_ID;
    const ownerId = process.env.OWNER_ID || '5710960426';
    const webAppUrl = 'https://feed.mettaneko.ru';

    if (!token || !DB_URL || !DB_TOKEN || !storageChannelId) {
        return res.status(500).json({ error: 'Config missing' });
    }

    const isAuto = req.query.auto === 'true';
    if (isAuto) {
        const flagRes = await fetch(`${DB_URL}/get/migrate_auto_running`, {
            headers: { Authorization: `Bearer ${DB_TOKEN}` }
        });
        const flagData = await flagRes.json();
        if (flagData.result !== 'true') {
            return res.status(200).json({ status: 'stopped_by_user' });
        }
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

        for (let index = 0; index < list.length; index++) {
            if (processed >= BATCH_SIZE) break;

            let item = list[index];
            if (typeof item === 'string') {
                try { item = JSON.parse(item); } catch (e) { continue; }
            }

            if (item.tg_file_id && !item.videoUrl.includes('api.telegram.org')) {
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
                        headers: { 
                            Authorization: `Bearer ${DB_TOKEN}`, 
                            'Content-Type': 'application/json' 
                        },
                        body: JSON.stringify([
                            ["LSET", "feed_videos", index, JSON.stringify(updatedItem)]
                        ])
                    });

                    list[index] = updatedItem;
                    processed++;
                } else {
                    failed++;
                }
            } catch (err) {
                failed++;
            }

            await new Promise(r => setTimeout(r, 400));
        }

        // Подсчёт остатка в реальном времени
        const totalRemaining = list.filter(v => {
            const parsed = typeof v === 'string' ? JSON.parse(v) : v;
            return !parsed.tg_file_id || (parsed.videoUrl && parsed.videoUrl.includes('api.telegram.org'));
        }).length;

        let sessionCount = processed;
        try {
            const incRes = await fetch(`${DB_URL}/incrby/migrate_session_count/${processed}`, {
                headers: { Authorization: `Bearer ${DB_TOKEN}` }
            });
            const incData = await incRes.json();
            sessionCount = incData.result || processed;
        } catch (e) {}

        const isDone = totalRemaining === 0;
        if (sessionCount % 25 === 0 || isDone || !isAuto) {
            let report = `⚙️ <b>Реставрация в процессе (Авто):</b>\n\n`;
            report += `🔄 Восстановлено в этой сессии: <b>${sessionCount}</b>\n`;
            report += `⏳ Осталось немигрированных: <b>${totalRemaining}</b> из ${list.length}\n`;

            if (isDone) {
                report += `\n🎉 <b>Все видео полностью отреставрированы и защищены!</b>`;
                await fetch(`${DB_URL}/set/migrate_auto_running/false`, { headers: { Authorization: `Bearer ${DB_TOKEN}` } });
            }

            const kb = isDone ? null : {
                inline_keyboard: [
                    [{ text: "⏹ Остановить авто-режим", callback_data: "stop_migrate" }]
                ]
            };

            await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: ownerId, text: report, parse_mode: 'HTML', reply_markup: kb })
            });
        }

        if (isAuto && !isDone) {
            fetch(`${webAppUrl}/api/migrate?auto=true`).catch(() => {});
        }

        return res.status(200).json({ success: true, processed, totalRemaining });

    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
}
