// api/bot.js

export const config = { runtime: 'edge' };

export default async function handler(req, res) {
    try {
        if (req.method !== 'POST') return new Response('OK', { status: 200 });

        const body = await req.json();
        const token = process.env.BOT_TOKEN;

        // === НАСТРОЙКИ ===
        const botUsername = 'OneShotFeedBot'; // Замени на юзернейм своего бота без @
        const appName = 'app'; // Название Web App в BotFather

        // === КОНФИГУРАЦИЯ АДМИНОВ ===
        // ADMIN_ID=123456,-100987654 (перечислить через запятую в .env)
        const rawAdminIds = (process.env.ADMIN_ID || '').split(',');
        const allowedIds = rawAdminIds.map(id => String(id).trim());
        // adminUsers - только люди (исключаем каналы/чаты, начинающиеся с -100, для ЛС уведомлений)
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

            // --- История версий (для обычных юзеров) ---
            if (data === 'version_history') {
                const historyText = `
📜 *История версий Oneshot Feed:*
(Нумерация - Год.Месяц.Номер версии)

*25.12.1* - Бета-тест.
*25.12.2* - Добавлена предложка и подписки.
*25.12.3* - Оптимизация для Telegram Mini-apps.
*25.12.4* - Защита от спама и чуть улучшенный интерфейс.
*25.12.5* - Улучшено взаимодействие с плеером и добавлено стартовое сообщение.
*25.12.6R* - Фикс багов с кнопками.
*25.12.6X* - Добавление ~1200 видео, оптимизация ленты.
*25.12.7* - Апдейт лог: [https://t.me/mettaneko/2849](https://t.me/mettaneko/2849)
*25.12.8W* - Апдейт лог: [https://t.me/mettaneko/2861](https://t.me/mettaneko/2861)
*25.12.9* - Апдейт лог: [https://t.me/mettaneko/2867](https://t.me/mettaneko/2867)
*25.12.9T* - Апдейт лог: [https://t.me/mettaneko/2869](https://t.me/mettaneko/2869)
`;
                await sendMessage(token, chatId, historyText, null, 'Markdown');
                await answerCallback(token, callbackId);
            }

            // --- Админские действия (CALLBACK) ---
            if (isAllowed(chatId)) {
                
                // Удаление видео по кнопке "🗑 Удалить"
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
                            // Очищаем старый список
                            await fetch(`${DB_URL}/del/feed_videos`, { headers: { Authorization: `Bearer ${DB_TOKEN}` } });
                            
                            // Заливаем новый, если есть что заливать
                            if (newVideos.length > 0) {
                                // Разбиваем на батчи по 50 штук, чтобы не превысить лимит запроса
                                const batchSize = 50;
                                for (let i = 0; i < newVideos.length; i += batchSize) {
                                    const batch = newVideos.slice(i, i + batchSize);
                                    const args = batch.map(v => JSON.stringify(v));
                                    await fetch(`${DB_URL}/`, {
                                        method: 'POST',
                                        headers: { Authorization: `Bearer ${DB_TOKEN}`, 'Content-Type': 'application/json' },
                                        body: JSON.stringify(["RPUSH", "feed_videos", ...args])
                                    });
                                }
                            }
                            await sendMessage(token, chatId, `🗑 Видео ${vidId} удалено!`);
                            // Удаляем само сообщение с видео из чата бота
                            try {
                                await fetch(`https://api.telegram.org/bot${token}/deleteMessage`, {
                                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ chat_id: chatId, message_id: query.message.message_id })
                                });
                            } catch(e) {}
                        }
                    } catch (e) {
                        await sendMessage(token, chatId, `❌ Ошибка удаления: ${e.message}`);
                    }
                }

                // Управление тех. работами
                if (data === 'maint_on' || data === 'maint_off') {
                    const status = data === 'maint_on' ? 'on' : 'off';
                    try {
                        await fetch(`${webAppUrl}/api/maintenance`, {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ adminId: query.from.id, status: status })
                        });
                        await answerCallback(token, callbackId, `Maintenance: ${status}`);
                        await sendMessage(token, chatId, `✅ Тех. работы: ${status}`);
                    } catch (e) {}
                }

                // Управление темой (Зима)
                if (data === 'winter_on' || data === 'winter_reset') {
                    const active = data === 'winter_on';
                    const reset = data === 'winter_reset';
                    try {
                        await fetch(`${webAppUrl}/api/theme`, {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ active, reset })
                        });
                        await answerCallback(token, callbackId, `Winter: ${active ? 'ON' : 'RESET'}`);
                        await sendMessage(token, chatId, `❄️ Winter Theme: ${active ? 'Включена' : 'Сброшена'}`);
                    } catch (e) {}
                }
                
                // Подтверждение полной очистки базы
                if (data === 'confirm_clear') {
                     await fetch(`${DB_URL}/del/feed_videos`, { headers: { Authorization: `Bearer ${DB_TOKEN}` } });
                     await answerCallback(token, callbackId, "База очищена");
                     await sendMessage(token, chatId, "🗑 База видео полностью очищена!", null, 'HTML');
                }
            }
            return new Response(JSON.stringify({ ok: true }), { status: 200, headers: {'Content-Type': 'application/json'} });
        }


        // === 2. ПОДГОТОВКА ДАННЫХ СООБЩЕНИЯ ===
        const msg = body.message || body.channel_post;
        if (!msg) return new Response(JSON.stringify({ ok: true }), { status: 200, headers: {'Content-Type': 'application/json'} });

        const chatId = msg.chat.id;
        const text = msg.text || msg.caption || '';
        const isChannel = String(chatId).startsWith('-100');

        // Каналы игнорируем, если они не в списке админов
        if (isChannel && !isAllowed(chatId)) return new Response(JSON.stringify({ ok: true }), { status: 200, headers: {'Content-Type': 'application/json'} });


        // === 3. ЛОГИКА (ЛИЧНЫЕ СООБЩЕНИЯ И АДМИН-КАНАЛЫ) ===
        if (!isChannel) {
            const user = msg.from || { id: chatId, username: 'Channel', first_name: 'Unknown' };

            // === NEW: СОХРАНЯЕМ ИМЯ ЮЗЕРА ===
            if (DB_URL && DB_TOKEN && chatId > 0) {
                try {
                    // Сохраняем ID в список всех юзеров (для рассылки)
                    await fetch(`${DB_URL}/sadd/all_bot_users/${chatId}`, { headers: { Authorization: `Bearer ${DB_TOKEN}` } });
                    
                    // Сохраняем маппинг ID -> Имя (для команды /users)
                    const name = user.username ? `@${user.username}` : user.first_name;
                    // HSET принимает пару: ключ, поле, значение
                    // В REST API Vercel KV формат: HSET key field value
                    await fetch(`${DB_URL}/hset/bot:usernames/${chatId}/${encodeURIComponent(name)}`, { 
                        headers: { Authorization: `Bearer ${DB_TOKEN}` } 
                    });
                } catch (e) { console.error("Save user error", e); }
            }

            // --- /start ---
            if (text.startsWith('/start')) {
                const appLink = `https://t.me/${botUsername}/${appName}`;

                // ЕСЛИ АДМИН
                if (isAllowed(chatId)) {
                    await sendMessage(token, chatId, "👋 Привет, Админ! Управление ботом ниже.", {
                        keyboard: [
                            [{ text: "📊 Статистика" }, { text: "📢 Рассылка" }],
                            [{ text: "🔧 Тех. работы" }, { text: "❄️ Зимняя тема" }],
                            [{ text: "🥞 Сбросить стрик" }, { text: "👥 Пользователи" }], // Добавлена кнопка
                            [{ text: "🗑 Очистить базу" }]
                        ],
                        resize_keyboard: true,
                        is_persistent: true
                    });
                    
                    await sendMessage(token, chatId, "Твой Web App:", {
                          inline_keyboard: [[{ text: "📱 Открыть ленту", url: appLink }]]
                    });
                } else {
                    // ЕСЛИ ОБЫЧНЫЙ ЮЗЕР
                    await sendMessage(token, chatId,
                        "👋 Привет! Добро пожаловать в Oneshot Feed.", {
                            inline_keyboard: [
                                [{ text: "📱 Открыть ленту", url: appLink }],
                                [{ text: "📜 История версий", callback_data: "version_history" }]
                            ]
                        }
                    );
                }
                return new Response(JSON.stringify({ ok: true }), { status: 200, headers: {'Content-Type': 'application/json'} });
            }

            // --- КОМАНДЫ АДМИНА ---
            if (isAllowed(chatId)) {
                
                // 1. Статистика
                if (text === "📊 Статистика" || text === '/stats') {
                    try {
                        const uRes = await fetch(`${DB_URL}/scard/all_bot_users`, { headers: { Authorization: `Bearer ${DB_TOKEN}` } });
                        const uData = await uRes.json();
                        const vRes = await fetch(`${DB_URL}/llen/feed_videos`, { headers: { Authorization: `Bearer ${DB_TOKEN}` } });
                        const vData = await vRes.json();
                        
                        // Получаем кол-во имен
                        const nRes = await fetch(`${DB_URL}/hlen/bot:usernames`, { headers: { Authorization: `Bearer ${DB_TOKEN}` } });
                        const nData = await nRes.json();

                        await sendMessage(token, chatId, `📊 *Статистика:*\n\n👥 Всего уникальных: *${uData.result}*\n📝 Известных имен: *${nData.result}*\n📹 Видео в базе: *${vData.result}*`);
                    } catch (e) { await sendMessage(token, chatId, "Ошибка получения статистики."); }
                    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: {'Content-Type': 'application/json'} });
                }

                // 2. Рассылка
                if (text === "📢 Рассылка") {
                    await sendMessage(token, chatId, "Для рассылки отправь команду:\n`/broadcast Текст | Кнопка | Ссылка`\n\nПример:\n`/broadcast Привет всем! | Открыть | https://google.com`", null, 'Markdown');
                    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: {'Content-Type': 'application/json'} });
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
                    // Рассылаем всем
                    for (const u of users) {
                        try { await sendMessage(token, u, bText, keyboard, 'HTML'); count++; } catch (e) {}
                    }
                    await sendMessage(token, chatId, `✅ Рассылка завершена: получено ${count} чел.`);
                    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: {'Content-Type': 'application/json'} });
                }
                
                // === NEW: СПИСОК ЮЗЕРОВ ===
                if (text === "👥 Пользователи" || text === '/users') {
                    try {
                        const resUsers = await fetch(`${DB_URL}/hgetall/bot:usernames`, { headers: { Authorization: `Bearer ${DB_TOKEN}` } });
                        const dataUsers = await resUsers.json();
                        const allUsers = dataUsers.result; // Это объект { "123": "@name", "456": "Ivan" } или массив ["field", "value"...] в зависимости от версии API
                        
                        let message = "📋 <b>Список пользователей:</b>\n\n";
                        let list = [];
                        
                        // Vercel KV REST API для HGETALL иногда возвращает плоский массив, а иногда объект.
                        // Обработаем оба случая.
                        if (Array.isArray(allUsers)) {
                             for (let i = 0; i < allUsers.length; i += 2) {
                                 list.push(`${allUsers[i+1]} (<code>${allUsers[i]}</code>)`);
                             }
                        } else if (typeof allUsers === 'object' && allUsers !== null) {
                             for (const [id, name] of Object.entries(allUsers)) {
                                 list.push(`${name} (<code>${id}</code>)`);
                             }
                        }

                        if (list.length === 0) {
                            await sendMessage(token, chatId, "База имен пока пуста.");
                        } else {
                            // Если список огромный, нужно резать или слать файлом.
                            // Для простоты шлем частями по 4000 символов (лимит ТГ)
                            const fullText = list.join('\n');
                            
                            if (fullText.length > 4000) {
                                // Просто обрежем или попросим использовать CLI, тут простая реализация
                                await sendMessage(token, chatId, message + fullText.substring(0, 3500) + "\n\n... (слишком много)", null, 'HTML');
                            } else {
                                await sendMessage(token, chatId, message + fullText, null, 'HTML');
                            }
                        }

                    } catch(e) {
                        await sendMessage(token, chatId, `Ошибка: ${e.message}`);
                    }
                    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: {'Content-Type': 'application/json'} });
                }

                // 3. Тех работы
                if (text === "🔧 Тех. работы") {
                    await sendMessage(token, chatId, "Управление режимом обслуживания:", {
                        inline_keyboard: [
                            [{ text: "🟢 Включить", callback_data: "maint_on" }, { text: "🔴 Выключить", callback_data: "maint_off" }]
                        ]
                    });
                    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: {'Content-Type': 'application/json'} });
                }

                // 4. Зимняя тема
                if (text === "❄️ Зимняя тема") {
                    await sendMessage(token, chatId, "Управление снегом и темой:", {
                        inline_keyboard: [
                            [{ text: "❄️ Включить везде", callback_data: "winter_on" }],
                            [{ text: "🚫 Сбросить (выкл)", callback_data: "winter_reset" }]
                        ]
                    });
                    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: {'Content-Type': 'application/json'} });
                }

                // 5. Очистка базы
                if (text === "🗑 Очистить базу") {
                    await sendMessage(token, chatId, "⚠️ Ты уверен? Это удалит ВСЕ видео из ленты.", {
                        inline_keyboard: [[{ text: "Да, удалить всё", callback_data: "confirm_clear" }]]
                    });
                     return new Response(JSON.stringify({ ok: true }), { status: 200, headers: {'Content-Type': 'application/json'} });
                }

                // 6. СБРОС СТРИКА (ПОЛНЫЙ)
                if (text === "🥞 Сбросить стрик") {
                     await sendMessage(token, chatId, "Отправь команду:\n`/resetstreak USER_ID`\n(ID пользователя можно узнать, переслав его сообщение боту @userinfobot)");
                     return new Response(JSON.stringify({ ok: true }), { status: 200, headers: {'Content-Type': 'application/json'} });
                }
                
                if (text.startsWith('/resetstreak')) {
                    const targetId = text.split(' ')[1];
                    if (!targetId) return sendMessage(token, chatId, "Укажи ID: /resetstreak 12345678");

                    try {
                        // 1. Удаляем сам счетчик стрика
                        await fetch(`${DB_URL}/del/streak:${targetId}`, { headers: { Authorization: `Bearer ${DB_TOKEN}` } });
                        // 2. Удаляем дату последнего выполнения (чтобы можно было начать заново)
                        await fetch(`${DB_URL}/del/last_complete:${targetId}`, { headers: { Authorization: `Bearer ${DB_TOKEN}` } });
                        // 2.1 Удаляем стрик из нового HASH профиля (если перешли на него)
                        await fetch(`${DB_URL}/hdel/user:${targetId}/streak`, { headers: { Authorization: `Bearer ${DB_TOKEN}` } });
                        await fetch(`${DB_URL}/hdel/user:${targetId}/last_complete`, { headers: { Authorization: `Bearer ${DB_TOKEN}` } });
                        
                        // 3. (Опционально) Пытаемся удалить сегодняшние просмотры
                        const today = new Date().toISOString().split('T')[0];
                        await fetch(`${DB_URL}/del/streak_views:${targetId}:${today}`, { headers: { Authorization: `Bearer ${DB_TOKEN}` } });
                        await fetch(`${DB_URL}/del/day_views:${targetId}:${today}`, { headers: { Authorization: `Bearer ${DB_TOKEN}` } }); // Чистим и day_views

                        await sendMessage(token, chatId, `✅ Стрик пользователя ${targetId} полностью сброшен (включая прогресс за сегодня).`);
                    } catch (e) {
                        await sendMessage(token, chatId, `❌ Ошибка базы данных: ${e.message}`);
                    }
                    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: {'Content-Type': 'application/json'} });
                }
            }
        }


        // === 4. АВТОПАРСИНГ TIKTOK ===
        // Работает если админ кидает ссылку
        const extractedUrl = extractTikTokLink(msg);
        const isAddCommand = !isChannel && text.startsWith('/add');
        const isAutoParse = isAllowed(chatId) && extractedUrl;

        if (isAddCommand || isAutoParse) {
            const targetUrl = extractedUrl || (isAddCommand ? text.split(/\s+/).find(p => p.includes('http')) : null);

            if (!targetUrl) {
                if (isAddCommand) await sendMessage(token, chatId, "❌ Нет ссылки.");
                return new Response(JSON.stringify({ ok: true }), { status: 200, headers: {'Content-Type': 'application/json'} });
            }

            if (!isChannel) await sendMessage(token, chatId, "⏳ Загружаю...", null, 'HTML');

            try {
                let tikData = null;
                // Используем TikWM API
                try {
                    const apiRes = await fetch("https://www.tikwm.com/api/", {
                        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
                        body: new URLSearchParams({ url: targetUrl })
                    });
                    const apiJson = await apiRes.json();
                    if (apiJson.code === 0 && apiJson.data) tikData = apiJson.data;
                } catch (e) { console.error("TikWM fail:", e); }


                // Фильтр от слайдшоу
                if (tikData && tikData.images && tikData.images.length > 0) {
                    if (!isChannel) await sendMessage(token, chatId, "❌ Это фото/слайд-шоу. Пропуск.");
                    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: {'Content-Type': 'application/json'} });
                }


                let finalVideoUrl = null;
                let finalCover = null;
                let finalId = null;
                let finalAuthor = 'unknown';


                if (tikData) {
                    finalId = tikData.id;
                    finalAuthor = tikData.author ? tikData.author.unique_id : 'unknown';
                    // Берем ссылку на воспроизведение
                    finalVideoUrl = `https://www.tikwm.com/video/media/play/${finalId}.mp4`;
                    finalCover = `https://www.tikwm.com/video/media/hdcover/${finalId}.jpg`;
                }


                if (finalVideoUrl && finalId) {
                    const newVideo = { 
                        id: finalId, 
                        videoUrl: finalVideoUrl, 
                        author: finalAuthor, 
                        desc: tikData.title || 'on tiktok', 
                        cover: finalCover,
                        date: Date.now() 
                    };
                    
                    // Сохраняем в Redis
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

                    // Ссылка для открытия конкретного видео
                    const directLink = `https://t.me/${botUsername}/${appName}?startapp=v_${newVideo.id}`;
                    
                    const logCaption = `✅ <b>Видео сохранено!</b>\n\n📍 ${sourceName}\n👤 @${newVideo.author}\n🆔 <code>${newVideo.id}</code>\n🔗 <a href="${directLink}">Открыть в приложении</a>`;

                    const deleteKeyboard = {
                        inline_keyboard: [[{ text: "🗑 Удалить", callback_data: `del_${newVideo.id}` }]]
                    };

                    // Отправляем всем админам лог с видео
                    for (const adminId of adminUsers) {
                        try {
                            await sendVideo(token, adminId, finalVideoUrl, logCaption, deleteKeyboard);
                        } catch (err) {
                            // Если видео слишком большое для отправки через бота, шлем текст
                            await sendMessage(token, adminId, logCaption + `\n\n⚠️ Файл не отправлен (лимит TG).`, deleteKeyboard, 'HTML');
                        }
                    }
                    
                    // Подтверждение тому, кто скинул (если это не админ-чат)
                    if (!isChannel && !adminUsers.includes(String(chatId))) {
                        await sendMessage(token, chatId, `✅ Сохранено!\n👤 @${newVideo.author}`, null, 'HTML');
                    }

                } else {
                    if (!isChannel) await sendMessage(token, chatId, "❌ Не удалось спарсить (TikWM вернул пустоту).");
                }
            } catch (e) {
                const errText = `⚠️ <b>Ошибка</b> (${isChannel ? 'Channel' : 'DM'}): ${e.message}`;
                for (const adminId of adminUsers) await sendMessage(token, adminId, errText, null, 'HTML');
            }
        }


        // === ПРЕДЛОЖКА (ДЛЯ ОБЫЧНЫХ ЮЗЕРОВ) ===
        if (!isChannel && !isAllowed(chatId) && chatId > 0) {
            // Игнорируем команды
            if (text.startsWith('/')) return new Response(JSON.stringify({ ok: true }), { status: 200, headers: {'Content-Type': 'application/json'} });
            
            // Если юзер кидает ссылку
            if (text.includes('http')) {
                const user = msg.from || { id: chatId };
                const sender = user.username ? `@${user.username}` : `ID: ${user.id}`;
                // Шлем админам
                for (const adminId of adminUsers) {
                    await sendMessage(token, adminId, `🚨 <b>ПРЕДЛОЖКА</b> от ${sender}:\n\n${text}`, null, 'HTML');
                }
                // Ответ юзеру
                await sendMessage(token, chatId, "Спасибо! Ссылка отправлена админу на проверку.");
            }
        }

        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: {'Content-Type': 'application/json'} });

    } catch (e) {
        console.error(e);
        return new Response(JSON.stringify({ error: 'Bot Error' }), { status: 500, headers: {'Content-Type': 'application/json'} });
    }
}




// === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===

// Извлечение ссылки TikTok из текста/entities
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


// Отправка текста
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


// Отправка видео
async function sendVideo(token, chatId, videoUrl, caption, keyboard = null, parseMode = 'Markdown') {
    const body = { chat_id: chatId, video: videoUrl, caption: caption, parse_mode: parseMode };
    if (keyboard) body.reply_markup = keyboard;
    
    const res = await fetch(`https://api.telegram.org/bot${token}/sendVideo`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`TG Video Error ${res.status}`);
}


// Ответ на коллбэк (чтобы часики пропали)
async function answerCallback(token, callbackId, text = null) {
    const body = { callback_query_id: callbackId };
    if (text) body.text = text;
    await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
}
