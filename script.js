// ==========================================
// 1. ИНИЦИАЛИЗАЦИЯ TELEGRAM WEB APP
// ==========================================
const tg = window.Telegram.WebApp;

// Сообщаем, что приложение готово
tg.ready();
tg.expand();

// Безопасная установка цвета хедера (защита от старых версий)
try {
    const version = parseFloat(tg.version);
    if (version >= 6.1) {
        tg.setHeaderColor('#141419'); // Цвет фона из :root
        tg.setBackgroundColor('#141419');
    } else {
        console.log('Telegram API version is too old for header color:', tg.version);
    }
} catch (e) {
    console.error('Error setting TG colors:', e);
}

// ==========================================
// 2. ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
// ==========================================
const container = document.getElementById('feed-container');
let currentPage = 0;   // Какую страницу грузим (0, 1, 2...)
let isLoading = false; // Чтобы не грузить дважды
let hasMore = true;    // Есть ли еще видео в базе

// ==========================================
// 3. ОСНОВНАЯ ФУНКЦИЯ ЗАГРУЗКИ (LAZY LOAD)
// ==========================================
async function loadMoreVideos() {
    // Если уже грузим или видео кончились - стоп
    if (isLoading || !hasMore) return;
    
    isLoading = true;
    showLoader(true); // Показать индикатор внизу

    try {
        console.log(`📡 Requesting page ${currentPage}...`);
        
        // Запрос к твоему API
        const res = await fetch(`/api/get_feed?page=${currentPage}`);

        // ПРОВЕРКА 1: Это вообще JSON? (Защита от Vercel Error Page)
        const contentType = res.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
            // Если пришел HTML (ошибка 500/404), читаем текст ошибки
            const text = await res.text();
            console.error("Server returned HTML instead of JSON:", text);
            throw new Error("SERVER_ERROR: Database connection failed");
        }

        // ПРОВЕРКА 2: Статус ответа
        if (!res.ok) {
            throw new Error(`HTTP ERROR: ${res.status}`);
        }

        const newVideos = await res.json();

        // Если пришел пустой массив - значит видео кончились
        if (!newVideos || newVideos.length === 0) {
            if (currentPage === 0) {
                // Если база пуста с самого начала
                showError("MEMORY_BANKS_EMPTY. NO DATA.");
            } else {
                console.log("🏁 End of feed reached");
                hasMore = false;
                showLoader(false);
                // Сообщение "Конец связи"
                const endMsg = document.createElement('div');
                endMsg.className = 'loading-state small';
                endMsg.innerText = '// END_OF_MEMORY_DUMP //';
                endMsg.style.opacity = '0.5';
                container.appendChild(endMsg);
            }
            return;
        }
        
        // Удаляем начальную заглушку, если она есть
        const initialLoader = document.querySelector('.loading-state');
        if (initialLoader) initialLoader.remove();

        // Рендерим видео
        newVideos.forEach(videoData => {
            const card = createCard(videoData);
            container.appendChild(card);
            videoObserver.observe(card); // Подключаем автоплей
        });

        // Перемещаем триггер загрузки в самый низ
        updateLoadingTrigger();
        
        // Готовимся к следующей странице
        currentPage++;

    } catch (e) {
        console.error("Critical Feed Error:", e);
        showError(e.message);
    } finally {
        isLoading = false;
        showLoader(false);
    }
}

// ==========================================
// 4. СОЗДАНИЕ HTML КАРТОЧКИ
// ==========================================
function createCard(data) {
    const div = document.createElement('div');
    div.className = 'video-card';
    
    // Безопасное получение данных (если каких-то полей нет в БД)
    const url = data.videoUrl || data.url || ''; 
    const cover = data.cover || '';
    const author = data.author || 'UNKNOWN_ENTITY';
    const desc = data.desc || '...';

    div.innerHTML = `
        <video loop playsinline poster="${cover}" preload="metadata">
            <source src="${url}" type="video/mp4">
        </video>
        <div class="video-ui">
            <div class="video-info">
                <div class="author">@${author}</div>
                <div class="desc">${desc}</div>
            </div>
        </div>
    `;

    // Обработка клика (Пауза / Плей)
    const vid = div.querySelector('video');
    div.addEventListener('click', () => {
        if (vid.paused) {
            vid.play();
        } else {
            vid.pause();
        }
    });

    return div;
}

// ==========================================
// 5. ЛОГИКА АВТОПЛЕЯ (Observer)
// ==========================================
const videoObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        const card = entry.target;
        const vid = card.querySelector('video');
        if (!vid) return;

        if (entry.isIntersecting) {
            // Видео появилось на экране (порог 60%)
            vid.currentTime = 0;
            // Пытаемся запустить
            vid.play().catch(err => {
                console.warn("Autoplay blocked, muting...", err);
                vid.muted = true; // Если браузер блокирует звук - мьютим
                vid.play();
            });
        } else {
            // Видео ушло с экрана
            vid.pause();
        }
    });
}, { threshold: 0.6 });

// ==========================================
// 6. ЛОГИКА LAZY LOADING (Observer)
// ==========================================
// Создаем невидимую линию в конце ленты
const loadingTrigger = document.createElement('div');
loadingTrigger.className = 'loading-trigger';

const lazyLoadObserver = new IntersectionObserver((entries) => {
    // Если линия появилась внизу экрана - грузим еще
    if (entries[0].isIntersecting && hasMore && !isLoading) {
        loadMoreVideos();
    }
}, { rootMargin: '200px' }); // Начинать грузить за 200px до конца

function updateLoadingTrigger() {
    // Перемещаем триггер в конец контейнера
    container.appendChild(loadingTrigger);
    lazyLoadObserver.disconnect();
    lazyLoadObserver.observe(loadingTrigger);
}

// ==========================================
// 7. UI ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ==========================================
function showLoader(show) {
    // Ищем существующий лоадер
    let loader = document.getElementById('batch-loader');
    
    // Если нужно показать, но его нет - создаем
    if (show && !loader) {
        loader = document.createElement('div');
        loader.id = 'batch-loader';
        loader.className = 'loading-state small';
        loader.innerHTML = '<span class="blink">Loading...</span>';
        container.appendChild(loader);
    }
    
    // Если нужно скрыть - удаляем
    if (!show && loader) {
        loader.remove();
    }
}

function showError(msg) {
    const errDiv = document.createElement('div');
    errDiv.className = 'loading-state';
    errDiv.style.color = '#ff4444';
    errDiv.innerHTML = `
        <div style="font-size: 2rem; margin-bottom: 10px;">⚠️</div>
        <div>SYSTEM FAILURE</div>
        <div style="font-size: 1rem; opacity: 0.7; margin-top: 5px;">${msg}</div>
        <div style="margin-top: 20px; font-size: 0.8rem; cursor: pointer; text-decoration: underline;" onclick="location.reload()">[REBOOT_SYSTEM]</div>
    `;
    // Очищаем контейнер и показываем ошибку
    container.innerHTML = '';
    container.appendChild(errDiv);
}

// ==========================================
// 8. ЗАПУСК
// ==========================================
loadMoreVideos();
