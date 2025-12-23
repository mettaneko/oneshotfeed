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
    activeFeed: 'foryou' // 'foryou' или 'subscriptions'
};

// ==========================================
// 3. ОСНОВНАЯ ФУНКЦИЯ ЗАГРУЗКИ
// ==========================================
async function loadMoreVideos() {
    if (state.isLoading || !state.hasMore) return;
    state.isLoading = true;
    showLoader(true);

    try {
        // В будущем можно будет добавить &feed=${state.activeFeed}
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

        newVideos.forEach(data => {
            const card = createCard(data);
            container.appendChild(card);
            videoObserver.observe(card);
        });

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
// 4. СОЗДАНИЕ HTML ЭЛЕМЕНТОВ
// ==========================================
function createCard(data) {
    const card = document.createElement('div');
    card.className = 'video-card';
    card.dataset.videoId = data.id || 'unknown';
    card.dataset.videoUrl = data.videoUrl || data.url || '';
    card.dataset.author = data.author || 'Anon';

    const url = card.dataset.videoUrl;
    const cover = data.cover || '';
    const author = card.dataset.author;
    const desc = data.desc || '...';

    card.innerHTML = `
        <video loop playsinline muted poster="${cover}" preload="metadata">
            <source src="${url}" type="video/mp4">
        </video>
        <div class="video-ui">
            <div class="video-info">
                <div class="author">@${author}</div>
                <div class="desc">${desc}</div>
            </div>
            <div class="action-sidebar">
                <div class="action-btn" id="sound-btn">
                    <i class="fa-solid fa-volume-xmark"></i>
                </div>
                <div class="action-btn" id="share-btn">
                    <i class="fa-solid fa-share"></i>
                    <span>Поделиться</span>
                </div>
                <div class="action-btn" id="suggest-btn">
                    <i class="fa-solid fa-plus"></i>
                    <span>Предложить</span>
                </div>
            </div>
        </div>
    `;

    // Слушатели для кнопок на конкретной карточке
    card.querySelector('#sound-btn').addEventListener('click', handleSoundToggle);
    card.querySelector('#share-btn').addEventListener('click', handleShare);
    card.querySelector('#suggest-btn').addEventListener('click', handleSuggest);
    
    // Пауза/Плей по клику на само видео
    const videoElement = card.querySelector('video');
    videoElement.addEventListener('click', () => {
        if (videoElement.paused) videoElement.play();
        else videoElement.pause();
    });

    return card;
}

// ==========================================
// 5. ЛОГИКА КНОПОК И СОБЫТИЙ
// ==========================================
function handleSoundToggle(event) {
    event.stopPropagation(); // Не даем клику уйти на видео
    state.isMuted = !state.isMuted;
    
    const currentCard = document.querySelector('.video-card.is-active');
    if (currentCard) {
        currentCard.querySelector('video').muted = state.isMuted;
    }
    
    // Обновляем иконку на ВСЕХ карточках
    document.querySelectorAll('#sound-btn i').forEach(icon => {
        icon.className = state.isMuted ? 'fa-solid fa-volume-xmark' : 'fa-solid fa-volume-high';
    });
}

function handleShare(event) {
    event.stopPropagation();
    const card = event.target.closest('.video-card');
    tg.showPopup({
        title: 'Поделиться',
        message: `Вы хотите поделиться видео от автора @${card.dataset.author}?`,
        buttons: [{ text: 'Да', id: 'share_confirm' }, { type: 'cancel' }]
    }, (buttonId) => {
        if (buttonId === 'share_confirm') {
            tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(card.dataset.videoUrl)}&text=Смотри, что я нашел в OneShot Feed!`);
        }
    });
}

function handleSuggest() {
    tg.showPopup({
        title: 'Предложить видео',
        message: 'Эта функция в разработке. Хотите открыть бота, чтобы отправить видео вручную?',
        buttons: [{ text: 'Открыть бота', id: 'open_bot' }, { type: 'cancel' }]
    }, (id) => {
        if (id === 'open_bot') tg.openTelegramLink('https://t.me/твой_бот');
    });
}

function switchFeed(feedType) {
    if (feedType === state.activeFeed) return;
    if (state.isLoading) return;

    state.activeFeed = feedType;
    state.currentPage = 0;
    state.hasMore = true;

    // Обновляем активный таб
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.feed === feedType);
    });

    // Очищаем ленту и запускаем загрузку
    container.innerHTML = '<div class="loading-state"><div class="blink">_</div></div>';
    lazyLoadObserver.disconnect(); // Отключаем старый наблюдатель
    loadMoreVideos();
}

// ==========================================
// 6. Intersection Observers (Автоплей и Lazy Load)
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
            vid.play().catch(e => console.warn("Autoplay was prevented"));
        } else {
            vid.pause();
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
    container.innerHTML = `
    <div class="loading-state" style="color: #ff4444;">
        <div style="font-size: 2rem; margin-bottom: 10px;">⚠️</div>
        <div>SYSTEM FAILURE</div>
        <div style="font-size: 1rem; opacity: 0.7; margin-top: 5px;">${msg}</div>
    </div>`;
}

function showEndOfFeed() {
    const endMsg = document.createElement('div');
    endMsg.className = 'loading-state small';
    endMsg.innerText = '// END_OF_MEMORY_DUMP //';
    endMsg.style.opacity = '0.5';
    container.appendChild(endMsg);
}

// ==========================================
// 8. ЗАПУСК
// ==========================================
document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => switchFeed(tab.dataset.feed));
});

loadMoreVideos();
