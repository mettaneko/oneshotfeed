// bot.js

export default async function handler(req, res) {
    try {
        if (req.method !== 'POST') return res.status(200).send('OK');

        const body = req.body;
        const token = process.env.BOT_TOKEN;

        // === КОНФИГУРАЦИЯ ===
        const adminIds = (process.env.ADMIN_ID || '').split(',');
        const isAdmin = (id) => adminIds.includes(String(id));
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


        // === 2. ОБРАБОТКА СООБЩЕНИЙ ===
        const msg = body.message || body.channel_post;
        if (!msg) return res.status(200).json({ ok: true });

        const chatId = msg.chat.id;
        const text = msg.text || msg.caption || '';
        const user = msg.from || { id: chatId, username: 'Channel' };

        if (DB_URL && DB_TOKEN && chatId > 0) {
            try {
                await fetch(`${DB_URL}/sadd/all_bot_users/${chatId}`, {
                    headers: { Authorization: `Bearer ${DB_TOKEN}` }
                });
            } catch (e) {
                console.error("User save error:", e);
            }
        }

        if (text === '/start') {
            await sendMessage(token, chatId,
                "👋 Привет! Добро пожаловать в Oneshot Feed.\nСмотри, предлагай видео или просто читай обновления!", {
                    inline_keyboard: [
                        [{ text: "📱 Открыть", web_app: { url: webAppUrl } }],
                        [{ text: "📜 История", callback_data: "version_history" }]
                    ]
                }
            );
        }

        else if (isAdmin(chatId)) {
            
            // --- УПРАВЛЕНИЕ ТЕХ. РАБОТАМИ ---
            const maintenanceMatch = /\/maintenance (on|off)/.exec(text);
            if (maintenanceMatch) {
                const status = maintenanceMatch[1];
    
                try {
                    const response = await fetch(`${webAppUrl}/api/maintenance`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ adminId: user.id, status: status })
                    });
            
                    if (response.ok) {
                        const newStatusText = status === 'on' ? '🟢 ВКЛЮЧЕН' : '🔴 ВЫКЛЮЧЕН';
                        await sendMessage(token, chatId, `✅ Режим технических работ успешно ${newStatusText}.`);
                    } else {
                        const errorData = await response.json().catch(() => ({ error: "Non-JSON error response" }));
                        throw new Error(`API Error (HTTP ${response.status}): ${errorData.error || 'Unknown error'}`);
                    }
                } catch (error) {
                    console.error('Failed to set maintenance mode:', error);
                    await sendMessage(token, chatId, `❌ Ошибка: ${error.message}`);
                }
            }


            // --- УПРАВЛЕНИЕ ЗИМНЕЙ ТЕМОЙ (НОВАЯ ФИШКА) ---
            const winterMatch = /\/winter (on|off|reset)/.exec(text);
            if (winterMatch) {
                const action = winterMatch[1]; // 'on', 'off', 'reset'
                let active = false;
                let reset = false;

                if (action === 'on') { active = true; }
                else if (action === 'reset') { active = true; reset = true; }
                // если 'off', active остается false

                try {
                    const response = await fetch(`${webAppUrl}/api/theme`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ active, reset })
                    });

                    if (response.ok) {
                        let reply = '';
                        if (action === 'on') reply = '❄️ Зимняя тема включена!';
                        else if (action === 'off') reply = '🚫 Зимняя тема выключена.';
                        else reply = '🔄 Тема сброшена (баннер появится у всех).';
                        
                        await sendMessage(token, chatId, reply);
                    } else {
                          await sendMessage(token, chatId, `❌ Ошибка API темы: ${response.status}`);
                    }
                } catch (error) {
                    await sendMessage(token, chatId, `❌ Ошибка сети: ${error.message}`);
                }
            }


            else if (text.startsWith('/add')) {
                const parts = text.split(/\s+/);
                let tikTokUrl = parts.find(p => p.includes('http'));

                if (!tikTokUrl) {
                    await sendMessage(token, chatId, "❌ Нет ссылки.\nПример: /add [https://vm.tiktok.com/](https://vm.tiktok.com/)...", null, 'HTML');
                } else {
                    await sendMessage(token, chatId, "⏳ Загружаю (TikWM)...", null, 'HTML');
                    try {
                        let finalVideoUrl = null;
                        let finalCover = null;
                        let finalAuthor = 'unknown';
                        let finalId = null;

                        let tikData = null;
                        
                        // 1. Запрос к TikWM (через POST)
                        try {
                            const apiRes = await fetch("https://www.tikwm.com/api/", {
                                method: "POST",
                                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                                body: new URLSearchParams({ url: tikTokUrl })
                            });
                            const apiJson = await apiRes.json();
                            if (apiJson.code === 0 && apiJson.data) tikData = apiJson.data;
                        } catch (e) { console.error("TikWM fail:", e); }

                        // 2. Если есть данные, формируем ВЕЧНУЮ ссылку вручную
                        if (tikData) {
                            finalId = tikData.id;
                            finalAuthor = tikData.author ? tikData.author.unique_id : 'unknown';
                            
                            // Формируем ссылки на прокси TikWM, которые не протухают
                            finalVideoUrl = `https://www.tikwm.com/video/media/play/${finalId}.mp4`;
                            finalCover = `https://www.tikwm.com/video/media/hdcover/${finalId}.jpg`;
                            
                            if (tikData.images && tikData.images.length > 0) {
                                await sendMessage(token, chatId, "❌ Это слайд-шоу! Отмена.");
                                return res.status(200).json({ ok: true });
                            }
                        } 
                        // 3. Если TikWM не сработал, пробуем Cobalt (как резерв)
                        else {
                            const cobaltUrl = await getCobaltLink(tikTokUrl);
                            if (cobaltUrl) {
                                finalVideoUrl = cobaltUrl;
                                finalId = extractIdFromUrl(tikTokUrl) || Date.now().toString();
                                finalAuthor = 'cobalt_user';
                                finalCover = 'https://via.placeholder.com/150?text=No+Cover';
                            }
                        }

                        if (finalVideoUrl) {
                            const newVideo = { 
                                id: finalId, 
                                videoUrl: finalVideoUrl, 
                                author: finalAuthor, 
                                desc: tikData?.title || 'on tiktok', 
                                cover: finalCover,
                                date: Date.now() // Добавляем дату для сортировки
                            };
                            
                            await fetch(`${DB_URL}/`, {
                                method: 'POST',
                                headers: { Authorization: `Bearer ${DB_TOKEN}`, 'Content-Type': 'application/json' },
                                body: JSON.stringify(["RPUSH", "feed_videos", JSON.stringify(newVideo)])
                            });
                            
                            const sourceInfo = tikData ? "TikWM Proxy (Вечная)" : "Cobalt (Резерв)";
                            await sendMessage(token, chatId, `✅ Сохранено [${sourceInfo}]!\n👤 @${newVideo.author}\n🔗 Видео`, null, 'HTML');
                        } else {
                            await sendMessage(token, chatId, "❌ Ошибка!\nНе удалось скачать видео ни через TikWM, ни через Cobalt.");
                        }
                    } catch (e) {
                        await sendMessage(token, chatId, "❌ Ошибка скрипта: " + e.message);
                    }
                }
            }


            else if (text === '/clear') {
                await fetch(`${DB_URL}/del/feed_videos`, {
                    headers: { Authorization: `Bearer ${DB_TOKEN}` }
                });
                await sendMessage(token, chatId, "🗑 База очищена!", null, 'HTML');
            }


            else if (text.startsWith('/broadcast')) {
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
                    try {
                        await sendMessage(token, u, `📢 Новости:\n${bText}`, null, 'HTML');
                        count++;
                    } catch (e) {}
                }
                await sendMessage(token, chatId, `Рассылка: ${count} чел.`);
            }
        }


        else if (!isAdmin(chatId) && chatId > 0) {
            if (text.startsWith('/add') || text.startsWith('/clear')) {
                return res.status(200).json({ ok: true });
            }
            if (text.includes('http')) {
                const sender = user.username ? `@${user.username}` : `ID: ${user.id}`;
                for (const admin of adminIds) {
                    await sendMessage(token, admin, `🚨 ПРЕДЛОЖКА ОТ ${sender}:\n${text}`, null, 'HTML');
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
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
}
