// ==========================================
// 1. ИНИЦИАЛИЗАЦИЯ
// ==========================================
const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();
try { tg.setHeaderColor('#0a0a0f'); tg.setBackgroundColor('#0a0a0f'); }
catch (e) { console.error('Error setting TG colors:', e); }

// ==========================================
// 2. DOM ЭЛЕМЕНТЫ И СОСТОЯНИЕ
// ==========================================
const container = document.getElementById('feed-container');
const startOverlay = document.getElementById('start-overlay');

// Статичные UI элементы
const uiAuthor = document.querySelector('.author-info .author');
const uiDesc = document.querySelector('.author-info .desc');

const state = {
    currentPage: 0, isLoading: false, hasMore: true,
    isMuted: true, activeFeed: 'foryou', currentVideoId: null
};

// ==========================================
// 3. ЛОКАЛЬНАЯ РАЗРАБОТКА И API
// ==========================================
const TEST_VIDEOS = [ // Тестовые данные для локалки
    { id: 'local1', author: 'TestUser1', desc: 'Локальное видео #1', cover: 'https://via.placeholder.com/400x600.png?text=Cover1', url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.webm' },
    { id: 'local2', author: 'DevUser', desc: 'Локальное видео #2', cover: 'https://via.placeholder.com/400x600.png?text=Cover2', url: 'https://www.w3schools.com/html/mov_bbb.mp4' }
];

async function fetchVideos(page) {
    const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    if (isLocal) {
        console.log(`LOCAL MODE: Faking fetch for page ${page}`);
        return new Promise(resolve => {
            setTimeout(() => resolve(page === 0 ? TEST_VIDEOS : []), 500);
        });
    }
    const res = await fetch(`/api/get_feed?page=${page}`);
    if (!res.ok) throw new Error(`API Error: ${res.status}`);
    return res.json();
}

// ==========================================
// 4. ЛОГИКА ЛЕНТЫ
// ==========================================
async function loadMoreVideos() {
    if (state.isLoading || !state.hasMore) return;
    state.isLoading = true;
    showLoader(true);
    try {
        const newVideos = await fetchVideos(state.currentPage);
        if (newVideos.length === 0) {
            state.hasMore = false;
            if(state.currentPage > 0) showEndOfFeed();
            return;
        }
        newVideos.forEach(data => container.appendChild(createCard(data)));
        updateLoadingTrigger();
        state.currentPage++;
    } catch (e) {
        console.error(e.message);
    } finally {
        state.isLoading = false;
        showLoader(false);
    }
}

function createCard(data) {
    const card = document.createElement('div');
    card.className = 'video-card';
    card.dataset.videoId = data.id || 'unknown';
    card.dataset.videoUrl = data.url || '';
    card.dataset.author = data.author || 'Anon';
    card.dataset.desc = data.desc || '...';

    const coverUrl = data.cover ? `url(${data.cover})` : 'none';
    card.innerHTML = `
        <div class="blurred-bg" style="background-image: ${coverUrl};"></div>
        <video loop playsinline muted poster="" preload="metadata">
            <source src="${card.dataset.videoUrl}" type="video/mp4">
        </video>
    `;
    card.querySelector('video').addEventListener('click', () => {
        const vid = card.querySelector('video');
        if (vid.paused) vid.play(); else vid.pause();
    });
    return card;
}

// ==========================================
// 5. ЛОГИКА UI
// ==========================================
let uiUpdateTimeout;
function updateUIMeta(author, desc) {
    clearTimeout(uiUpdateTimeout);
    uiAuthor.style.opacity = '0';
    uiDesc.style.opacity = '0';

    uiUpdateTimeout = setTimeout(() => {
        uiAuthor.innerText = author;
        uiDesc.innerText = desc;
        uiAuthor.style.opacity = '1';
        uiDesc.style.opacity = '1';
    }, 200); // задержка для анимации
}

function handleSoundToggle(e) {
    e.stopPropagation(); state.isMuted = !state.isMuted;
    const currentCard = document.querySelector('.video-card.is-active');
    if (currentCard) currentCard.querySelector('video').muted = state.isMuted;
    document.querySelectorAll('#sound-btn i').forEach(icon => {
        icon.className = state.isMuted ? 'fa-solid fa-volume-xmark' : 'fa-solid fa-volume-high';
    });
}

function switchFeed(feedType) {
    if (feedType === state.activeFeed || state.isLoading) return;
    state.activeFeed = feedType; state.currentPage = 0; state.hasMore = true;
    document.querySelectorAll('.nav-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.feed === feedType));
    container.innerHTML = "";
    lazyLoadObserver.disconnect();
    loadMoreVideos();
}

// ==========================================
// 6. OBSERVERS
// ==========================================
const videoObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        const card = entry.target;
        card.classList.remove('is-active');
        if (entry.isIntersecting) {
            card.classList.add('is-active');
            if (state.currentVideoId !== card.dataset.videoId) {
                state.currentVideoId = card.dataset.videoId;
                updateUIMeta(card.dataset.author, card.dataset.desc);
            }
            const vid = card.querySelector('video');
            vid.muted = state.isMuted;
            vid.currentTime = 0;
            vid.play().catch(e => {});
        } else {
            card.querySelector('video').pause();
        }
    });
}, { threshold: 0.6 });

const loadingTrigger = document.createElement('div');
const lazyLoadObserver = new IntersectionObserver((e) => {
    if (e[0].isIntersecting && !state.isLoading) loadMoreVideos();
}, { rootMargin: '200px' });

function updateLoadingTrigger() {
    loadingTrigger.className = 'loading-trigger';
    container.appendChild(loadingTrigger);
    lazyLoadObserver.disconnect();
    lazyLoadObserver.observe(loadingTrigger);
}

// ==========================================
// 7. ЗАПУСК
// ==========================================
function initApp() {
    state.isMuted = false;
    startOverlay.style.opacity = '0';
    setTimeout(() => startOverlay.style.display = 'none', 300);
    loadMoreVideos();
}

startOverlay.addEventListener('click', initApp, { once: true });
document.querySelectorAll('.nav-tab').forEach(tab => tab.addEventListener('click', () => switchFeed(tab.dataset.feed)));
document.getElementById('sound-btn').addEventListener('click', handleSoundToggle);
document.getElementById('share-btn').addEventListener('click', () => tg.openTelegramLink('https://t.me/share/url?url=...'));
document.getElementById('suggest-btn').addEventListener('click', () => tg.showPopup({title: 'Предложить видео', message: 'В разработке.'}));

// Хелперы для лоадера
function showLoader(show) { let l=document.getElementById('batch-loader'); if(show&&!l){l=document.createElement('div');l.id='batch-loader';l.className='loading-state';l.innerHTML='<span class="blink">Загрузка...</span>';container.appendChild(l)}else if(!show&&l)l.remove() }
function showEndOfFeed() { const e=document.createElement('div');e.className='end-of-feed';e.innerText='// Конец ленты //';e.style.opacity='0.5';container.appendChild(e)}
