// api/stream.js

export default async function handler(req, res) {
    const { file_id } = req.query;
    const token = process.env.BOT_TOKEN;

    if (!file_id || !token) {
        return res.status(400).send('Missing file_id or BOT_TOKEN');
    }

    try {
        const fileRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${file_id}`);
        const fileData = await fileRes.json();

        if (!fileData.ok || !fileData.result.file_path) {
            return res.status(404).send('File not found in Telegram');
        }

        const tgFileUrl = `https://api.telegram.org/file/bot${token}/${fileData.result.file_path}`;

        const videoStream = await fetch(tgFileUrl);
        res.setHeader('Content-Type', videoStream.headers.get('content-type') || 'video/mp4');
        res.setHeader('Cache-Control', 'public, max-age=86400');

        const arrayBuffer = await videoStream.arrayBuffer();
        return res.status(200).send(Buffer.from(arrayBuffer));
    } catch (e) {
        return res.status(500).send(e.message);
    }
}
