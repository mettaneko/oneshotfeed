document.addEventListener('DOMContentLoaded', () => {

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

    // 2. АВТОРИЗАЦИЯ
    async function authenticate() {
        if (state.token) return state.token;
        const initData = tg.initData || '';
        try {
            const res = await fetch('/api/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ initData })
            });
            if (!res.ok) throw new Error('Auth failed');
            const { token } = await res.json();
            state.token = token;
            return token;
        } catch (e) {
            console.error(e);
            tg.showAlert('Ошибка авторизации. Попробуйте перезапустить приложение.');
            return null;
        }
    }

    // 3. API ЗАПРОСЫ
    async function fetchVideos(page) {
        const endpoint = state.activeFeed === 'foryou' ? '/api/get_feed' : '/api/get_subs';
        const res = await fetch(`${endpoint}?page=${page}`, {
            headers: { 'Authorization': `Bearer ${state.token}` }
        });
        if (!res.ok) throw new Error(`API Error: ${res.status}`);
        return res.json();
    }

    async function toggleSubscription(authorId) {
        subscribeBtn.style.pointerEvents = 'none'; // Защита от двойного клика
        try {
            const res = await fetch('/api/subscribe', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${state.token}`
                },
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
        card.dataset.subscribed = data.subscribed; // Статус подписки из API

        const coverUrl = data.cover ? `url(${data.cover})` : 'none';
        card.innerHTML = `<div class="blurred-bg" style="background-image: ${coverUrl};"></div><video loop playsinline muted poster="" preload="metadata"><source src="${data.url}" type="video/mp4"></video>`;
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
    
    // 7. ЗАПУСК И СЛУШАТЕЛИ
    async function initApp() {
        const token = await authenticate();
        if (!token) return;
        state.isMuted = false;
        document.querySelector('#sound-btn i').className = 'fa-solid fa-volume-high';
        startOverlay.style.opacity = '0';
        setTimeout(() => startOverlay.style.display = 'none', 300);
        loadMoreVideos();
    }
    startOverlay.addEventListener('click', initApp, { once: true });
    document.querySelectorAll('.nav-tab').forEach(t => t.addEventListener('click', () => switchFeed(t.dataset.feed)));
    document.getElementById('sound-btn').addEventListener('click', handleSoundToggle);
    document.querySelector('.subscribe-btn').addEventListener('click', () => {
        if(state.currentVideo) toggleSubscription(state.currentVideo.dataset.authorId);
    });

    // Хелперы
    function showLoader(s){let l=document.getElementById('batch-loader');if(s&&!l){l=document.createElement('div');l.id='batch-loader';l.className='loading-state';l.innerHTML='<span class="blink">Загрузка...</span>';container.appendChild(l)}else if(!s&&l)l.remove()}
    function showEndOfFeed(){const e=document.createElement('div');e.className='end-of-feed';e.innerText='// Конец ленты //';e.style.opacity='0.5';container.appendChild(e)}
});
