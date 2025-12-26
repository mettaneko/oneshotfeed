// bot.js

export default async function handler(req, res) {
    try {
        if (req.method !== 'POST') return res.status(200).send('OK');

        const body = req.body;
        const token = process.env.BOT_TOKEN;

        // === КОНФИГУРАЦИЯ ===
        const rawAdminIds = (process.env.ADMIN_ID || '').split(',');
        // Список всех разрешенных ID (люди + каналы)
        const allowedIds = rawAdminIds.map(id => String(id).trim());
        // Список только людей-админов (для получения логов), исключаем каналы (-100...)
        const adminUsers = allowedIds.filter(id => !id.startsWith('-100'));

        const isAllowed = (id) => allowedIds.includes(String(id));

        const webAppUrl = 'https://feed.mettaneko.ru';
        const DB_URL = process.env.KV_REST_API_URL;
        const DB_TOKEN = process.env.KV_REST_API_TOKEN;


        // === 1. ОБРАБОТКА КНОПОК ===
        if (body.callback_query) {
            const callbackId = body.callback_query.id;
            const chatId = body.callback_query.message.chat.id;
            const data = body.callback_query.data;

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
`;
                await sendMessage(token, chatId, historyText, null, 'Markdown');

                await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ callback_query_id: callbackId })
                });
            }
            return res.status(200).json({ ok: true });
        }


        // === 2. ПОДГОТОВКА ДАННЫХ СООБЩЕНИЯ ===
        const msg = body.message || body.channel_post; // Ловим и личку, и каналы
        if (!msg) return res.status(200).json({ ok: true });

        const chatId = msg.chat.id;
        const text = msg.text || msg.caption || '';
        // Определяем, канал это или нет (по ID)
        const isChannel = String(chatId).startsWith('-100');

        // Если это канал, но его нет в списке админов -> игнор
        if (isChannel && !isAllowed(chatId)) {
            return res.status(200).json({ ok: true });
        }


        // === 3. ЛОГИКА ДЛЯ ЛИЧНЫХ СООБЩЕНИЙ (КОМАНДЫ) ===
        // В каналах команды НЕ выполняются
        if (!isChannel) {
            const user = msg.from || { id: chatId, username: 'Channel' };

            // Сохраняем юзера
            if (DB_URL && DB_TOKEN && chatId > 0) {
                try {
                    await fetch(`${DB_URL}/sadd/all_bot_users/${chatId}`, {
                        headers: { Authorization: `Bearer ${DB_TOKEN}` }
                    });
                } catch (e) { console.error("User save error:", e); }
            }

            // /start
            if (text === '/start') {
                await sendMessage(token, chatId,
                    "👋 Привет! Добро пожаловать в Oneshot Feed.\nСмотри, предлагай видео или просто читай обновления!", {
                        inline_keyboard: [
                            [{ text: "📱 Открыть", web_app: { url: webAppUrl } }],
                            [{ text: "📜 История", callback_data: "version_history" }]
                        ]
                    }
                );
                return res.status(200).json({ ok: true });
            }

            // Админские команды (кроме /add, она обработается ниже вместе с каналами)
            if (isAllowed(chatId)) {
                
                // Tech Works
                const maintenanceMatch = /\/maintenance (on|off)/.exec(text);
                if (maintenanceMatch) {
                    const status = maintenanceMatch[1];
                    try {
                        const response = await fetch(`${webAppUrl}/api/maintenance`, {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ adminId: user.id, status: status })
                        });
                        if (response.ok) {
                            const newStatusText = status === 'on' ? '🟢 ВКЛЮЧЕН' : '🔴 ВЫКЛЮЧЕН';
                            await sendMessage(token, chatId, `✅ Режим технических работ успешно ${newStatusText}.`);
                        } else throw new Error('API Error');
                    } catch (error) { await sendMessage(token, chatId, `❌ Ошибка: ${error.message}`); }
                    return res.status(200).json({ ok: true });
                }

                // Winter Theme
                const winterMatch = /\/winter (on|off|reset)/.exec(text);
                if (winterMatch) {
                    const action = winterMatch[1];
                    let active = false, reset = false;
                    if (action === 'on') active = true; else if (action === 'reset') { active = true; reset = true; }
                    try {
                        const response = await fetch(`${webAppUrl}/api/theme`, {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ active, reset })
                        });
                        if (response.ok) {
                            let reply = action === 'on' ? '❄️ Включено!' : (action === 'off' ? '🚫 Выключено.' : '🔄 Сброшено.');
                            await sendMessage(token, chatId, reply);
                        } else await sendMessage(token, chatId, `❌ Ошибка API: ${response.status}`);
                    } catch (error) { await sendMessage(token, chatId, `❌ Сеть: ${error.message}`); }
                    return res.status(200).json({ ok: true });
                }

                // Clear
                if (text === '/clear') {
                    await fetch(`${DB_URL}/del/feed_videos`, { headers: { Authorization: `Bearer ${DB_TOKEN}` } });
                    await sendMessage(token, chatId, "🗑 База очищена!", null, 'HTML');
                    return res.status(200).json({ ok: true });
                }

                // Broadcast
                if (text.startsWith('/broadcast')) {
                    const bText = text.replace('/broadcast', '').trim();
                    if (!bText) return sendMessage(token, chatId, "Текст?");
                    let users = [];
                    try {
                        const r = await fetch(`${DB_URL}/smembers/all_bot_users`, { headers: { Authorization: `Bearer ${DB_TOKEN}` } });
                        const d = await r.json();
                        users = d.result || [];
                    } catch (e) {}
                    let count = 0;
                    for (const u of users) {
                        try { await sendMessage(token, u, `📢 Новости:\n${bText}`, null, 'HTML'); count++; } catch (e) {}
                    }
                    await sendMessage(token, chatId, `Рассылка: ${count} чел.`);
                    return res.status(200).json({ ok: true });
                }
            }
        }


        // === 4. УНИВЕРСАЛЬНЫЙ ПАРСИНГ (КАНАЛЫ + ЛС АДМИНА) ===
        // Условия запуска: 
        // 1. Чат разрешен (канал или админ)
        // 2. В тексте есть ссылка на тикток (даже скрытая) ИЛИ это команда /add в ЛС
        
        const extractedUrl = extractTikTokLink(msg);
        const isAddCommand = !isChannel && text.startsWith('/add'); // /add только в ЛС
        const isAutoParse = isAllowed(chatId) && extractedUrl;

        if (isAddCommand || isAutoParse) {
            const targetUrl = extractedUrl || (isAddCommand ? text.split(/\s+/).find(p => p.includes('http')) : null);

            if (!targetUrl) {
                if (isAddCommand) await sendMessage(token, chatId, "❌ Нет ссылки.");
                return res.status(200).json({ ok: true });
            }

            // В каналах молчим, в ЛС пишем статус
            if (!isChannel) await sendMessage(token, chatId, "⏳ Загружаю (TikWM)...", null, 'HTML');

            try {
                let tikData = null;
                // 1. Запрос к TikWM
                try {
                    const apiRes = await fetch("https://www.tikwm.com/api/", {
                        method: "POST",
                        headers: { "Content-Type": "application/x-www-form-urlencoded" },
                        body: new URLSearchParams({ url: targetUrl })
                    });
                    const apiJson = await apiRes.json();
                    if (apiJson.code === 0 && apiJson.data) tikData = apiJson.data;
                } catch (e) { console.error("TikWM fail:", e); }

                // Проверка на слайд-шоу
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
                    // Формируем вечную ссылку прокси TikWM
                    finalVideoUrl = `https://www.tikwm.com/video/media/play/${finalId}.mp4`;
                    finalCover = `https://www.tikwm.com/video/media/hdcover/${finalId}.jpg`;
                } else {
                    // Fallback на Cobalt
                    const cobaltUrl = await getCobaltLink(targetUrl);
                    if (cobaltUrl) {
                        finalVideoUrl = cobaltUrl;
                        finalId = extractIdFromUrl(targetUrl) || Date.now().toString();
                        finalAuthor = 'cobalt_user';
                        finalCover = 'https://via.placeholder.com/150?text=No+Cover';
                    }
                }

                if (finalVideoUrl && finalId) {
                    const newVideo = { 
                        id: finalId, 
                        videoUrl: finalVideoUrl, 
                        author: finalAuthor, 
                        desc: tikData?.title || 'on tiktok', 
                        cover: finalCover,
                        date: Date.now() 
                    };
                    
                    await fetch(`${DB_URL}/`, {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${DB_TOKEN}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify(["RPUSH", "feed_videos", JSON.stringify(newVideo)])
                    });
                    
                    const logMsg = `✅ <b>New Video Parsed!</b>\nFrom: ${isChannel ? 'Channel' : 'Admin DM'}\nID: <code>${newVideo.id}</code>\nAuthor: @${newVideo.author}`;
                    
                    // Логи шлем только ЛЮДЯМ-админам
                    for (const adminId of adminUsers) {
                        await sendMessage(token, adminId, logMsg, null, 'HTML');
                    }
                    
                    // Если это было ЛС админа, дублируем ему подтверждение (если он не в списке выше, хотя должен быть)
                    if (!isChannel && !adminUsers.includes(String(chatId))) {
                        await sendMessage(token, chatId, `✅ Сохранено!\n👤 @${newVideo.author}`, null, 'HTML');
                    }

                } else {
                    if (!isChannel) await sendMessage(token, chatId, "❌ Не удалось спарсить видео.");
                }
            } catch (e) {
                // Ошибки парсинга из канала тоже шлем админам
                const errText = `⚠️ <b>Parse Error</b>\nSource: ${isChannel ? 'Channel' : 'DM'}\nError: ${e.message}`;
                for (const adminId of adminUsers) {
                    await sendMessage(token, adminId, errText, null, 'HTML');
                }
            }
        }


        // === 5. ПРЕДЛОЖКА ОТ ОБЫЧНЫХ ЮЗЕРОВ ===
        // Только ЛС, только если не админ
        if (!isChannel && !isAllowed(chatId) && chatId > 0) {
            if (text.startsWith('/add') || text.startsWith('/clear')) {
                return res.status(200).json({ ok: true });
            }
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

// Умный поиск ссылки (включая скрытые ссылки [текст](url) и пересылки)
function extractTikTokLink(msg) {
    const text = msg.text || msg.caption || '';
    const entities = msg.entities || msg.caption_entities || [];

    // 1. Проверяем гиперссылки (entities)
    for (const entity of entities) {
        if (entity.type === 'text_link' && entity.url && (entity.url.includes('tiktok.com'))) {
            return entity.url; // Нашли скрытую ссылку
        }
        if (entity.type === 'url') {
            const substr = text.substring(entity.offset, entity.offset + entity.length);
            if (substr.includes('tiktok.com')) return substr;
        }
    }

    // 2. Если entities не помогли, ищем регуляркой в тексте
    const match = text.match(/https?:\/\/(www\.|vm\.|vt\.)?tiktok\.com\/[^\s]+/);
    if (match) return match[0];

    return null;
}

async function getCobaltLink(url) {
    try {
        const response = await fetch("https://api.cobalt.tools/api/json", {
            method: "POST",
            headers: { "Accept": "application/json", "Content-Type": "application/json" },
            body: JSON.stringify({ url: url, vCodec: "h264", vQuality: "720", filenamePattern: "basic" })
        });
        const data = await response.json();
        if (data && data.url) return data.url;
        return null;
    } catch (e) { return null; }
}

function extractIdFromUrl(url) {
    const match = url.match(/\/video\/(\d+)/);
    return match ? match[1] : null;
}

async function sendMessage(token, chatId, text, keyboard = null, parseMode = 'Markdown') {
    const body = { chat_id: chatId, text, parse_mode: parseMode, disable_web_page_preview: true };
    if (keyboard) body.reply_markup = keyboard;
    try {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
    } catch (e) {}
}
