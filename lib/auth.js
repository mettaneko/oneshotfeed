import crypto from 'crypto';

export function getInitData(req, body = {}) {
  const headerValue = typeof req.headers?.get === 'function'
    ? req.headers.get('x-telegram-init-data')
    : req.headers?.['x-telegram-init-data'];
  return headerValue || body.initData || body.telegramInitData || '';
}

export function validateTelegramInitData(initData, maxAge = 86400) {
  if (!initData || !process.env.BOT_TOKEN) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  const authDate = Number(params.get('auth_date'));
  const now = Date.now() / 1000;
  if (!hash || !authDate || now - authDate > maxAge || authDate > now + 30) return null;
  params.delete('hash');
  const dataCheckString = [...params.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(process.env.BOT_TOKEN).digest();
  const expected = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
  const provided = Buffer.from(hash);
  const actual = Buffer.from(expected);
  if (provided.length !== actual.length || !crypto.timingSafeEqual(provided, actual)) return null;
  try { return JSON.parse(params.get('user') || 'null'); } catch { return null; }
}

export function requireTelegramUser(req, body = {}) {
  return validateTelegramInitData(getInitData(req, body));
}

export function adminIds() {
  return (process.env.ADMIN_ID || '').split(',').map(id => id.trim()).filter(Boolean);
}

export function isAdmin(user) {
  return !!user && (adminIds().includes(String(user.id)) || String(user.id) === String(process.env.OWNER_ID || ''));
}
export function validBotSecret(req) {
  const configured = process.env.WEBHOOK_SECRET || process.env.BOT_TOKEN;
  const headerValue = typeof req.headers?.get === 'function'
    ? req.headers.get('x-bot-secret')
    : req.headers?.['x-bot-secret'];
  return !!configured && headerValue === configured;
}

export function validMaintenanceToken(token) {
  if (!token) return false;
  try {
    const decoded = Buffer.from(token, 'base64url').toString();
    const parts = decoded.split('.');
    if (parts.length !== 3) return false;
    const [timestamp, nonce, signature] = parts;
    const issuedAt = Number(timestamp);
    if (!Number.isFinite(issuedAt) || Date.now() - issuedAt > 5 * 60 * 1000 || issuedAt > Date.now() + 30_000) return false;
    const expected = crypto.createHmac('sha256', process.env.TOTP_SESSION_SECRET || process.env.TOTP_SECRET || '')
      .update(`${timestamp}.${nonce}`).digest('hex');
    const provided = Buffer.from(signature);
    const actual = Buffer.from(expected);
    return provided.length === actual.length && crypto.timingSafeEqual(provided, actual);
  } catch {
    return false;
  }
}

export function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}
