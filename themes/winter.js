// themes/winter.js

(function() {
    // 1. СТИЛИ (CSS)
    const styleId = 'winter-theme-style';
    const cssContent = `
        /* css/winter.css INJECTED */
        :root {
            --bg-color: #0f1218;
            --accent-color: #a0d8ef; 
        }

        /* Контейнер для снега */
        #snow-container {
            position: fixed;
            top: 0; left: 0; width: 100%; height: 100%;
            pointer-events: none;
            /* Z-INDEX: 50 (Выше плеера, но ниже UI, у которого 100) */
            z-index: 50; 
            overflow: hidden;
        }

        .snowflake {
            position: absolute;
            top: -30px;
            color: white;
            user-select: none;
            pointer-events: none;
            will-change: transform;
            animation-name: fall;
            animation-timing-function: linear;
            animation-iteration-count: infinite;
        }

        @keyframes fall {
            0% { transform: translateY(0) rotate(0deg); opacity: 0; }
            10% { opacity: 0.8; }
            100% { transform: translateY(110vh) rotate(360deg); opacity: 0.2; }
        }
    `;

    // 2. ГЕНЕРАТОР СНЕГА
    let snowInterval;

    function startSnowfall() {
        let container = document.getElementById('snow-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'snow-container';
            document.body.appendChild(container);
        }

        if (snowInterval) clearInterval(snowInterval);

        const symbols = ['❄', '❅', '❆', '•']; 

        snowInterval = setInterval(() => {
            if (!document.getElementById('snow-container')) return;

            const flake = document.createElement('div');
            flake.className = 'snowflake';
            flake.innerText = symbols[Math.floor(Math.random() * symbols.length)];
            
            // Рандом: маленькие снежинки
            const left = Math.random() * 100; 
            const size = Math.random() * 0.8 + 0.4; // 0.4em - 1.2em
            const duration = Math.random() * 10 + 5; // 5s - 15s
            const opacity = Math.random() * 0.6 + 0.2; 

            flake.style.left = left + '%';
            flake.style.fontSize = size + 'em';
            flake.style.opacity = opacity;
            flake.style.animationDuration = duration + 's';
            
            container.appendChild(flake);

            setTimeout(() => { flake.remove(); }, duration * 1000);
        }, 300);
    }

    function stopSnowfall() {
        if (snowInterval) clearInterval(snowInterval);
        const container = document.getElementById('snow-container');
        if (container) container.remove();
    }

    // 3. ЭКСПОРТ (Глобальный объект)
    window.WinterTheme = {
        enable: () => {
            // Добавляем CSS
            if (!document.getElementById(styleId)) {
                const style = document.createElement('style');
                style.id = styleId;
                style.textContent = cssContent;
                document.head.appendChild(style);
            }
            startSnowfall();
        },
        disable: () => {
            // Удаляем CSS
            const style = document.getElementById(styleId);
            if (style) style.remove();
            stopSnowfall();
        }
    };
})();
