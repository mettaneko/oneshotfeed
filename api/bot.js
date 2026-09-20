// api/bot.js

export default async function handler(req, res) {
    try {
        const webhookSecret = process.env.WEBHOOK_SECRET;
        if (webhookSecret && req.headers['x-telegram-bot-api-secret-token'] !== webhookSecret) {
            return res.status(401).json({ error: 'Invalid webhook secret' });
        }
        if (req.method !== 'POST') return res.status(200).send('OK');

        const body = req.body;
        const token = process.env.BOT_TOKEN;

        const botUsername = 'OneShotFeedBot'; 
        const appName = 'app'; 
        
        const ownerId = process.env.OWNER_ID || '5710960426';
        const rawAdminIds = (process.env.ADMIN_ID || '').split(',');
        const allowedIds = rawAdminIds.map(id => String(id).trim());
        const adminUsers = allowedIds.filter(id => !id.startsWith('-100'));
        const isAllowed = (id) => allowedIds.includes(String(id)) || String(id) === String(ownerId);

        const webAppUrl = 'https://feed.mettaneko.ru';
        const DB_URL = process.env.KV_REST_API_URL;
        const DB_TOKEN = process.env.KV_REST_API_TOKEN;


        if (body.callback_query) {
            const query = body.callback_query;
            const callbackId = query.id;
            const chatId = query.message.chat.id;
            const data = query.data;
        
            if (data === 'run_migrate_auto' || data === 'next_auto_batch') {
                if (String(chatId) !== String(ownerId)) return;

                let messageId = query.message ? query.message.message_id : null;

                if (data === 'run_migrate_auto') {
                    await fetch(`${DB_URL}/set/migrate_auto_running/true`, { headers: { Authorization: `Bearer ${DB_TOKEN}` } });
                    await answerCallback(token, callbackId, "🚀 Авто-режим запущен!");
                } else {
                    await answerCallback(token, callbackId);
                }

                const checkStatus = await fetch(`${DB_URL}/get/migrate_auto_running`, { headers: { Authorization: `Bearer ${DB_TOKEN}` } });
                const statusJson = await checkStatus.json();
                if (statusJson.result !== 'true') {
                    return res.status(200).json({ ok: true });
                }

                try {
                    const migRes = await fetch(`${webAppUrl}/api/migrate`);
                    const result = await migRes.json();

                    if (!result.ok) throw new Error(result.error || 'Unknown error');

                    const isDone = result.remaining === 0;
                    let text = `⚙️ <b>Реставрация базы (Автоматически):</b>\n\n`;
                    text += `✅ Восстановлено: <b>+${result.processed}</b> (${result.restoredNames.length ? result.restoredNames.join(', ') : 'нет'})\n`;
                    text += `⚠️ Удалено из TT: <b>${result.failed}</b>\n`;
                    text += `⏳ Осталось немигрированных: <b>${result.remaining}</b> из ${result.total}\n\n`;
                    text += `<i>Бот продолжает работу сам, ничего нажимать не нужно...</i>`;

                    const keyboard = isDone ? null : {
                        inline_keyboard: [[{ text: "⏹ Остановить", callback_data: "stop_migrate" }]]
                    };

                    if (messageId) {
                        await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                chat_id: chatId,
                                message_id: messageId,
                                text: isDone ? "🎉 <b>Все видео успешно перенесены!</b>" : text,
                                parse_mode: 'HTML',
                                reply_markup: keyboard
                            })
                        });
                    }

                    if (!isDone) {
                        fetch(`${webAppUrl}/api/bot`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                callback_query: {
                                    id: 'auto_' + Date.now(),
                                    from: { id: ownerId },
                                    message: { chat: { id: ownerId }, message_id: messageId },
                                    data: 'next_auto_batch'
                                }
                            })
                        }).catch(() => {});
                    } else {
                        await fetch(`${DB_URL}/set/migrate_auto_running/false`, { headers: { Authorization: `Bearer ${DB_TOKEN}` } });
                    }

                } catch (e) {
                    await sendMessage(token, chatId, `❌ Сбой цикла: ${e.message}. Нажмите продолжить:`, {
                        inline_keyboard: [[{ text: "▶️ Продолжить", callback_data: "run_migrate_auto" }]]
                    });
                }
                return res.status(200).json({ ok: true });
            }
            if (data === 'version_history') {
                const historyText = `
📜 *История версий Oneshot Feed:*
(Нумерация - Год.Месяц.Номер версии)

*25.12.1* - Бета-тест.
*25.12.2* - Добавлена предложка и подписки.
*25.12.3* - Оптимизация для Telegram Mini-apps.
*25.12.4* - Защита от спама и чуть улучшенный интерфейс.
*25.12.5* - Улучшено взаимодействие с плеером и добавлено стартовое сообщение при написании /start.
*25.12.6R* - Фикс багов с кнопками стартового сообщения.
*25.12.6X* - Добавление ~1193 новых видео по тематике, оптимизация ленты и попытки уменьшить повторы в ленте.
*25.12.7* - Апдейт лог: [https://t.me/mettaneko/2849](https://t.me/mettaneko/2849)
*25.12.8W* - Апдейт лог: [https://t.me/mettaneko/2861](https://t.me/mettaneko/2861)
*25.12.9* - Апдейт лог: [https://t.me/mettaneko/2867](https://t.me/mettaneko/2867)
*25.12.9T* - Апдейт лог: [https://t.me/mettaneko/2869](https://t.me/mettaneko/2869)
`;
                await sendMessage(token, chatId, historyText, null, 'Markdown');
                await answerCallback(token, callbackId);
            }

            if (isAllowed(chatId)) {
                if (data.startsWith('del_')) {
                    const vidId = data.split('del_')[1];
                    await answerCallback(token, callbackId, "⏳ Удаляю...");
                    
                    try {
                        const getRes = await fetch(`${DB_URL}/lrange/feed_videos/0/-1`, { headers: { Authorization: `Bearer ${DB_TOKEN}` } });
                        const getData = await getRes.json();
                        let videos = getData.result || [];
                        videos = videos.map(v => typeof v === 'string' ? JSON.parse(v) : v);
                        
                        const initialLen = videos.length;
                        const newVideos = videos.filter(v => String(v.id) !== String(vidId));
                        
                        if (newVideos.length === initialLen) {
                            await sendMessage(token, chatId, `⚠️ Видео ${vidId} не найдено.`);
                        } else {
                            await fetch(`${DB_URL}/del/feed_videos`, { headers: { Authorization: `Bearer ${DB_TOKEN}` } });
                            if (newVideos.length > 0) {
                                const args = newVideos.map(v => JSON.stringify(v));
                                await fetch(`${DB_URL}/`, {
                                    method: 'POST',
                                    headers: { Authorization: `Bearer ${DB_TOKEN}`, 'Content-Type': 'application/json' },
                                    body: JSON.stringify(["RPUSH", "feed_videos", ...args])
                                });
                            }
                            await sendMessage(token, chatId, `🗑 Видео ${vidId} удалено!`);
                            try {
                                await fetch(`https://api.telegram.org/bot${token}/deleteMessage`, {
                                    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Bot-Secret': process.env.WEBHOOK_SECRET || token },
                                    body: JSON.stringify({ chat_id: chatId, message_id: query.message.message_id })
                                });
                            } catch(e) {}
                        }
                    } catch (e) {
                        await sendMessage(token, chatId, `❌ Ошибка удаления: ${e.message}`);
                    }
                }

                if (data === 'maint_on' || data === 'maint_off') {
                    const status = data === 'maint_on' ? 'on' : 'off';
                    try {
                        await fetch(`${webAppUrl}/api/maintenance`, {
                            method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Bot-Secret': process.env.WEBHOOK_SECRET || token },
                            body: JSON.stringify({ adminId: query.from.id, status: status })
                        });
                        await answerCallback(token, callbackId, `Maintenance: ${status}`);
                        await sendMessage(token, chatId, `✅ Тех. работы: ${status}`);
                    } catch (e) {}
                }
                
                if (data === 'winter_on' || data === 'winter_reset') {
                    const active = data === 'winter_on';
                    const reset = data === 'winter_reset';
                    try {
                        await fetch(`${webAppUrl}/api/theme`, {
                            method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Bot-Secret': process.env.WEBHOOK_SECRET || token },
                            body: JSON.stringify({ active, reset })
                        });
                        await answerCallback(token, callbackId, `Winter: ${active ? 'ON' : 'RESET'}`);
                        await sendMessage(token, chatId, `❄️ Winter Theme: ${active ? 'Включена' : 'Сброшена'}`);
                    } catch (e) {}
                }
                
                if (data === 'confirm_clear') {
                     await fetch(`${DB_URL}/del/feed_videos`, { headers: { Authorization: `Bearer ${DB_TOKEN}` } });
                     await answerCallback(token, callbackId, "База очищена");
                     await sendMessage(token, chatId, "🗑 База видео полностью очищена!", null, 'HTML');
                }
            }
            return res.status(200).json({ ok: true });
        }


        const msg = body.message || body.channel_post;
        if (!msg) return res.status(200).json({ ok: true });

        const chatId = msg.chat.id;
        const text = msg.text || msg.caption || '';
        const isChannel = String(chatId).startsWith('-100');

        if (isChannel && !isAllowed(chatId)) return res.status(200).json({ ok: true });


        if (!isChannel) {

            if (DB_URL && DB_TOKEN && chatId > 0) {
                try {
                    await fetch(`${DB_URL}/sadd/all_bot_users/${chatId}`, { headers: { Authorization: `Bearer ${DB_TOKEN}` } });
                } catch (e) {}
            }


            if (text.startsWith('/start')) {
                const appLink = `https://t.me/${botUsername}/${appName}`;

                if (isAllowed(chatId)) {
                    await sendMessage(token, chatId, "👋 Привет! Добро пожаловать в Oneshot Feed. У тебя есть административные права.", {
                        keyboard: [
                            [{ text: "📊 Статистика" }, { text: "📢 Рассылка" }],
                            [{ text: "🔧 Тех. работы" }, { text: "❄️ Зимняя тема" }],
                            [{ text: "🔄 Реставрация базы" }] 
                        ],
                        resize_keyboard: true,
                        is_persistent: true
                    });
                } else {
                    await sendMessage(token, chatId,
                        "👋 Привет! Добро пожаловать в Oneshot Feed.", {
                            inline_keyboard: [
                                [{ text: "📱 Открыть ленту", url: appLink }],
                                [{ text: "📜 История", callback_data: "version_history" }]
                            ]
                        }
                    );
                }
                return res.status(200).json({ ok: true });
            }

            if ((text === '/migrate' || text === '🔄 Реставрация базы') && String(chatId) === String(ownerId)) {
                await sendMessage(token, chatId, "Выберите режим реставрации:", {
                    inline_keyboard: [
                        [{ text: "🚀 Запустить АВТО-режим", callback_data: "run_migrate_auto" }],
                        [{ text: "▶️ Восстановить разово 5 шт.", callback_data: "run_migrate_batch" }]
                    ]
                });
                return res.status(200).json({ ok: true });
            }

            if (isAllowed(chatId)) {
                if (text === "📊 Статистика" || text === '/stats') {
                    try {
                        const uRes = await fetch(`${DB_URL}/scard/all_bot_users`, { headers: { Authorization: `Bearer ${DB_TOKEN}` } });
                        const uData = await uRes.json();
                        const vRes = await fetch(`${DB_URL}/llen/feed_videos`, { headers: { Authorization: `Bearer ${DB_TOKEN}` } });
                        const vData = await vRes.json();
                        await sendMessage(token, chatId, `📊 *Статистика:*\n\n👥 Пользователей: *${uData.result}*\n📹 Видео: *${vData.result}*`);
                    } catch (e) { await sendMessage(token, chatId, "Ошибка статистики."); }
                    return res.status(200).json({ ok: true });
                }

                if (text === "📢 Рассылка") {
                    await sendMessage(token, chatId, "Для рассылки отправь команду:\n`/broadcast Текст | Кнопка | Ссылка`", null, 'Markdown');
                    return res.status(200).json({ ok: true });
                }

                if (text.startsWith('/broadcast')) {
                    const raw = text.replace('/broadcast', '').trim();
                    if (!raw) return sendMessage(token, chatId, "Формат: Текст | Кнопка | Ссылка");
                    
                    const parts = raw.split('|').map(p => p.trim());
                    const bText = parts[0];
                    const btnText = parts[1];
                    const btnUrl = parts[2];

                    let keyboard = null;
                    if (btnText && btnUrl) {
                        keyboard = { inline_keyboard: [[{ text: btnText, url: btnUrl }]] };
                    }

                    let users = [];
                    try {
                        const r = await fetch(`${DB_URL}/smembers/all_bot_users`, { headers: { Authorization: `Bearer ${DB_TOKEN}` } });
                        const d = await r.json();
                        users = d.result || [];
                    } catch (e) {}

                    let count = 0;
                    for (const u of users) {
                        try { await sendMessage(token, u, bText, keyboard, 'HTML'); count++; } catch (e) {}
                    }
                    await sendMessage(token, chatId, `Рассылка завершена: ${count} чел.`);
                    return res.status(200).json({ ok: true });
                }

                if (text === "🔧 Тех. работы") {
                    await sendMessage(token, chatId, "Управление режимом обслуживания:", {
                        inline_keyboard: [
                            [{ text: "🟢 Включить", callback_data: "maint_on" }, { text: "🔴 Выключить", callback_data: "maint_off" }]
                        ]
                    });
                    return res.status(200).json({ ok: true });
                }

                if (text === "❄️ Зимняя тема") {
                    await sendMessage(token, chatId, "Управление снегом:", {
                        inline_keyboard: [
                            [{ text: "❄️ Включить", callback_data: "winter_on" }, { text: "🚫 Выключить", callback_data: "winter_reset" }]
                        ]
                    });
                    return res.status(200).json({ ok: true });
                }

                if (text === "🗑 Очистить базу") {
                    await sendMessage(token, chatId, "Ты уверен? Это удалит ВСЕ видео.", {
                        inline_keyboard: [[{ text: "Да, удалить всё", callback_data: "confirm_clear" }]]
                    });
                     return res.status(200).json({ ok: true });
                }
            }
        }

        const extractedUrl = extractTikTokLink(msg);
        const isAddCommand = !isChannel && text.startsWith('/add');
        const isAutoParse = isAllowed(chatId) && extractedUrl;

        if (isAddCommand || isAutoParse) {
            const targetUrl = extractedUrl || (isAddCommand ? text.split(/\s+/).find(p => p.includes('http')) : null);

            if (!targetUrl) {
                if (isAddCommand) await sendMessage(token, chatId, "❌ Нет ссылки.");
                return res.status(200).json({ ok: true });
            }

            if (!isChannel) await sendMessage(token, chatId, "⏳ Загружаю в хранилище...", null, 'HTML');

            try {
                let tikData = null;
                try {
                    const apiRes = await fetch("https://www.tikwm.com/api/", {
                        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
                        body: new URLSearchParams({ url: targetUrl })
                    });
                    const apiJson = await apiRes.json();
                    if (apiJson.code === 0 && apiJson.data) tikData = apiJson.data;
                } catch (e) { console.error("TikWM fail:", e); }

                if (tikData && tikData.images && tikData.images.length > 0) {
                    if (!isChannel) await sendMessage(token, chatId, "❌ Это фото/слайд-шоу. Пропуск.");
                    return res.status(200).json({ ok: true });
                }

                if (tikData && tikData.play) {
                    const finalId = tikData.id;
                    const finalAuthor = tikData.author ? tikData.author.unique_id : 'unknown';
                    const tempVideoUrl = tikData.play.startsWith('http') ? tikData.play : `https://www.tikwm.com${tikData.play}`;
                    const storageChannelId = process.env.STORAGE_CHANNEL_ID;

                    if (!storageChannelId) {
                        throw new Error("Не задана переменная STORAGE_CHANNEL_ID в Vercel!");
                    }

                    const tgUploadRes = await fetch(`https://api.telegram.org/bot${token}/sendVideo`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            chat_id: storageChannelId,
                            video: tempVideoUrl,
                            caption: `TikTok: https://www.tiktok.com/@${finalAuthor}/video/${finalId}`
                        })
                    });
                    const tgUploadData = await tgUploadRes.json();

                    if (!tgUploadData.ok || !tgUploadData.result.video) {
                        throw new Error(`Ошибка загрузки в канал: ${tgUploadData.description || 'Unknown error'}`);
                    }

                    const fileId = tgUploadData.result.video.file_id;

                    const fileInfoRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
                    const fileInfo = await fileInfoRes.json();

                    let permanentVideoUrl = tempVideoUrl;
                    if (fileInfo.ok && fileInfo.result.file_path) {
                        permanentVideoUrl = `https://api.telegram.org/file/bot${token}/${fileInfo.result.file_path}`;
                    }

                    const newVideo = { 
                        id: String(finalId), 
                        sourceUrl: targetUrl,
                        tg_file_id: fileId,
                        videoUrl: permanentVideoUrl, 
                        author: finalAuthor, 
                        desc: tikData.title || 'on tiktok', 
                        cover: `https://www.tikwm.com/video/media/hdcover/${finalId}.jpg`,
                        date: Date.now() 
                    };
                    
                    await fetch(`${DB_URL}/`, {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${DB_TOKEN}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify(["RPUSH", "feed_videos", JSON.stringify(newVideo)])
                    });
                    
                    let sourceName = isChannel ? 'Канал' : 'ЛС Админа';
                    if (isChannel && msg.chat) {
                        const title = msg.chat.title || 'Channel';
                        if (msg.chat.username) sourceName = `<a href="https://t.me/${msg.chat.username}">${title}</a>`;
                        else sourceName = title;
                    }

                    const directLink = `https://t.me/${botUsername}/${appName}?startapp=v_${newVideo.id}`;
                    const logCaption = `✅ <b>Видео сохранено навсегда!</b>\n\n📍 ${sourceName}\n👤 @${newVideo.author}\n🆔 <code>${newVideo.id}</code>\n🔗 <a href="${directLink}">Открыть в приложении</a>`;

                    const deleteKeyboard = {
                        inline_keyboard: [[{ text: "🗑 Удалить", callback_data: `del_${newVideo.id}` }]]
                    };

                    for (const adminId of adminUsers) {
                        try {
                             await sendVideo(token, adminId, fileId, logCaption, deleteKeyboard, 'HTML');
                        } catch (err) {
                             await sendMessage(token, adminId, logCaption + `\n\n⚠️ Лог отправлен текстом.`, deleteKeyboard, 'HTML');
                        }
                    }
                    
                    if (!isChannel && !adminUsers.includes(String(chatId))) {
                        await sendMessage(token, chatId, `✅ Сохранено в хранилище!\n👤 @${newVideo.author}`, null, 'HTML');
                    }

                } else {
                    if (!isChannel) await sendMessage(token, chatId, "❌ Не удалось получить видео (TikWM).");
                }
            } catch (e) {
                const errText = `⚠️ <b>Ошибка</b> (${isChannel ? 'Channel' : 'DM'}): ${e.message}`;
                for (const adminId of adminUsers) await sendMessage(token, adminId, errText, null, 'HTML');
            }
        }

        // === ПРЕДЛОЖКА ===
        if (!isChannel && !isAllowed(chatId) && chatId > 0) {
            if (text.startsWith('/add') || text.startsWith('/clear')) return res.status(200).json({ ok: true });
            if (text.includes('http')) {
                const user = msg.from || { id: chatId };
                const sender = user.username ? `@${user.username}` : `ID: ${user.id}`;
                for (const adminId of adminUsers) {
                    await sendMessage(token, adminId, `🚨 ПРЕДЛОЖКА ОТ ${sender}:\n${text}`, null, 'HTML');
                }
            }
        }

        return res.status(200).json({ ok: true });

    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: 'Bot Error' });
    }
}



function extractTikTokLink(msg) {
    const text = msg.text || msg.caption || '';
    const entities = msg.entities || msg.caption_entities || [];
    const regex = /https?:\/\/(www\.|vm\.|vt\.)?tiktok\.com\/[^\s]+/i; 

    for (const entity of entities) {
        if (entity.type === 'text_link' && entity.url && regex.test(entity.url)) return entity.url;
        if (entity.type === 'url') {
            const substr = text.substring(entity.offset, entity.offset + entity.length);
            if (regex.test(substr)) return substr;
        }
    }
    const match = text.match(regex);
    if (match) return match[0];
    return null;
}

async function sendMessage(token, chatId, text, keyboard = null, parseMode = 'Markdown') {
    const body = { chat_id: chatId, text, parse_mode: parseMode, disable_web_page_preview: true };
    if (keyboard) body.reply_markup = keyboard;
    try {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
    } catch (e) {}
}

async function sendVideo(token, chatId, video, caption, keyboard = null, parseMode = 'Markdown') {
    const body = { chat_id: chatId, video: video, caption: caption, parse_mode: parseMode };
    if (keyboard) body.reply_markup = keyboard;
    
    const res = await fetch(`https://api.telegram.org/bot${token}/sendVideo`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`TG Video Error ${res.status}`);
}

async function answerCallback(token, callbackId, text = null) {
    const body = { callback_query_id: callbackId };
    if (text) body.text = text;
    await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
}
