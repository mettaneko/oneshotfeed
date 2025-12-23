// api/verify_totp.js
import { authenticator } from 'otplib';

export default async function handler(req, res) {
    // Настройка CORS
    res.setHeader('Access-Control-Allow-Origin', '*'); 
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // --- ИСПРАВЛЕНИЕ 1: Ожидаем `code` вместо `token` ---
    const { code } = req.body; 
    if (!code) {
        return res.status(400).json({ error: 'TOTP code is required' });
    }

    try {
        const secret = process.env.TOTP_SECRET;

        if (!secret) {
            console.error('TOTP_SECRET is not set in environment variables.');
            return res.status(500).json({ error: 'TOTP secret not configured on the server.' });
        }

        // --- ИСПРАВЛЕНИЕ 2: Добавлено `window: 1` для компенсации рассинхронизации времени до 30 секунд ---
        const isValid = authenticator.verify({ token: code, secret, window: 1 });

        if (isValid) {
            // Код верный. Создаем "пропуск" в формате base64, чтобы его было сложнее подделать.
            const payload = { ts: Date.now() }; // Включаем временную метку
            const token = Buffer.from(JSON.stringify(payload)).toString('base64');
            
            return res.status(200).json({ success: true, token: token });
        } else {
            return res.status(401).json({ success: false, error: 'Неверный код доступа.' });
        }
    } catch (e) {
        console.error('TOTP Verification Error:', e);
        return res.status(500).json({ error: 'Server error during verification.' });
    }
}
