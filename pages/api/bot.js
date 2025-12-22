export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(200).send('OK');

    const body = req.body;
    const token = process.env.BOT_TOKEN;
    const adminIds = (process.env.ADMIN_ID || '').split(',');
    const isAdmin = (id) => adminIds.includes(id.toString());
    const DB_URL = process.env.KV_REST_API_URL;
    const DB_TOKEN = process.env.KV_REST_API_TOKEN;

    // === CALLBACKS (Твои старые кнопки) ===
    if (body.callback_query) {
        // Тут твой старый код обработки version_history
        // Для краткости пишу заглушку, но ты оставь свой код
        await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({callback_query_id: body.callback_query.id})
        });
        return res.status(200).json({ok: true});
    }

    const msg = body.message || body.channel_post;
    if (msg) {
      const chatId = msg.chat.id;
      const text = msg.text || msg.caption || '';
      
      // === MAINTENANCE COMMAND ===
      if (text.startsWith('/maintenance') && isAdmin(chatId)) {
         const parts = text.split(' ');
         const mode = parts[1]; // on или off
         if (mode === 'on') {
             await fetch(`${DB_URL}/set/maintenance_mode/true`, { headers: { Authorization: `Bearer ${DB_TOKEN}` } });
             await sendMessage(token, chatId, "🚧 Техработы ВКЛЮЧЕНЫ.");
         } else {
             await fetch(`${DB_URL}/set/maintenance_mode/false`, { headers: { Authorization: `Bearer ${DB_TOKEN}` } });
             await sendMessage(token, chatId, "✅ Техработы ВЫКЛЮЧЕНЫ.");
         }
         return res.status(200).json({ ok: true });
      }

      // === ADD VIDEO (С фиксом ссылок) ===
      if (text.startsWith('/add') && isAdmin(chatId)) {
           // ... (Твой код получения tikTokUrl) ...
           const parts = text.split(/\s+/);
           let tikTokUrl = parts.find(p => p.includes('http'));
           if (tikTokUrl) {
                await sendMessage(token, chatId, "⏳ Загружаю...");
                
                // 1. TikWM
                let tikData = null;
                try {
                    const r = await fetch(`https://www.tikwm.com/api/?url=${tikTokUrl}`);
                    const j = await r.json();
                    if(j.code === 0) tikData = j.data;
                } catch(e){}

                // 2. Cobalt
                let cobaltUrl = await getCobaltLink(tikTokUrl);

                // СБОРКА
                let finalVideoUrl = null;
                let finalCover = null;
                let finalAuthor = 'unknown';

                // ПРИОРИТЕТ 1: TikWM (Живет дольше)
                if (tikData) {
                    finalVideoUrl = tikData.play; // Ссылка-прокси
                    finalCover = tikData.cover;
                    finalAuthor = tikData.author ? tikData.author.unique_id : 'unknown';
                } 
                // ПРИОРИТЕТ 2: Cobalt (Если TikWM упал)
                else if (cobaltUrl) {
                    finalVideoUrl = cobaltUrl;
                    finalAuthor = 'CobaltUser';
                }

                if (finalVideoUrl) {
                    // Фикс ссылки TikWM
                    if (!finalVideoUrl.startsWith('http')) finalVideoUrl = `https://www.tikwm.com${finalVideoUrl}`;
                    
                    const newVideo = {
                        id: Date.now().toString(),
                        videoUrl: finalVideoUrl,
                        author: finalAuthor,
                        desc: 'Added via bot',
                        cover: finalCover
                    };
                    
                    await fetch(`${DB_URL}/`, {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${DB_TOKEN}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify(["RPUSH", "feed_videos", JSON.stringify(newVideo)])
                    });
                    await sendMessage(token, chatId, `✅ Добавлено!\n@${finalAuthor}`);
                } else {
                    await sendMessage(token, chatId, "❌ Не удалось скачать.");
                }
           }
      }
      
      // Оставь /clear, /start, /broadcast как были
    }
    res.status(200).json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Bot Error' }); }
}

// Функции помощники
async function getCobaltLink(url) {
    try {
        const response = await fetch("https://api.cobalt.tools/api/json", {
            method: "POST",
            headers: { "Accept": "application/json", "Content-Type": "application/json" },
            body: JSON.stringify({ url: url, vCodec: "h264", vQuality: "720" })
        });
        const data = await response.json();
        return data.url || null;
    } catch (e) { return null; }
}

async function sendMessage(token, chatId, text) {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text })
    });
}
