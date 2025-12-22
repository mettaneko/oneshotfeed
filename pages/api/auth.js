import crypto from 'crypto';

export default function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const { code } = req.body;
    const secret = process.env.TOTP_SECRET; 

    if (!secret) return res.status(500).json({ error: 'Server config error' });
    if (!code) return res.status(400).json({ error: 'Code required' });

    if (verifyTOTP(code, secret)) {
        return res.status(200).json({ token: 'access_granted_by_2fa_' + Date.now() });
    } else {
        return res.status(401).json({ error: 'Invalid code' });
    }
}

function verifyTOTP(token, secret) {
    const step = 30;
    const now = Math.floor(Date.now() / 1000);
    const timeStep = Math.floor(now / step);

    for (let i = -1; i <= 1; i++) {
        if (generateHOTP(secret, timeStep + i) === token) return true;
    }
    return false;
}

function generateHOTP(secret, counter) {
    const key = base32tohex(secret); 
    const buf = Buffer.alloc(8);
    for (let i = 7; i >= 0; i--) {
        buf[i] = counter & 0xff;
        counter = counter >>> 8;
    }
    const hmac = crypto.createHmac('sha1', Buffer.from(key, 'hex'));
    hmac.update(buf);
    const digest = hmac.digest();
    const offset = digest[digest.length - 1] & 0xf;
    const binary = ((digest[offset] & 0x7f) << 24) | ((digest[offset + 1] & 0xff) << 16) | ((digest[offset + 2] & 0xff) << 8) | (digest[offset + 3] & 0xff);
    return (binary % 1000000).toString().padStart(6, '0');
}

function base32tohex(base32) {
    const base32chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let bits = "";
    let hex = "";
    const cleanSecret = base32.replace(/\s/g, '').toUpperCase();
    for (let i = 0; i < cleanSecret.length; i++) {
        const val = base32chars.indexOf(cleanSecret.charAt(i));
        if (val === -1) continue;
        bits += val.toString(2).padStart(5, '0');
    }
    for (let i = 0; i + 4 <= bits.length; i += 4) {
        const chunk = bits.substr(i, 4);
        hex = hex + parseInt(chunk, 2).toString(16);
    }
    return hex;
}
