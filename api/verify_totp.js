import { authenticator } from 'otplib';
import crypto from 'crypto';
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  const { code } = req.body || {};
  if (!/^\d{6}$/.test(String(code || ''))) return res.status(400).json({ error: 'TOTP code is required' });
  const secret = process.env.TOTP_SECRET;
  if (!secret) return res.status(500).json({ error: 'TOTP secret not configured' });
  if (!authenticator.verify({ token: String(code), secret, window: 1 })) return res.status(401).json({ error: 'Invalid code' });
  const payload = `${Date.now()}.${crypto.randomBytes(16).toString('hex')}`;
  const signature = crypto.createHmac('sha256', process.env.TOTP_SESSION_SECRET || secret).update(payload).digest('hex');
  return res.status(200).json({ success: true, token: Buffer.from(`${payload}.${signature}`).toString('base64url') });
}
