// ==========================================
// 1. ИНИЦИАЛИЗАЦИЯ TELEGRAM WEB APP
// ==========================================
const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

try {
    if (parseFloat(tg.version) >= 6.1) {
        tg.setHeaderColor('#141419');
        tg.setBackgroundColor('#141419');
    }
} catch (e) { console.error('Error setting TG colors:', e); }

// ==========================================
// 2. ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ И СОСТОЯНИЕ
// ==========================================
const container = document.getElementById('feed-container');
const state = {
    currentPage: 0,
    isLoading: false,
    hasMore: true,
    isMuted: true,
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
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const newVideos = await res.json();
        
        if (newVideos.length === 0) {
            state.hasMore = false;
            if (state.currentPage === 0) showError("Здесь пока пусто...");
            else showEndOfFeed();
            return;
        }
        
        document.querySelector('.loading-state')?.remove();
        newVideos.forEach(data => container.appendChild(createCard(data)));
        videoObserver.observe(container.lastChild); // Следим только за последней добавленной карточкой

        updateLoadingTrigger();
        state.currentPage++;
    } catch (e) {
        console.error("Feed Error:", e);
        showError(e.message);
    } finally {
        state.isLoading = false;
        showLoader(false);
    }
}

// ==========================================
// 4. СОЗДАНИЕ HTML КАРТОЧКИ (НОВЫЙ ДИЗАЙН)
// ==========================================
function createCard(data) {
    const card = document.createElement('div');
    card.className = 'video-card';
    card.dataset.videoId = data.id || 'unknown';
    card.dataset.videoUrl = data.videoUrl || data.url || '';
    card.dataset.author = data.author || 'Anon';

    card.innerHTML = `
        <video loop playsinline muted poster="${data.cover || ''}" preload="metadata">
            <source src="${card.dataset.videoUrl}" type="video/mp4">
        </video>
        <div class="video-ui">
            <div class="glass-panel video-info-panel">
                <div class="author-info">
                    <div class="author">${card.dataset.author}</div>
                    <div class="desc">${data.desc || 'on tiktok'}</div>
                </div>
                <div class="subscribe-btn">
                    <i class="fa-solid fa-plus"></i>
                </div>
            </div>
            <div class="glass-panel actions-panel">
                <div class="action-btn" id="sound-btn">
                    <i class="fa-solid fa-volume-xmark"></i>
                </div>
                <div class="action-divider"></div>
                <div class="action-btn" id="share-btn">
                    <i class="fa-solid fa-share"></i>
                </div>
                <div class="action-divider"></div>
                <div class="action-btn" id="suggest-btn">
                    <i class="fa-solid fa-plus"></i>
                </div>
            </div>
        </div>
    `;

    // Слушатели на кнопки
    card.querySelector('#sound-btn').addEventListener('click', handleSoundToggle);
    card.querySelector('#share-btn').addEventListener('click', handleShare);
    card.querySelector('#suggest-btn').addEventListener('click', handleSuggest);
    card.querySelector('.subscribe-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        tg.HapticFeedback.impactOccurred('light');
        const icon = e.currentTarget.querySelector('i');
        icon.className = icon.className.includes('fa-plus') ? 'fa-solid fa-check' : 'fa-solid fa-plus';
    });
    
    // Пауза/Плей
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
function handleSoundToggle(e) {
    e.stopPropagation();
    state.isMuted = !state.isMuted;
    tg.HapticFeedback.impactOccurred('light');
    document.querySelectorAll('.video-card.is-active video').forEach(vid => vid.muted = state.isMuted);
    document.querySelectorAll('#sound-btn i').forEach(icon => {
        icon.className = state.isMuted ? 'fa-solid fa-volume-xmark' : 'fa-solid fa-volume-high';
    });
}

function handleShare(e) { /* ... без изменений ... */ }
function handleSuggest(e) { /* ... без изменений ... */ }
function switchFeed(feedType) { /* ... без изменений ... */ }

// ==========================================
// 6. Intersection Observers (Автоплей и Lazy Load)
// ==========================================
const videoObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        entry.target.classList.remove('is-active');
        if (entry.isIntersecting) {
            entry.target.classList.add('is-active');
            const vid = entry.target.querySelector('video');
            vid.muted = state.isMuted;
            vid.currentTime = 0;
            vid.play().catch(e => console.warn("Autoplay was prevented"));
        } else {
            entry.target.querySelector('video').pause();
        }
    });
}, { threshold: 0.6 });

const loadingTrigger = document.createElement('div');
loadingTrigger.className = 'loading-trigger';
const lazyLoadObserver = new IntersectionObserver((e) => {
    if (e[0].isIntersecting) loadMoreVideos();
}, { rootMargin: '200px' });

function updateLoadingTrigger() {
    container.appendChild(loadingTrigger);
    lazyLoadObserver.disconnect();
    lazyLoadObserver.observe(loadingTrigger);
}

// ==========================================
// 7. UI-ХЕЛПЕРЫ
// ==========================================
function showLoader(show) { /* ... без изменений ... */ }
function showError(msg) { /* ... без изменений ... */ }
function showEndOfFeed() { /* ... без изменений ... */ }

// ==========================================
// 8. ЗАПУСК
// ==========================================
document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => switchFeed(tab.dataset.feed));
});

loadMoreVideos();

// КОСТЫЛИ ДЛЯ ДЕМОНСТРАЦИИ (потом удалить)
// Функции, которые не менялись, я оставил свернутыми для краткости
function handleShare(e) {
    e.stopPropagation();
    const card = e.target.closest('.video-card');
    tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(card.dataset.videoUrl)}&text=Смотри, что я нашел в OneShot Feed!`);
}

function handleSuggest(e) {
    e.stopPropagation();
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

    const nav = document.querySelector('.top-nav');
    nav.dataset.active = feedType; // <-- ДОБАВЛЕНО

    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.feed === feedType);
    });

    container.innerHTML = '<div class="loading-state"><div class="blink">_</div></div>';
    lazyLoadObserver.disconnect();
    loadMoreVideos();
}

function showLoader(show) {
    let loader = document.getElementById('batch-loader');
    if (show && !loader) {
        loader = document.createElement('div');
        loader.id = 'batch-loader';
        loader.className = 'loading-state small';
        loader.innerHTML = '<span class="blink">Loading...</span>';
        container.appendChild(loader);
    }
    if (!show && loader) loader.remove();
}

function showError(msg) {
    container.innerHTML = `<div class="loading-state" style="color: #ff4444;"><div style="font-size: 2rem; margin-bottom: 10px;">⚠️</div><div>SYSTEM FAILURE</div><div style="font-size: 1rem; opacity: 0.7; margin-top: 5px;">${msg}</div></div>`;
}

function showEndOfFeed() {
    const endMsg = document.createElement('div');
    endMsg.className = 'loading-state small';
    endMsg.innerText = '// END_OF_MEMORY_DUMP //';
    endMsg.style.opacity = '0.5';
    container.appendChild(endMsg);
}
