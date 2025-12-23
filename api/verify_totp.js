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

    const { token } = req.body;
    if (!token) {
        return res.status(400).json({ error: 'TOTP token is required' });
    }

    try {
        // Получаем секрет напрямую из переменных окружения Vercel
        const secret = process.env.TOTP_SECRET;

        if (!secret) {
            console.error('TOTP_SECRET is not set in environment variables.');
            return res.status(500).json({ error: 'TOTP secret not configured on the server.' });
        }

        // Проверяем валидность кода
        const isValid = authenticator.verify({ token, secret });

        if (isValid) {
            // Код верный. Генерируем временный пропуск на 5 минут.
            const accessPass = {
                grantedAt: Date.now(),
                expiresIn: 5 * 60 * 1000 // 5 минут
            };
            return res.status(200).json({ success: true, pass: accessPass });
        } else {
            return res.status(401).json({ success: false, error: 'Неверный код доступа.' });
        }
    } catch (e) {
        console.error('TOTP Verification Error:', e);
        return res.status(500).json({ error: 'Server error during verification.' });
    }
}
