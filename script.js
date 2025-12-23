// ==========================================
// 1. ИНИЦИАЛИЗАЦИЯ TELEGRAM WEB APP
// ==========================================
const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

try {
    if (parseFloat(tg.version) >= 6.1) {
        tg.setHeaderColor('#0a0a0f');
        tg.setBackgroundColor('#0a0a0f');
    }
} catch (e) {
    console.error('Error setting TG colors:', e);
}

// ==========================================
// 2. ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
// ==========================================
const container = document.getElementById('feed-container');
const startOverlay = document.getElementById('start-overlay');
const state = {
    currentPage: 0,
    isLoading: false,
    hasMore: true,
    isMuted: true, // Всегда начинаем без звука
    activeFeed: 'foryou'
};

// ==========================================
// 3. ОСНОВНАЯ ФУНКЦИЯ ЗАГРУЗКИ
// ==========================================
async function loadMoreVideos() {
    if (state.isLoading || !state.hasMore) return;
    state.isLoading = true;
    showLoader(true);

    try {
        const res = await fetch(`/api/get_feed?page=${state.currentPage}`);
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }
        const newVideos = await res.json();

        if (newVideos.length === 0) {
            state.hasMore = false;
            if (state.currentPage === 0) {
                // Если база пуста, просто ничего не показываем
                console.log("No videos found in the database.");
            } else {
                showEndOfFeed();
            }
            return;
        }

        newVideos.forEach(data => {
            const card = createCard(data);
            container.appendChild(card);
            videoObserver.observe(card);
        });

        updateLoadingTrigger();
        state.currentPage++;

    } catch (e) {
        showError(e.message); // Логгируем ошибку, но не показываем пользователю
    } finally {
        state.isLoading = false;
        showLoader(false);
    }
}

// ==========================================
// 4. СОЗДАНИЕ HTML КАРТОЧКИ
// ==========================================
function createCard(data) {
    const card = document.createElement('div');
    card.className = 'video-card';
    card.dataset.videoId = data.id || 'unknown';
    card.dataset.videoUrl = data.videoUrl || data.url || '';
    card.dataset.author = data.author || 'Anon';
    
    // Устанавливаем постер для размытого фона
    const coverUrl = data.cover ? `url(${data.cover})` : 'none';
    
    card.innerHTML = `
        <div class="blurred-bg" style="background-image: ${coverUrl};"></div>
        <video loop playsinline muted poster="" preload="metadata">
            <source src="${card.dataset.videoUrl}" type="video/mp4">
        </video>
        <div class="video-ui">
            <div class="glass-panel video-info-panel">
                <div class="author-info">
                    <div class="author">${card.dataset.author}</div>
                    <div class="desc">${data.desc || 'on tiktok'}</div>
                </div>
                <div class="subscribe-btn"><i class="fa-solid fa-plus"></i></div>
            </div>
            <div class="glass-panel actions-panel">
                <div class="action-btn" id="sound-btn"><i class="fa-solid fa-volume-xmark"></i></div>
                <div class="action-btn" id="share-btn"><i class="fa-solid fa-share"></i></div>
                <div class="action-btn" id="suggest-btn"><i class="fa-solid fa-plus"></i></div>
            </div>
        </div>
    `;

    // Слушатели для кнопок
    card.querySelector('#sound-btn').addEventListener('click', handleSoundToggle);
    card.querySelector('#share-btn').addEventListener('click', handleShare);
    card.querySelector('#suggest-btn').addEventListener('click', handleSuggest);
    
    const videoElement = card.querySelector('video');
    videoElement.addEventListener('click', () => {
        if (videoElement.paused) videoElement.play();
        else videoElement.pause();
    });

    return card;
}

// ==========================================
// 5. ЛОГИКА КНОПОК
// ==========================================
function handleSoundToggle(event) {
    event.stopPropagation();
    state.isMuted = !state.isMuted;
    
    const currentCard = document.querySelector('.video-card.is-active');
    if (currentCard) {
        currentCard.querySelector('video').muted = state.isMuted;
    }
    
    document.querySelectorAll('#sound-btn i').forEach(icon => {
        icon.className = state.isMuted ? 'fa-solid fa-volume-xmark' : 'fa-solid fa-volume-high';
    });
}

function handleShare(event) {
    event.stopPropagation();
    const card = event.target.closest('.video-card');
    tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(card.dataset.videoUrl)}&text=Смотри, что я нашел в OneShot Feed!`);
}

function handleSuggest(event) {
    event.stopPropagation();
    tg.showPopup({
        title: 'Предложить видео',
        message: 'Эта функция в разработке.',
        buttons: [{ type: 'ok' }]
    });
}

function switchFeed(feedType) {
    if (feedType === state.activeFeed || state.isLoading) return;
    state.activeFeed = feedType;
    state.currentPage = 0;
    state.hasMore = true;
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.feed === feedType);
    });
    container.innerHTML = ""; // Очищаем ленту
    lazyLoadObserver.disconnect();
    loadMoreVideos();
}

// ==========================================
// 6. Intersection Observers
// ==========================================
const videoObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        const card = entry.target;
        const vid = card.querySelector('video');
        card.classList.remove('is-active');

        if (entry.isIntersecting) {
            card.classList.add('is-active');
            vid.muted = state.isMuted;
            vid.currentTime = 0;
            vid.play().catch(e => {}); // Ошибки автоплея игнорируем
        } else {
            vid.pause();
        }
    });
}, { threshold: 0.6 });

const loadingTrigger = document.createElement('div');
loadingTrigger.className = 'loading-trigger';
const lazyLoadObserver = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && !state.isLoading) {
        loadMoreVideos();
    }
}, { rootMargin: '200px' });

function updateLoadingTrigger() {
    container.appendChild(loadingTrigger);
    lazyLoadObserver.disconnect();
    lazyLoadObserver.observe(loadingTrigger);
}

// ==========================================
// 7. UI-ХЕЛПЕРЫ
// ==========================================
function showLoader(show) {
    let loader = document.getElementById('batch-loader');
    if (show && !loader) {
        loader = document.createElement('div');
        loader.id = 'batch-loader';
        loader.className = 'loading-state';
        loader.innerHTML = '<span class="blink">Загрузка...</span>';
        container.appendChild(loader);
    } else if (!show && loader) {
        loader.remove();
    }
}

function showError(msg) {
    console.error("Critical Feed Error:", msg);
}

function showEndOfFeed() {
    const endMsg = document.createElement('div');
    endMsg.className = 'loading-state';
    endMsg.innerText = '// Конец ленты //';
    endMsg.style.opacity = '0.5';
    container.appendChild(endMsg);
}

// ==========================================
// 8. ЗАПУСК ПРИЛОЖЕНИЯ
// ==========================================
function initApp() {
    // Включаем звук глобально
    state.isMuted = false;
    
    // Убираем оверлей
    startOverlay.style.opacity = '0';
    setTimeout(() => {
        startOverlay.style.display = 'none';
    }, 300);

    // Начинаем грузить видео
    loadMoreVideos();
}

// Слушаем клик по оверлею
startOverlay.addEventListener('click', initApp, { once: true });

// Инициализация табов
document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => switchFeed(tab.dataset.feed));
});
