// api/migrate.js

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST');

    const token = process.env.BOT_TOKEN;
    const DB_URL = process.env.KV_REST_API_URL;
    const DB_TOKEN = process.env.KV_REST_API_TOKEN;
    const storageChannelId = process.env.STORAGE_CHANNEL_ID;
    const ownerId = process.env.OWNER_ID;

    if (!token || !DB_URL || !DB_TOKEN || !storageChannelId) {
        return res.status(500).json({ 
            error: 'Отсутствуют необходимые переменные окружения: BOT_TOKEN, KV_REST_API_URL, KV_REST_API_TOKEN или STORAGE_CHANNEL_ID.' 
        });
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
        const restoredDetails = [];

        for (let index = 0; index < list.length; index++) {
            if (processed >= BATCH_SIZE) break;

            let item = list[index];
            if (typeof item === 'string') {
                try { item = JSON.parse(item); } catch (e) { continue; }
            }

            if (item.tg_file_id || (item.videoUrl && item.videoUrl.includes('api.telegram.org'))) {
                continue;
            }

            const videoId = item.id;
            const author = item.author || 'i';
            const tiktokUrl = `https://www.tiktok.com/@${author}/video/${videoId}`;

            try {
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

                    if (!tgData.ok || !tgData.result.video) {
                        failed++;
                        continue;
                    }

                    const fileId = tgData.result.video.file_id;

                    const fileInfoRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
                    const fileInfo = await fileInfoRes.json();

                    if (!fileInfo.ok || !fileInfo.result.file_path) {
                        failed++;
                        continue;
                    }

                    const permanentUrl = `https://api.telegram.org/file/bot${token}/${fileInfo.result.file_path}`;

                    const updatedItem = {
                        id: String(videoId),
                        videoUrl: permanentUrl,
                        author: author,
                        desc: tikJson.data.title || item.desc || 'on tiktok',
                        cover: tikJson.data.cover || item.cover,
                        tg_file_id: fileId,
                        date: item.date || Date.now()
                    };
                    await fetch(`${DB_URL}/`, {
                        method: 'POST',
                        headers: { 
                            Authorization: `Bearer ${DB_TOKEN}`, 
                            'Content-Type': 'application/json' 
                        },
                        body: JSON.stringify(["LSET", "feed_videos", index, JSON.stringify(updatedItem)])
                    });
                    processed++;
                    restoredDetails.push(`• <code>${videoId}</code> (@${author})`);
                } else {
                    failed++;
                }
            } catch (err) {
                console.error(`Error migrating ID ${videoId}:`, err);
                failed++;
            }

            await new Promise(r => setTimeout(r, 400));
        }

        const totalRemaining = list.filter(v => {
            const parsed = typeof v === 'string' ? JSON.parse(v) : v;
            return !parsed.tg_file_id && (!parsed.videoUrl || !parsed.videoUrl.includes('api.telegram.org'));
        }).length;

        const isDone = totalRemaining === 0;
        let reportText = `🛠 <b>Отчет о реставрации базы:</b>\n\n`;
        reportText += `✅ Восстановлено в этой пачке: <b>${processed}</b>\n`;
        if (restoredDetails.length > 0) {
            reportText += `${restoredDetails.join('\n')}\n`;
        }
        reportText += `⚠️ Недоступно / удалено в TT: <b>${failed}</b>\n`;
        reportText += `⏳ Осталось немигрированных: <b>${totalRemaining}</b> из ${list.length}\n`;

        if (isDone) {
            reportText += `\n🎉 <b>Все видео успешно перенесены в Telegram CDN!</b>`;
        }

        const inlineKeyboard = isDone ? null : {
            inline_keyboard: [
                [{ text: "▶️ Восстановить ещё 5", callback_data: "run_migrate_batch" }]
            ]
        };

        try {
            await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: ownerId,
                    text: reportText,
                    parse_mode: 'HTML',
                    reply_markup: inlineKeyboard
                })
            });
        } catch (e) {}

        return res.status(200).json({
            success: true,
            migrated: processed,
            failed: failed,
            remaining: totalRemaining
        });

    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message });
    }
}
