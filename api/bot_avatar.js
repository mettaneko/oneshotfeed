let cachedFileId = null;
let cachedImageBase64 = null;
let cachedContentType = 'image/jpeg';

export default async function handler(req, res) {
  const token = process.env.BOT_TOKEN;

  if (!token) {
    return res.status(500).json({ error: 'BOT_TOKEN is not defined in environment variables' });
  }

  try {
    const meRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const meData = await meRes.json();
    if (!meData.ok) {
      return res.status(500).json({ error: 'Failed to fetch bot info', details: meData });
    }
    const botId = meData.result.id;

    const chatRes = await fetch(`https://api.telegram.org/bot${token}/getChat?chat_id=${botId}`);
    const chatData = await chatRes.json();

    const photo = chatData.result?.photo;
    if (!photo) {
      return res.status(404).json({ error: 'Bot avatar not found' });
    }

    const currentFileId = photo.big_file_id;

    if (cachedFileId === currentFileId && cachedImageBase64) {
      res.setHeader('Content-Type', cachedContentType);
      res.setHeader('Content-Disposition', 'inline');
      res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=43200');
      return res.status(200).send(Buffer.from(cachedImageBase64, 'base64'));
    }

    const fileRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${currentFileId}`);
    const fileData = await fileRes.json();
    const filePath = fileData.result?.file_path;

    if (!filePath) {
      return res.status(404).json({ error: 'File path not found' });
    }

    const imgRes = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
    const arrayBuffer = await imgRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = imgRes.headers.get('content-type') || 'image/jpeg';

    cachedFileId = currentFileId;
    cachedImageBase64 = buffer.toString('base64');
    cachedContentType = contentType;

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=43200');
    return res.status(200).send(buffer);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
