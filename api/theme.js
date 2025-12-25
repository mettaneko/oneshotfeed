// api/theme.js
const fs = require('fs');
const path = require('path');

const themeFile = path.join('/tmp', 'theme_config.json'); // Используем /tmp для Vercel/Serverless

// Дефолтное состояние
const defaultState = { isWinter: false, version: 1 };

function getTheme() {
    if (!fs.existsSync(themeFile)) return defaultState;
    try {
        return JSON.parse(fs.readFileSync(themeFile, 'utf8'));
    } catch { return defaultState; }
}

function setTheme(newState) {
    fs.writeFileSync(themeFile, JSON.stringify(newState));
}

module.exports = (req, res) => {
    if (req.method === 'GET') {
        res.status(200).json(getTheme());
    } else if (req.method === 'POST') {
        // В реальном проекте тут нужна проверка админ-токена!
        const { active, reset } = req.body;
        let current = getTheme();
        
        current.isWinter = active;
        if (reset) current.version += 1;
        
        setTheme(current);
        res.status(200).json({ success: true, state: current });
    } else {
        res.status(405).send('Method Not Allowed');
    }
};
