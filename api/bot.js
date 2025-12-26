// bot.js

export default async function handler(req, res) {
    try {
        if (req.method !== 'POST') return res.status(200).send('OK');

        const body = req.body;
        const token = process.env.BOT_TOKEN;

        // === НАСТРОЙКИ ССЫЛОК ===
        // Важно: убедитесь, что в BotFather создано Web App с коротким именем 'app' (или измените переменную appName)
        const botUsername = 'OneShotFeedBot'; 
        const appName = 'app'; 

        // === КОНФИГУРАЦИЯ АДМИНОВ ===
        // ADMIN_ID=123456,-100987654,...
        const rawAdminIds = (process.env.ADMIN_ID || '').split(',');
        const allowedIds = rawAdminIds.map(id => String(id).trim());
        // adminUsers - только люди (для отправки логов в ЛС)
        const adminUsers = allowedIds.filter(id => !id.startsWith('-100'));
        const isAllowed = (id) => allowedIds.includes(String(id));

        const webAppUrl = 'https://feed.mettaneko.ru';
        const DB_URL = process.env.KV_REST_API_URL;
        const DB_TOKEN = process.env.KV_REST_API_TOKEN;


        // === 1. ОБРАБОТКА CALLBACK (КНОПКИ) ===
        if (body.callback_query) {
            const query = body.callback_query;
            const callbackId = query.id;
            const chatId = query.message.chat.id;
            const data = query.data;

            // --- История версий ---
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

            // --- Удаление видео (кнопка 🗑) ---
            else if (data.startsWith('del_')) {
                if (!isAllowed(chatId)) {
                    await answerCallback(token, callbackId, "⛔️ Только для админов");
                    return res.status(200).json({ ok: true });
                }
                
                const vidId = data.split('del_')[1];
                await answerCallback(token, callbackId, "⏳ Удаляю...");
                
                try {
                    // 1. Получаем все видео из базы
                    const getRes = await fetch(`${DB_URL}/lrange/feed_videos/0/-1`, { headers: { Authorization: `Bearer ${DB_TOKEN}` } });
                    const getData = await getRes.json();
                    let videos = getData.result || [];
                    
                    // Парсим строки JSON в объекты
                    videos = videos.map(v => typeof v === 'string' ? JSON.parse(v) : v);
                    
                    const initialLen = videos.length;
                    // Фильтруем список, исключая удаляемое видео
                    const newVideos = videos.filter(v => String(v.id) !== String(vidId));
                    
                    if (newVideos.length === initialLen) {
                        await sendMessage(token, chatId, `⚠️ Видео ${vidId} не найдено (возможно уже удалено).`);
                    } else {
                        // 2. Очищаем старый список
                        await fetch(`${DB_URL}/del/feed_videos`, { headers: { Authorization: `Bearer ${DB_TOKEN}` } });
                        
                        // 3. Заливаем обновленный список обратно
                        if (newVideos.length > 0) {
                            const args = newVideos.map(v => JSON.stringify(v));
                            // Используем спред-оператор, но следим за лимитами (для небольших баз ок)
                            await fetch(`${DB_URL}/`, {
                                method: 'POST',
                                headers: { Authorization: `Bearer ${DB_TOKEN}`, 'Content-Type': 'application/json' },
                                body: JSON.stringify(["RPUSH", "feed_videos", ...args])
                            });
                        }
                        
                        await sendMessage(token, chatId, `🗑 Видео ${vidId} удалено!`);
                        
                        // Удаляем сообщение с кнопкой удаления, чтобы не кликать лишний раз
                        try {
                            await fetch(`https://api.telegram.org/bot${token}/deleteMessage`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ chat_id: chatId, message_id: query.message.message_id })
                            });
                        } catch(e) {}
                    }
                } catch (e) {
                    await sendMessage(token, chatId, `❌ Ошибка удаления: ${e.message}`);
                }
            }
            return res.status(200).json({ ok: true });
        }


        // === 2. ПОДГОТОВКА ДАННЫХ СООБЩЕНИЯ ===
        const msg = body.message || body.channel_post;
        if (!msg) return res.status(200).json({ ok: true });

        const chatId = msg.chat.id;
        const text = msg.text || msg.caption || '';
        const isChannel = String(chatId).startsWith('-100');

        // Если канал не в белом списке - игнор
        if (isChannel && !isAllowed(chatId)) return res.status(200).json({ ok: true });


        // === 3. ЛОГИКА ДЛЯ ЛИЧНЫХ СООБЩЕНИЙ ===
        if (!isChannel) {
            const user = msg.from || { id: chatId, username: 'Channel' };

            // Сохраняем юзера для статистики
            if (DB_URL && DB_TOKEN && chatId > 0) {
                try {
                    await fetch(`${DB_URL}/sadd/all_bot_users/${chatId}`, { headers: { Authorization: `Bearer ${DB_TOKEN}` } });
                } catch (e) {}
            }

            // --- /start ---
            if (text.startsWith('/start')) {
                // Прямая ссылка на Mini App
                const appLink = `https://t.me/${botUsername}/${appName}`;
                
                await sendMessage(token, chatId,
                    "👋 Привет! Добро пожаловать в Oneshot Feed.", {
                        inline_keyboard: [
                            [{ text: "📱 Открыть ленту", url: appLink }],
                            [{ text: "📜 История", callback_data: "version_history" }]
                        ]
                    }
                );
                return res.status(200).json({ ok: true });
            }

            // --- Админские команды ---
            if (isAllowed(chatId)) {
                
                // Статистика
                if (text === '/stats') {
                    try {
                        const uRes = await fetch(`${DB_URL}/scard/all_bot_users`, { headers: { Authorization: `Bearer ${DB_TOKEN}` } });
                        const uData = await uRes.json();
                        const vRes = await fetch(`${DB_URL}/llen/feed_videos`, { headers: { Authorization: `Bearer ${DB_TOKEN}` } });
                        const vData = await vRes.json();
                        await sendMessage(token, chatId, `📊 *Статистика:*\n\n👥 Пользователей: *${uData.result}*\n📹 Видео: *${vData.result}*`);
                    } catch (e) { await sendMessage(token, chatId, "Ошибка получения статистики."); }
                    return res.status(200).json({ ok: true });
                }

                // Рассылка
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

                // Maintenance
                const maintenanceMatch = /\/maintenance (on|off)/.exec(text);
                if (maintenanceMatch) {
                    const status = maintenanceMatch[1];
                    try {
                        await fetch(`${webAppUrl}/api/maintenance`, {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ adminId: user.id, status: status })
                        });
                        await sendMessage(token, chatId, `✅ Maintenance: ${status}`);
                    } catch (e) {}
                    return res.status(200).json({ ok: true });
                }
                
                // Winter Theme
                if (text.startsWith('/winter')) {
                    const act = text.split(' ')[1];
                    let active = false, reset = false;
                    if (act === 'on') active = true; else if (act === 'reset') { active = true; reset = true; }
                    try {
                        await fetch(`${webAppUrl}/api/theme`, {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ active, reset })
                        });
                        await sendMessage(token, chatId, `❄️ Winter: ${act}`);
                    } catch (e) {}
                    return res.status(200).json({ ok: true });
                }

                // Clear
                if (text === '/clear') {
                     await fetch(`${DB_URL}/del/feed_videos`, { headers: { Authorization: `Bearer ${DB_TOKEN}` } });
                     await sendMessage(token, chatId, "🗑 База очищена!", null, 'HTML');
                     return res.status(200).json({ ok: true });
                }
            }
        }


        // === 4. АВТОПАРСИНГ (TIKTOK ONLY) ===
        const extractedUrl = extractTikTokLink(msg);
        const isAddCommand = !isChannel && text.startsWith('/add');
        const isAutoParse = isAllowed(chatId) && extractedUrl;

        if (isAddCommand || isAutoParse) {
            const targetUrl = extractedUrl || (isAddCommand ? text.split(/\s+/).find(p => p.includes('http')) : null);

            if (!targetUrl) {
                if (isAddCommand) await sendMessage(token, chatId, "❌ Нет ссылки.");
                return res.status(200).json({ ok: true });
            }

            if (!isChannel) await sendMessage(token, chatId, "⏳ Загружаю...", null, 'HTML');

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

                // Фильтр слайд-шоу
                if (tikData && tikData.images && tikData.images.length > 0) {
                    if (!isChannel) await sendMessage(token, chatId, "❌ Это фото/слайд-шоу. Пропуск.");
                    return res.status(200).json({ ok: true });
                }

                let finalVideoUrl = null;
                let finalCover = null;
                let finalId = null;
                let finalAuthor = 'unknown';

                if (tikData) {
                    finalId = tikData.id;
                    finalAuthor = tikData.author ? tikData.author.unique_id : 'unknown';
                    // Формируем вечную ссылку через прокси TikWM
                    finalVideoUrl = `https://www.tikwm.com/video/media/play/${finalId}.mp4`;
                    finalCover = `https://www.tikwm.com/video/media/hdcover/${finalId}.jpg`;
                }

                if (finalVideoUrl && finalId) {
                    const newVideo = { 
                        id: finalId, 
                        videoUrl: finalVideoUrl, 
                        author: finalAuthor, 
                        desc: 'on tiktok', 
                        cover: finalCover,
                        date: Date.now() 
                    };
                    
                    // Сохраняем в базу
                    await fetch(`${DB_URL}/`, {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${DB_TOKEN}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify(["RPUSH", "feed_videos", JSON.stringify(newVideo)])
                    });
                    
                    // --- Определяем источник ---
                    let sourceName = isChannel ? 'Канал' : 'ЛС Админа';
                    if (isChannel && msg.chat) {
                        const title = msg.chat.title || 'Channel';
                        if (msg.chat.username) sourceName = `<a href="https://t.me/${msg.chat.username}">${title}</a>`;
                        else sourceName = title;
                    }

                    // *** ГЕНЕРАЦИЯ ССЫЛКИ Deep Link ***
                    // Формат: https://t.me/OneShotFeedBot/app?startapp=v_12345
                    const directLink = `https://t.me/${botUsername}/${appName}?startapp=v_${newVideo.id}`;

                    const logCaption = `✅ <b>Видео сохранено!</b>\n\n📍 ${sourceName}\n👤 @${newVideo.author}\n🆔 <code>${newVideo.id}</code>\n🔗 <a href="${directLink}">Открыть в приложении</a>`;

                    // Кнопка удаления для админа
                    const deleteKeyboard = {
                        inline_keyboard: [[{ text: "🗑 Удалить", callback_data: `del_${newVideo.id}` }]]
                    };

                    // Отправляем лог с видео всем админам-людям
                    for (const adminId of adminUsers) {
                        try {
                             await sendVideo(token, adminId, finalVideoUrl, logCaption, deleteKeyboard);
                        } catch (err) {
                             // Фолбэк на текст, если видео не отправилось
                             await sendMessage(token, adminId, logCaption + `\n\n⚠️ Видео-файл не отправлен, но в базе сохранен.`, deleteKeyboard, 'HTML');
                        }
                    }
                    
                    // Подтверждение в ЛС, если парсил сам админ вручную
                    if (!isChannel && !adminUsers.includes(String(chatId))) {
                        await sendMessage(token, chatId, `✅ Сохранено!\n👤 @${newVideo.author}`, null, 'HTML');
                    }

                } else {
                    if (!isChannel) await sendMessage(token, chatId, "❌ Не удалось спарсить (пустой ответ TikWM).");
                }
            } catch (e) {
                const errText = `⚠️ <b>Ошибка парсинга</b> (${isChannel ? 'Channel' : 'DM'}): ${e.message}`;
                for (const adminId of adminUsers) await sendMessage(token, adminId, errText, null, 'HTML');
            }
        }

        // === 5. ПРЕДЛОЖКА ОТ ЮЗЕРОВ ===
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


// === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===

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

async function sendVideo(token, chatId, videoUrl, caption, keyboard = null, parseMode = 'Markdown') {
    const body = { chat_id: chatId, video: videoUrl, caption: caption, parse_mode: parseMode };
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
