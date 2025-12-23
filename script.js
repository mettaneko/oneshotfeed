document.addEventListener('DOMContentLoaded', () => {
    // Этот код запустится только когда вся страница будет готова

    // 1. ИНИЦИАЛИЗАЦИЯ И DOM
    const tg = window.Telegram.WebApp;
    tg.ready();
    tg.expand();
    try {
        if (parseFloat(tg.version) >= 6.1) {
            tg.setHeaderColor('#0a0a0f');
            tg.setBackgroundColor('#0a0a0f');
        }
    } catch (e) { console.error('TG Color Error:', e); }

    const container = document.getElementById('feed-container');
    const startOverlay = document.getElementById('start-overlay');
    const uiAuthor = document.querySelector('.author-info .author');
    const uiDesc = document.querySelector('.author-info .desc');
    const subscribeBtn = document.querySelector('.subscribe-btn i');

    const state = {
        token: null, currentPage: 0, isLoading: false, hasMore: true,
        isMuted: true, activeFeed: 'foryou', currentVideo: null
    };

    // 2. АВТОРИЗАЦИЯ (с проверкой на локальный режим)
    async function authenticate() {
        const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
        if (isLocal) {
            console.warn("ЛОКАЛЬНЫЙ РЕЖИМ: Авторизация пропущена.");
            state.token = 'local-dev-token';
            return state.token;
        }
        if (state.token) return state.token;
        const initData = tg.initData || '';
        if (!initData) {
             safeShowAlert('Ошибка: initData отсутствует. Откройте приложение через Telegram.');
             return null;
        }
        try {
            const res = await fetch('/api/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ initData })
            });
            if (!res.ok) throw new Error('Auth failed: ' + res.status);
            const { token } = await res.json();
            state.token = token;
            return token;
        } catch (e) {
            console.error(e);
            safeShowAlert('Ошибка авторизации. Попробуйте перезапустить.');
            return null;
        }
    }

    // 3. API ЗАПРОСЫ
    const TEST_VIDEOS = [
        { id: 'local1', authorId: 'test1', authorName: 'LocalDev', desc: 'Тестовое видео #1', subscribed: 'false', cover: 'https://via.placeholder.com/400x600.png?text=Cover1', url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.webm' },
        { id: 'local2', authorId: 'test2', authorName: 'TestUser', desc: 'Тестовое видео #2', subscribed: 'true', cover: 'https://via.placeholder.com/400x600.png?text=Cover2', url: 'https://www.w3schools.com/html/mov_bbb.mp4' }
    ];

    async function fetchVideos(page) {
        if (state.token === 'local-dev-token') {
            return new Promise(resolve => setTimeout(() => resolve(page === 0 ? TEST_VIDEOS : []), 500));
        }
        const endpoint = state.activeFeed === 'foryou' ? '/api/get_feed' : '/api/get_subs';
        const res = await fetch(`${endpoint}?page=${page}`, {
            headers: { 'Authorization': `Bearer ${state.token}` }
        });
        if (!res.ok) throw new Error(`API Error: ${res.status}`);
        return res.json();
    }

    async function toggleSubscription(authorId) {
        if (state.token === 'local-dev-token') {
            console.log(`LOCAL: Toggling subscription for ${authorId}`);
            const currentSubStatus = subscribeBtn.className.includes('fa-check');
            updateSubscribeButton(!currentSubStatus);
            return;
        }
        subscribeBtn.style.pointerEvents = 'none';
        try {
            const res = await fetch('/api/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.token}` },
                body: JSON.stringify({ authorId })
            });
            const { subscribed } = await res.json();
            updateSubscribeButton(subscribed);
        } catch (e) {
            console.error('Subscription error:', e);
        } finally {
            subscribeBtn.style.pointerEvents = 'auto';
        }
    }

    // 4. ЛОГИКА ЛЕНТЫ
    async function loadMoreVideos() {
        if (state.isLoading || !state.hasMore) return;
        state.isLoading = true; showLoader(true);
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
        } catch (e) { console.error(e.message) }
        finally { state.isLoading = false; showLoader(false) }
    }

    function createCard(data) {
        const card = document.createElement('div');
        card.className = 'video-card';
        card.dataset.videoId = data.id || 'unknown';
        card.dataset.authorId = data.authorId || 'unknown';
        card.dataset.authorName = data.authorName || 'Anon';
        card.dataset.desc = data.desc || '...';
        card.dataset.subscribed = data.subscribed;
        card.dataset.videoUrl = data.url || '';
        const coverUrl = data.cover ? `url(${data.cover})` : 'none';
        card.innerHTML = `<div class="blurred-bg" style="background-image: ${coverUrl};"></div><video loop playsinline muted poster="" preload="metadata"><source src="${card.dataset.videoUrl}" type="video/mp4"></video>`;
        card.querySelector('video').addEventListener('click', (e) => {
            const vid = e.target;
            if (vid.paused) vid.play(); else vid.pause();
        });
        videoObserver.observe(card);
        return card;
    }

    // 5. ЛОГИКА UI
    let uiUpdateTimeout;
    function updateUIMeta(card) {
        clearTimeout(uiUpdateTimeout);
        uiAuthor.style.opacity = '0'; uiDesc.style.opacity = '0';
        uiUpdateTimeout = setTimeout(() => {
            uiAuthor.innerText = card.dataset.authorName;
            uiDesc.innerText = card.dataset.desc;
            updateSubscribeButton(card.dataset.subscribed === 'true');
            uiAuthor.style.opacity = '1'; uiDesc.style.opacity = '1';
        }, 150);
    }
    
    function updateSubscribeButton(isSubscribed) {
        subscribeBtn.className = isSubscribed ? 'fa-solid fa-check' : 'fa-solid fa-plus';
    }

    function handleSoundToggle(e) {
        e.stopPropagation(); state.isMuted = !state.isMuted;
        const currentCard = document.querySelector('.video-card.is-active');
        if (currentCard) currentCard.querySelector('video').muted = state.isMuted;
        document.querySelectorAll('#sound-btn i').forEach(i => i.className = state.isMuted ? 'fa-solid fa-volume-xmark' : 'fa-solid fa-volume-high');
    }

    function switchFeed(feedType) {
        if (feedType === state.activeFeed || state.isLoading) return;
        state.activeFeed = feedType; state.currentPage = 0; state.hasMore = true;
        document.querySelectorAll('.nav-tab').forEach(t => t.classList.toggle('active', t.dataset.feed === feedType));
        container.innerHTML = ""; lazyLoadObserver.disconnect();
        updateUIMeta({dataset: {authorName: '', desc: ''}});
        loadMoreVideos();
    }
    
    // 6. OBSERVERS
    const videoObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const card = entry.target; card.classList.remove('is-active');
            if (entry.isIntersecting) {
                card.classList.add('is-active');
                if (state.currentVideo !== card) {
                    state.currentVideo = card;
                    updateUIMeta(card);
                }
                const vid = card.querySelector('video');
                vid.muted = state.isMuted; vid.currentTime = 0; vid.play().catch(()=>{});
            } else {
                card.querySelector('video').pause();
            }
        });
    }, { threshold: 0.6 });

    const loadingTrigger = document.createElement('div');
    const lazyLoadObserver = new IntersectionObserver(e => { if (e[0].isIntersecting && !state.isLoading) loadMoreVideos() }, { rootMargin: '200px' });
    function updateLoadingTrigger() { loadingTrigger.className = 'loading-trigger'; container.appendChild(loadingTrigger); lazyLoadObserver.disconnect(); lazyLoadObserver.observe(loadingTrigger) }
    
    function showLoader(s){let l=document.getElementById('batch-loader');if(s&&!l){l=document.createElement('div');l.id='batch-loader';l.className='loading-state';l.innerHTML='<span class="blink">Загрузка...</span>';container.appendChild(l)}else if(!s&&l)l.remove()}
    function showEndOfFeed(){const e=document.createElement('div');e.className='end-of-feed';e.innerText='// Конец ленты //';e.style.opacity='0.5';container.appendChild(e)}

    // 7. ЗАПУСК И СЛУШАТЕЛИ
    async function initApp() {
        const token = await authenticate();
        if (!token) return;
        setupEventListeners();
        state.isMuted = false;
        document.querySelector('#sound-btn i').className = 'fa-solid fa-volume-high';
        startOverlay.style.opacity = '0';
        setTimeout(() => startOverlay.style.display = 'none', 300);
        loadMoreVideos();
    }

    function setupEventListeners() {
        document.querySelectorAll('.nav-tab').forEach(t => t.addEventListener('click', () => switchFeed(t.dataset.feed)));
        document.getElementById('sound-btn').addEventListener('click', handleSoundToggle);
        document.querySelector('.subscribe-btn').addEventListener('click', () => { if (state.currentVideo) toggleSubscription(state.currentVideo.dataset.authorId); });
        document.getElementById('share-btn').addEventListener('click', () => { const c = document.querySelector('.video-card.is-active'); if (c) safeShowAlert(`Sharing: ${c.dataset.videoUrl}`) });
        document.getElementById('suggest-btn').addEventListener('click', () => safeShowAlert('Предложить (в разработке).'));
    }
    
    function safeShowAlert(m) { try { tg.showAlert(m) } catch (e) { alert(m) } }

    startOverlay.addEventListener('click', initApp, { once: true });
});
