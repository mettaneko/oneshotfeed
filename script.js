// === ГЛОБАЛЬНЫЕ НАСТРОЙКИ ===
const API_BASE = ''; // Пустая строка для Vercel. Все пути будут относительными.

let currentPage = 1;
let currentFeed = 'foryou'; // 'foryou' или 'following'
let isLoading = false;
let noMoreVideos = false;
const feedContainer = document.querySelector('.tiktok-feed');
const observerOptions = { root: null, rootMargin: '0px', threshold: 0.6 };
const tgInitData = window.Telegram?.WebApp?.initData || '';

// === 0. ПРОВЕРКА СТАТУСА (ТЕХ. РАБОТЫ) - ИСПРАВЛЕНО ===
async function checkMaintenance() {
    try {
        // Добавляем случайный параметр, чтобы обойти кэш Vercel
        const res = await fetch(`/api/status?t=${Date.now()}`); 
        const data = await res.json();
        if (data.maintenance) {
            // Если включен режим тех. работ, перенаправляем
            if (window.location.pathname !== '/maintenance.html' && window.location.pathname !== '/auth.html') {
                window.location.href = 'maintenance.html';
            }
            return true; 
        }
    } catch (e) {
        console.error('Ошибка проверки статуса:', e);
    }
    return false;
}

// === 1. ИНИЦИАЛИЗАЦИЯ ПРИ ЗАГРУЗКЕ ===
document.addEventListener('DOMContentLoaded', async () => {
    const isClosed = await checkMaintenance();
    if (isClosed) return;

    await loadFeed(true);
    
    feedContainer.addEventListener('scroll', handleScroll);
    document.getElementById('audio-unlock-overlay')?.addEventListener('click', unlockAudio);
    initTabs();
});

// === 2. ЛОГИКА ЗАГРУЗКИ (ПАГИНАЦИЯ) - ИСПРАВЛЕНО ===
async function loadFeed(isNewFeed = false) {
    if (isLoading || (noMoreVideos && !isNewFeed)) return;
    isLoading = true;

    if (isNewFeed) {
        feedContainer.innerHTML = '';
        currentPage = 1;
        noMoreVideos = false;
    }

    try {
        console.log(`📡 Загружаю '${currentFeed}', страница ${currentPage}...`);
        
        const url = currentFeed === 'foryou'
            ? `/api/get_feed?page=${currentPage}`
            : `/api/get_subs?page=${currentPage}`;
        
        const res = await fetch(url, { headers: { 'X-Telegram-Auth': tgInitData } });
        if (!res.ok) throw new Error(`Ошибка сети: ${res.status}`);
        
        const newVideos = await res.json();

        // ПРОВЕРКА: Убеждаемся, что от API пришел именно массив
        if (!Array.isArray(newVideos)) {
            throw new TypeError('API не вернул массив видео. Ответ сервера: ' + JSON.stringify(newVideos));
        }

        if (newVideos.length === 0) {
            noMoreVideos = true;
            if (currentPage === 1) showEmptyMessage(currentFeed);
            return;
        }

        renderVideos(newVideos);
        currentPage++;

    } catch (e) {
        console.error("Ошибка загрузки:", e);
        if (currentPage === 1) showErrorMessage();
    } finally {
        isLoading = false;
    }
}

// === 3. РЕНДЕРИНГ ВИДЕО ===
function renderVideos(videos) {
    videos.forEach(video => {
        if (!video || !video.videoUrl) return; // Защита от пустых или битых объектов видео

        const slide = document.createElement('div');
        slide.className = 'video-slide';
        
        // Экранируем кавычки, чтобы не сломать атрибуты onclick
        const safeDesc = video.desc ? video.desc.replace(/'/g, "\\'").replace(/"/g, '&quot;') : '';
        const safeAuthor = video.author ? video.author.replace(/'/g, "\\'") : 'unknown';

        slide.innerHTML = `
            <div class="video-blur-bg" style="background-image: url('${video.cover || ''}')"></div>
            <div class="video-wrapper">
                <video class="video-player" src="${video.videoUrl}" loop playsinline webkit-playsinline poster="${video.cover || ''}" preload="metadata"></video>
                <div class="video-progress-container"><div class="video-progress-fill"></div></div>
                <div class="pause-overlay" style="display:none; position:absolute; top:0; left:0; width:100%; height:100%; z-index:5; justify-content:center; align-items:center;">
                   <i class="fas fa-play" style="font-size: 3rem; color: rgba(255,255,255,0.5);"></i>
                </div>
            </div>
            <div class="liquid-controls-container">
                <div class="video-info-capsule">
                    <div class="author-row">
                        <h3 class="author-name">@${safeAuthor}</h3>
                        <button class="subscribe-btn" onclick="toggleSubscribe(this, '${safeAuthor}')"><i class="fas fa-plus"></i><i class="fas fa-check"></i></button>
                    </div>
                    ${video.desc ? `<p class="video-desc">${video.desc}</p>` : ''}
                </div>
                <div class="glass-deck">
                     <button class="control-btn btn-share" onclick="shareVideo('${video.videoUrl}', '${safeAuthor}', '${safeDesc}')"><i class="fas fa-share"></i></button>
                     <button class="control-btn" onclick="window.open('https://t.me/OneShotFeedBot', '_blank')"><i class="fab fa-telegram-plane"></i></button>
                     <button class="control-btn" onclick="toggleMuteAll(this)"><i class="fas fa-volume-up"></i></button>
                </div>
            </div>
        `;

        const videoEl = slide.querySelector('video');
        const wrapper = slide.querySelector('.video-wrapper');
        const pauseOverlay = slide.querySelector('.pause-overlay');

        wrapper.addEventListener('click', () => {
            if (videoEl.paused) { videoEl.play(); pauseOverlay.style.display = 'none'; } 
            else { videoEl.pause(); pauseOverlay.style.display = 'flex'; }
        });

        setupProgressBar(slide, videoEl);
        observer.observe(slide);
        feedContainer.appendChild(slide);
    });
}

// === 4. ЛОГИКА ИНТЕРФЕЙСА (Глобальные функции для onclick) ===

window.toggleSubscribe = async function(btn, author) {
    if (!tgInitData) return alert('Действие доступно только в Telegram!');
    btn.classList.toggle('subscribed');
    try {
        await fetch('/api/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Telegram-Auth': tgInitData },
            body: JSON.stringify({ author, subscribe: btn.classList.contains('subscribed') })
        });
    } catch (e) { console.error('Ошибка подписки:', e); }
};

window.sendSuggestion = async function() {
    if (!tgInitData) return alert('Действие доступно только в Telegram!');
    const link = document.getElementById('suggestLink').value;
    const comment = document.getElementById('suggestComment').value;
    if (!link) return alert('Введите ссылку!');
    
    try {
        const res = await fetch('/api/suggest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Telegram-Auth': tgInitData },
            body: JSON.stringify({ link, comment })
        });
        alert(res.ok ? 'Отправлено, спасибо!' : 'Ошибка отправки.');
        if (res.ok) window.toggleSuggestForm();
    } catch (e) { console.error('Ошибка предложки:', e); }
};

window.toggleSuggestForm = function() {
    const form = document.getElementById('suggestForm');
    form.style.display = form.style.display === 'none' ? 'flex' : 'none';
};

window.shareVideo = async function(url, author, desc) {
    if (navigator.share) {
        try { await navigator.share({ title: `Video by @${author}`, text: desc, url }); } catch (err) {}
    } else {
        navigator.clipboard.writeText(url).then(() => alert('Ссылка скопирована!'));
    }
};

window.toggleMuteAll = function(btn) {
    const isMuted = document.querySelector('video')?.muted;
    document.querySelectorAll('video').forEach(v => v.muted = !isMuted);
    const icon = btn.querySelector('i');
    icon.className = isMuted ? 'fas fa-volume-up' : 'fas fa-volume-mute';
};

// === 5. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        const video = entry.target.querySelector('video');
        if (!video) return;
        if (entry.isIntersecting) {
            video.currentTime = 0;
            video.play().catch(() => {});
        } else {
            video.pause();
        }
    });
}, observerOptions);

function setupProgressBar(slide, video) {
    const fill = slide.querySelector('.video-progress-fill');
    video.addEventListener('timeupdate', () => {
        const percent = video.duration > 0 ? (video.currentTime / video.duration) * 100 : 0;
        fill.style.height = `${percent}%`;
    });
}

function handleScroll() {
    if (feedContainer.scrollTop + feedContainer.clientHeight >= feedContainer.scrollHeight - 800) {
        loadFeed();
    }
}

function initTabs() {
    const tabs = document.querySelectorAll('.nav-tab');
    const indicator = document.querySelector('.nav-indicator');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            if (tab.classList.contains('active')) return;
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            currentFeed = tab.dataset.tab;
            loadFeed(true);

            indicator.style.left = currentFeed === 'foryou' ? '4px' : 'calc(50% - 4px)';
        });
    });
}

function unlockAudio() {
    document.getElementById('audio-unlock-overlay')?.classList.add('hidden');
    const v = document.querySelector('video');
    if (v) { v.muted = false; v.play(); }
}

function showEmptyMessage(feedType) {
    const text = feedType === 'foryou' ? 'В этой ленте пока нет видео.' : 'Вы еще ни на кого не подписаны.';
    feedContainer.innerHTML = `<p style="color:white; text-align:center; margin-top:50vh; font-family: sans-serif;">${text}</p>`;
}

function showErrorMessage() {
    feedContainer.innerHTML = `<p style="color:white; text-align:center; margin-top:50vh; font-family: sans-serif;">❌ Ошибка загрузки ленты. Попробуйте позже.</p>`;
}
