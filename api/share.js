export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).end();
    return;
  }

  const { videoUrl, author, desc, user } = req.body || {};
  const BOT_TOKEN = process.env.BOT_TOKEN;

  if (!BOT_TOKEN || !user?.id) {
    res.status(500).json({ ok: false, error: 'No bot token or user id' });
    return;
  }

  const text =
    '📹 Видео из фида:\n' +
    `Автор: @${author}\n` +
    `URL: ${videoUrl}\n` +
    (desc ? `Описание: ${desc}` : '');

  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: user.id, text })
  });

  res.status(200).json({ ok: true });
}
