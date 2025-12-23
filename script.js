const tg = window.Telegram.WebApp;
tg.expand();
tg.setHeaderColor('#000000');

const container = document.getElementById('feed-container');

// Настройки Lazy Loading
let currentPage = 0;
let isLoading = false;
let hasMore = true; // Есть ли еще видео в базе?

// 1. Функция загрузки партии видео
async function loadMoreVideos() {
    if (isLoading || !hasMore) return;
    
    isLoading = true;
    showLoader(true); // Показать индикатор загрузки внизу

    try {
        // Запрос к твоему API
        const res = await fetch(`/api/get_feed?page=${currentPage}`);
        const newVideos = await res.json();

        if (newVideos.length === 0) {
            hasMore = false; // Видео кончились
            showLoader(false);
            return;
        }

        // Добавляем видео в ленту
        newVideos.forEach(videoData => {
            const card = createCard(videoData);
            container.appendChild(card);
            
            // Сразу начинаем следить за новым видео (для автоплея)
            videoObserver.observe(card);
        });

        // Двигаем "триггер загрузки" в самый низ
        updateLoadingTrigger();
        
        currentPage++; // Готовимся к следующей странице

    } catch (e) {
        console.error("Ошибка загрузки:", e);
        // Можно показать тост с ошибкой
    } finally {
        isLoading = false;
        showLoader(false);
    }
}

// 2. Создание карточки (HTML)
function createCard(data) {
    const div = document.createElement('div');
    div.className = 'video-card';
    // data.videoUrl и data.cover - подставь поля, как у тебя в БД
    div.innerHTML = `
        <video loop playsinline poster="${data.cover || ''}" preload="metadata">
            <source src="${data.videoUrl || data.url}" type="video/mp4">
        </video>
        <div class="video-ui">
            <div class="video-info">
                <div class="author">${data.author || 'Anon'}</div>
                <div class="desc">${data.desc || ''}</div>
            </div>
        </div>
    `;

    // Пауза/Плей по клику
    const vid = div.querySelector('video');
    div.addEventListener('click', () => {
        if (vid.paused) vid.play();
        else vid.pause();
    });

    return div;
}

// 3. Автоплей (Intersection Observer)
const videoObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        const vid = entry.target.querySelector('video');
        if (!vid) return;

        if (entry.isIntersecting) {
            vid.currentTime = 0;
            vid.play().catch(() => {
                vid.muted = true;
                vid.play();
            });
        } else {
            vid.pause();
        }
    });
}, { threshold: 0.6 });

// 4. Lazy Load Триггер (Intersection Observer)
// Следит за невидимым элементом в конце списка. Как только он появляется — грузим еще.
const loadingTrigger = document.createElement('div');
loadingTrigger.className = 'loading-trigger';
loadingTrigger.style.height = '10px'; // Невидимый порог
container.appendChild(loadingTrigger);

const lazyLoader = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) {
        loadMoreVideos();
    }
}, { rootMargin: '200px' }); // Начинать грузить за 200px до конца

function updateLoadingTrigger() {
    // Перемещаем триггер в самый конец контейнера
    container.appendChild(loadingTrigger);
    lazyLoader.disconnect();
    lazyLoader.observe(loadingTrigger);
}

// UI: Индикатор загрузки
function showLoader(show) {
    let loader = document.getElementById('batch-loader');
    if (!loader) {
        loader = document.createElement('div');
        loader.id = 'batch-loader';
        loader.className = 'loading-state small';
        loader.innerHTML = '<span class="blink">_loading_data</span>';
        loader.style.cssText = 'height: 50px; font-size: 16px; padding-bottom: 20px;';
        // Не добавляем в container, он сам рисуется
    }
    
    if (show) container.appendChild(loader);
    else if (loader.parentNode) loader.remove();
}

// Часы
setInterval(() => {
    const d = new Date();
    document.getElementById('clock').innerText = 
        `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}, 1000);

// Старт
loadMoreVideos();
