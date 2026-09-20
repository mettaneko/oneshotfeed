import { upstash } from '../lib/upstash.js';
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  try {
    const result = await upstash('lrange/feed_videos/0/-1');
    const videos = (Array.isArray(result) ? result : []).map(item => {
      try { return typeof item === 'string' ? JSON.parse(item) : item; } catch { return null; }
    }).filter(v => v && !v.deleted && v.videoUrl);
    const unique = [...new Map(videos.map(v => [String(v.id), v])).values()];
    return res.status(200).json(unique);
  } catch (e) { return res.status(502).json({ error: 'Feed unavailable' }); }
}
