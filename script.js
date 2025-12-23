// Инициализация Telegram
const tg = window.Telegram.WebApp;
tg.expand(); 
tg.setHeaderColor('#000000');

const container = document.getElementById('feed-container');

// 1. Имитация данных (потом заменим на fetch к твоему Redis API)
const TEST_VIDEOS = [
    {
        id: '1',
        url: 'https://www.w3schools.com/html/mov_bbb.mp4', 
        author: 'Prophetbot', 
        desc: 'Архивные данные из пустошей...'
    },
    {
        id: '2',
        url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.webm', 
        author: 'Alula', 
        desc: 'Смотрите, что я нашла в руинах!'
    }
];

// 2. Функция загрузки
async function initFeed() {
    try {
        // В будущем тут будет:
        // const res = await fetch('/api/get_feed');
        // const videos = await res.json();
        const videos = TEST_VIDEOS; 

        // Очищаем лоадер
        container.innerHTML = '';
        
        videos.forEach(videoData => {
            const card = createCard(videoData);
            container.appendChild(card);
        });

        // Запускаем наблюдатель за скроллом
        startObserver();

    } catch (e) {
        container.innerHTML = `<div class="loading-state" style="color:red">ERROR: ${e.message}</div>`;
    }
}

// 3. Создание карточки HTML
function createCard(data) {
    const div = document.createElement('div');
    div.className = 'video-card';
    div.innerHTML = `
        <video loop playsinline poster="">
            <source src="${data.url}" type="video/mp4">
        </video>
        <div class="video-ui">
            <div class="video-info">
                <div class="author">${data.author}</div>
                <div class="desc">${data.desc}</div>
            </div>
        </div>
    `;

    // Пауза по клику
    const vid = div.querySelector('video');
    div.addEventListener('click', () => {
        if (vid.paused) vid.play(); 
        else vid.pause();
    });

    return div;
}

// 4. Логика "TikTok-скролла" (Play/Pause)
function startObserver() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const vid = entry.target.querySelector('video');
            if (!vid) return;

            if (entry.isIntersecting) {
                // Видео в кадре -> Играть
                vid.currentTime = 0; // Начинать сначала
                vid.play().catch(() => {
                    // Если звук запрещен браузером -> Мьют и играть
                    vid.muted = true;
                    vid.play();
                });
            } else {
                // Видео ушло -> Пауза
                vid.pause();
            }
        });
    }, { threshold: 0.6 }); // Срабатывает, когда видно 60% карточки

    document.querySelectorAll('.video-card').forEach(card => observer.observe(card));
}

// Часики для атмосферы
setInterval(() => {
    const d = new Date();
    document.getElementById('clock').innerText = 
        `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}, 1000);

// Запуск
initFeed();
