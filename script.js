// script.js

// --- БЛОК УПРАВЛЕНИЯ РЕЖИМОМ ТЕХ. РАБОТ ---
(async function() {
    const API_BASE = 'https://feed.mettaneko.ru';
    const SESSION_DURATION = 5 * 60 * 1000;
    const ACCESS_TOKEN_KEY = 'maintenance_access_pass';
    const checkStatusAndRedirect = async () => {
        try {
            const response = await fetch(`${API_BASE}/api/maintenance`);
            if (!response.ok) return;
            const data = await response.json();
            if (data.maintenance) {
                let hasValidPass = false;
                const token = localStorage.getItem(ACCESS_TOKEN_KEY);
                if (token) {
                    try {
                        const payload = JSON.parse(atob(token));
                        if (Date.now() <= (payload.ts + SESSION_DURATION)) hasValidPass = true;
                    } catch (e) { /* Игнор */ }
                }
                if (!hasValidPass && window.location.pathname !== '/maintenance.html') {
                    window.location.replace('/maintenance.html');
                }
            }
        } catch (e) { console.error("Maintenance check failed.", e); }
    };
    await checkStatusAndRedirect();
    setInterval(checkStatusAndRedirect, 10000);
})();


// === KONFIG ===
const API_BASE = 'https://feed.mettaneko.ru';


// === 0. TELEGRAM WEB APP ===
const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
if (tg) {
    tg.expand();
    tg.ready();
}


// === СИСТЕМА УВЕДОМЛЕНИЙ И КОНФЕТТИ ===
function showCustomNotification(message, options = {}) {
    const { isError = false, showConfetti = false } = options;
    if (document.querySelector('.custom-toast-notification:not(.persistent-banner)')) return;

    const toast = document.createElement('div');
    toast.className = 'custom-toast-notification';
    const avatarUrl = '/assets/avatar.jpg';

    toast.innerHTML = `<img src="${avatarUrl}" class="toast-avatar" alt="bot-avatar"><span class="toast-message">${message}</span>`;
    if (isError) toast.classList.add('error');
    
    // Сдвигаем навигацию
    const navBar = document.getElementById('top-nav-bar');
    if (navBar) navBar.classList.add('hidden-by-toast');

    document.body.appendChild(toast);
    
    // Анимация
    requestAnimationFrame(() => toast.classList.add('show'));
    
    if (showConfetti && !isError) triggerConfetti();

    setTimeout(() => {
        toast.classList.remove('show');
        if (navBar) navBar.classList.remove('hidden-by-toast');
        toast.addEventListener('transitionend', () => toast.remove());
    }, 3500);
}


function triggerConfetti() {
    const canvas = document.createElement('canvas');
    canvas.className = 'confetti-canvas';
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const confettiCount = 100; // Чуть меньше конфетти
    const confetti = [];
    const colors = ['#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3', '#03a9f4', '#ffeb3b', '#ffc107', '#ff9800'];

    for (let i = 0; i < confettiCount; i++) {
        confetti.push({
            x: Math.random() * canvas.width, y: canvas.height, r: Math.random() * 6 + 3,
            color: colors[Math.floor(Math.random() * colors.length)],
            tilt: Math.floor(Math.random() * 20) - 10, tiltAngle: 0,
            tiltAngleIncrement: Math.random() * 0.1 + 0.08,
            angle: Math.random() * Math.PI - (Math.PI / 4),
            speed: Math.random() * 12 + 8
        });
    }

    let frame = 0;
    const gravity = 0.4;

    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (let i = 0; i < confetti.length; i++) {
            const c = confetti[i];
            ctx.beginPath();
            ctx.lineWidth = c.r;
            ctx.strokeStyle = c.color;
            ctx.moveTo(c.x + c.tilt, c.y);
            ctx.lineTo(c.x, c.y + c.tilt + c.r);
            ctx.stroke();
            c.tiltAngle += c.tiltAngleIncrement;
            c.y -= c.speed;
            c.x += Math.sin(c.angle) * c.speed / 2;
            c.speed -= gravity;
            c.tilt = Math.sin(c.tiltAngle) * 20;
        }
        if (frame < 120 && confetti.some(c => c.y < canvas.height && c.y > -20)) {
           requestAnimationFrame(draw);
           frame++;
        } else {
           canvas.remove();
        }
    }
    draw();
}


function injectNewStyles() {
    const style = document.createElement('style');
    style.textContent = `
        /* Навигация и слои */
        .feed-navigation { gap: 20px; }
        .feed-navigation .nav-tab { padding: 10px 15px; height: auto; white-space: nowrap; }

        #top-nav-bar {
            transform: translateX(-50%) translateY(0);
            opacity: 1;
            transition: transform 0.5s cubic-bezier(0.25, 0.1, 0.25, 1), opacity 0.5s cubic-bezier(0.25, 0.1, 0.25, 1);
            z-index: 100;
        }
        #top-nav-bar.hidden-by-toast {
            transform: translateX(-50%) translateY(-150%);
            opacity: 0; pointer-events: none;
        }

        .liquid-controls-container { z-index: 100; }
        .suggest-form { z-index: 1001; }
        
        /* --- ЕДИНЫЙ СТИЛЬ УВЕДОМЛЕНИЙ И МОДАЛОК --- */
        .glass-panel-style {
            background-color: rgba(30, 30, 35, 0.85);
            backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
            color: #fff;
            border-radius: 16px;
            border: 1px solid rgba(255, 255, 255, 0.08);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
            font-family: "Manrope", sans-serif;
        }

        /* Уведомления */
        .custom-toast-notification {
            position: fixed; top: 15px; left: 50%; min-width: 300px; max-width: 90%;
            transform: translateX(-50%) translateY(-150%);
            padding: 10px 15px;
            z-index: 10000; opacity: 0;
            transition: transform 0.5s cubic-bezier(0.25, 0.1, 0.25, 1), opacity 0.5s;
            display: flex; align-items: center; gap: 12px;
            /* Применяем общий стиль */
            background-color: rgba(30, 30, 35, 0.85);
            backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
            color: #fff; border-radius: 16px; border: 1px solid rgba(255, 255, 255, 0.08);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        }
        .custom-toast-notification.show { transform: translateX(-50%) translateY(0); opacity: 1; }
        .custom-toast-notification.error { background-color: rgba(217, 83, 79, 0.85); border-color: rgba(255, 80, 80, 0.2); }
        .toast-avatar { width: 32px; height: 32px; border-radius: 8px; object-fit: cover; }
        .toast-message { font-weight: 500; font-size: 0.9rem; flex: 1; }

        .confetti-canvas { position: fixed; bottom: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 50; }
        
        /* МОДАЛЬНОЕ ОКНО НАСТРОЕК (В том же стиле) */
        .settings-modal-overlay {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.5); 
            z-index: 10005; display: flex; justify-content: center; align-items: center;
            opacity: 0; transition: opacity 0.3s; pointer-events: none;
        }
        .settings-modal-overlay.show { opacity: 1; pointer-events: auto; }
        
        .settings-panel {
            width: 300px; padding: 20px;
            transform: scale(0.9); transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            /* Применяем общий стиль */
            background-color: rgba(30, 30, 35, 0.85);
            backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
            color: #fff; border-radius: 16px; border: 1px solid rgba(255, 255, 255, 0.08);
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
        }
        .settings-modal-overlay.show .settings-panel { transform: scale(1); }
        
        .settings-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; font-weight: bold; font-size: 1.1rem; }
        .settings-header button { background: none; border: none; color: rgba(255,255,255,0.7); cursor: pointer; padding: 5px; }
        .setting-item { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
        .settings-footer { text-align: center; margin-top: 10px; font-size: 0.75rem; opacity: 0.4; }

        /* ТОНКИЙ ПОЛЗУНОК ГРОМКОСТИ */
        .thin-range {
            -webkit-appearance: none; width: 120px; height: 4px; 
            background: rgba(255,255,255,0.2); border-radius: 2px; outline: none;
        }
        .thin-range::-webkit-slider-thumb {
            -webkit-appearance: none; appearance: none;
            width: 14px; height: 14px; border-radius: 50%; 
            background: #fff; cursor: pointer; border: none;
            box-shadow: 0 0 5px rgba(0,0,0,0.3);
        }

        /* ВЫПАДАЮЩИЙ СПИСОК ТЕМЫ */
        .theme-select {
            background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.1);
            color: white; padding: 5px 10px; border-radius: 8px; outline: none;
            font-family: inherit; font-size: 0.9rem;
        }
        .theme-select option { background: #222; color: white; }

        /* КНОПКИ В БАННЕРЕ */
        .banner-actions { display: flex; gap: 8px; }
        .banner-btn {
            border: none; padding: 6px 12px; border-radius: 8px; 
            font-size: 0.85rem; cursor: pointer; font-weight: 600;
        }
        .btn-accept { background: rgba(255,255,255,0.2); color: white; }
        .btn-decline { background: transparent; color: rgba(255,255,255,0.6); border: 1px solid rgba(255,255,255,0.1); }
    `;
    document.head.appendChild(style);
}


// === 1. ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ===
let subscribedAuthors = [];
let hasInteracted = false;
let savedVol = localStorage.getItem('niko_volume');
let globalVolume = savedVol !== null ? parseFloat(savedVol) : 1.0;
let currentTab = 'foryou';
let currentActiveAuthor = null;
let allVideos = [];


// === DOM Элементы ===
const feedContainer = document.getElementById('feed');
const tabForYou = document.getElementById('tab-foryou');
const tabFollowing = document.getElementById('tab-following');
const indicator = document.getElementById('nav-indicator');
const uiAuthor = document.getElementById('ui-author');
const uiDesc = document.getElementById('ui-desc');
const uiSubBtn = document.getElementById('ui-sub-btn');

// Настройки
const uiSettingsBtn = document.getElementById('ui-settings-btn');
const settingsModal = document.getElementById('settings-modal');
const closeSettingsBtn = document.getElementById('close-settings');
const modalVolRange = document.getElementById('modal-vol-range');
const themeSelect = document.getElementById('theme-select'); // Новый селект

const uiShareBtn = document.getElementById('ui-share-btn');
const uiSuggestBtn = document.getElementById('ui-suggest-btn');
const suggestForm = document.getElementById('suggest-form');
const sugUrl = document.getElementById('sug-url');
const sugAuthor = document.getElementById('sug-author');
const sugDesc = document.getElementById('sug-desc');
const sugBtn = document.getElementById('sug-send');
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx;


// === ПРОВЕРКА TELEGRAM ===
const isTelegram = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;


// === 2. ЗАГРУЗКА ВИДЕО ===
async function loadVideosOnce() {
    let localVideos = [], dbVideos = [];
    try {
        const res = await fetch('public/videos.json', { cache: 'no-store' });
        if (res.ok) localVideos = await res.json();
        else { const res2 = await fetch('videos.json'); if (res2.ok) localVideos = await res2.json(); }
    } catch (e) { }
    try {
        const res = await fetch(`${API_BASE}/api/get_feed`);
        if (res.ok) dbVideos = await res.json();
    } catch (e) { }
    allVideos = [...dbVideos, ...localVideos];
    if (allVideos.length === 0) console.warn('No videos found!');
}


async function reloadVideosAndFeed() {
    const oldVideos = allVideos.slice();
    await loadVideosOnce();
    const oldIds = new Set(oldVideos.map(v => v.id));
    const newOnes = allVideos.filter(v => !oldIds.has(v.id));
    if (newOnes.length === 0) return;
    newOnes.forEach(v => { const slide = createSlide(v); feedContainer.appendChild(slide); observer.observe(slide); });
}


// === 3. СИНХРОНИЗАЦИЯ ПОДПИСОК ===
async function syncSubs() {
    const local = JSON.parse(localStorage.getItem('subscribedAuthors'));
    if (local) subscribedAuthors = local;
    if (tg?.initDataUnsafe?.user) {
        try {
            const res = await fetch(`${API_BASE}/api/get_subs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: tg.initDataUnsafe.user.id }) });
            const data = await res.json();
            if (data.subs) { subscribedAuthors = data.subs; localStorage.setItem('subscribedAuthors', JSON.stringify(subscribedAuthors)); updateSubBtnState(); }
        } catch (e) { }
    }
}


// === 4. АУДИО И ОВЕРЛЕЙ ===
function unlockAudioContext(e) {
    if (e) e.stopPropagation();
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const buffer = audioCtx.createBuffer(1, 1, 22050);
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(audioCtx.destination);
    source.start(0);
    const overlay = document.getElementById('audio-unlock-overlay');
    if (overlay) { overlay.classList.add('hidden'); setTimeout(() => overlay.remove(), 500); }
    hasInteracted = true;
    const activeSlide = document.querySelector('.video-slide.active-slide');
    if (activeSlide) {
        const vid = activeSlide.querySelector('.video-player');
        if (vid) { vid.muted = false; vid.volume = globalVolume; if (vid.paused) { vid.play().catch(err => console.log('Unlock play error', err)); } }
    }
}
const overlayEl = document.getElementById('audio-unlock-overlay');
if (overlayEl) { overlayEl.addEventListener('click', unlockAudioContext); overlayEl.addEventListener('touchstart', unlockAudioContext); }


// === 5. НАВИГАЦИЯ ===
function updateInd(tab) {
    if (!tab) return;
    indicator.style.width = `${tab.offsetWidth}px`;
    indicator.style.transform = `translateX(${tab.offsetLeft}px)`;
}
function shuffle(arr) { return arr.sort(() => Math.random() - 0.5); }
function switchToForYou() {
    currentTab = 'foryou';
    tabForYou.classList.add('active');
    tabFollowing.classList.remove('active');
    updateInd(tabForYou);
    renderFeed(shuffle([...allVideos]).slice(0, 5));
}
tabForYou.addEventListener('click', switchToForYou);
tabFollowing.addEventListener('click', () => {
    if (subscribedAuthors.length === 0) return;
    currentTab = 'following';
    tabFollowing.classList.add('active');
    tabForYou.classList.remove('active');
    updateInd(tabFollowing);
    const filtered = allVideos.filter(v => subscribedAuthors.includes(v.author));
    renderFeed(filtered.slice(0, 5));
});


// === 6. UI ЛОГИКА ===
function updateSubBtnState() { if (!currentActiveAuthor) return; uiSubBtn.classList.toggle('subscribed', subscribedAuthors.includes(currentActiveAuthor)); }
function updateGlobalUI(videoData) {
    if (uiAuthor) uiAuthor.innerText = `@${videoData.author}`;
    if (uiDesc) uiDesc.innerText = videoData.desc;
    currentActiveAuthor = videoData.author;
    updateSubBtnState();
}
uiSubBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!currentActiveAuthor) return;
    const isSub = subscribedAuthors.includes(currentActiveAuthor);
    const action = isSub ? 'remove' : 'add';
    if (action === 'add') subscribedAuthors.push(currentActiveAuthor);
    else subscribedAuthors = subscribedAuthors.filter(a => a !== currentActiveAuthor);
    updateSubBtnState();
    if (currentTab === 'following') {
        if (subscribedAuthors.length === 0) switchToForYou();
        else { const filtered = allVideos.filter(v => subscribedAuthors.includes(v.author)); renderFeed(filtered.slice(0, 5)); }
    }
    if (tg?.initDataUnsafe?.user) {
        try { await fetch(`${API_BASE}/api/subscribe`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: tg.initDataUnsafe.user.id, author: currentActiveAuthor, action }) }); } catch (e) { }
    } else { localStorage.setItem('subscribedAuthors', JSON.stringify(subscribedAuthors)); }
});
function getActiveSlideData() {
    const slide = document.querySelector('.video-slide.active-slide');
    if (!slide) return null;
    try { return JSON.parse(slide.dataset.jsonData); } catch { return null; }
}


// === 7. УПРАВЛЕНИЕ ПАМЯТЬЮ ===
function loadVideo(slide) {
    if (!slide) return;
    const vid = slide.querySelector('.video-player');
    const bg = slide.querySelector('.video-blur-bg');
    const url = slide.dataset.videoUrl;
    if (vid && !vid.getAttribute('src')) { vid.src = url; vid.load(); }
    if (bg && !bg.getAttribute('src')) { bg.src = url; bg.load(); }
}
function unloadVideo(slide) {
    if (!slide) return;
    const vid = slide.querySelector('.video-player');
    const bg = slide.querySelector('.video-blur-bg');
    if (vid && vid.getAttribute('src')) { vid.pause(); vid.removeAttribute('src'); vid.load(); }
    if (bg && bg.getAttribute('src')) { bg.pause(); bg.removeAttribute('src'); bg.load(); }
}
function manageVideoMemory(activeSlide) {
    const allSlides = Array.from(document.querySelectorAll('.video-slide'));
    const activeIndex = allSlides.indexOf(activeSlide);
    if (activeIndex === -1) return;
    allSlides.forEach((slide, index) => { if (Math.abs(index - activeIndex) <= 2) { loadVideo(slide); } else { unloadVideo(slide); } });
}


// === 8. СЛАЙДЫ + ПЛЕЕР ===
function createSlide(data) {
    const slide = document.createElement('div');
    slide.className = 'video-slide';
    slide.dataset.jsonData = JSON.stringify(data);
    slide.dataset.videoUrl = data.videoUrl;
    slide.innerHTML = `<video class="video-blur-bg" loop muted playsinline></video><div class="video-wrapper"><video class="video-player" loop muted playsinline></video><div class="video-progress-container"><div class="video-progress-fill"></div></div></div>`;
    const vid = slide.querySelector('.video-player');
    const bg = slide.querySelector('.video-blur-bg');
    const fill = slide.querySelector('.video-progress-fill');
    const bar = slide.querySelector('.video-progress-container');
    vid.addEventListener('click', () => { if (vid.paused) { vid.play().catch(e => {}); bg.play().catch(() => {}); } else { vid.pause(); bg.pause(); } });
    vid.addEventListener('timeupdate', () => { if (vid.duration) fill.style.height = `${(vid.currentTime / vid.duration) * 100}%`; });
    let isDragging = false;
    const handle = (y) => { const rect = bar.getBoundingClientRect(); if (vid.duration) { vid.currentTime = Math.max(0, Math.min(1, 1 - (y - rect.top) / rect.height)) * vid.duration; } };
    const start = (e) => { e.preventDefault(); isDragging = true; handle(e.touches ? e.touches[0].clientY : e.clientY); };
    const move = (e) => { if (isDragging) { e.preventDefault(); handle(e.touches ? e.touches[0].clientY : e.clientY); } };
    const end = () => isDragging = false;
    bar.addEventListener('mousedown', start); window.addEventListener('mousemove', move); window.addEventListener('mouseup', end);
    bar.addEventListener('touchstart', start); window.addEventListener('touchmove', move); window.addEventListener('touchend', end);
    bar.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); handle(e.clientY); });
    return slide;
}


const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        const slide = entry.target;
        const vid = slide.querySelector('.video-player');
        const bg = slide.querySelector('.video-blur-bg');
        if (!vid || !bg) return;
        if (entry.isIntersecting) {
            document.querySelectorAll('.video-slide').forEach(s => s.classList.remove('active-slide'));
            slide.classList.add('active-slide');
            try { updateGlobalUI(JSON.parse(slide.dataset.jsonData)); } catch (e) { }
            manageVideoMemory(slide);
            if (hasInteracted) { vid.volume = globalVolume; vid.muted = (globalVolume === 0); } else { vid.muted = true; }
            requestAnimationFrame(() => {
                if (vid.paused) {
                    const playPromise = vid.play();
                    if (playPromise !== undefined) {
                        playPromise.then(() => { bg.play().catch(() => {}); }).catch(error => { vid.muted = true; vid.play().catch(e => {}); bg.play().catch(() => {}); });
                    }
                }
            });
        } else { vid.pause(); bg.pause(); }
    });
}, { threshold: 0.6 });


function renderFeed(videos, append = false) {
    if (!append) feedContainer.innerHTML = '';
    videos.forEach(v => { const s = createSlide(v); feedContainer.appendChild(s); observer.observe(s); });
}


let isFetching = false;
feedContainer.addEventListener('scroll', () => {
    if (feedContainer.scrollHeight - (feedContainer.scrollTop + feedContainer.clientHeight) < 300) {
        if (isFetching) return;
        isFetching = true;
        setTimeout(() => {
            let nextBatch = [];
            if (currentTab === 'foryou') { nextBatch = shuffle([...allVideos]).slice(0, 5); } else if (subscribedAuthors.length) { const filtered = allVideos.filter(v => subscribedAuthors.includes(v.author)); nextBatch = shuffle(filtered).slice(0, 5); }
            if (nextBatch.length > 0) { renderFeed(nextBatch, true); }
            isFetching = false;
        }, 500);
    }
});


// === ЛОГИКА НАСТРОЕК ===
if(uiSettingsBtn && settingsModal) {
    uiSettingsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        settingsModal.style.display = 'flex';
        setTimeout(() => settingsModal.classList.add('show'), 10);
    });
}
if(closeSettingsBtn && settingsModal) {
    closeSettingsBtn.addEventListener('click', () => {
        settingsModal.classList.remove('show');
        setTimeout(() => settingsModal.style.display = 'none', 300);
    });
    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) closeSettingsBtn.click();
    });
}

// Громкость
if(modalVolRange) {
    modalVolRange.value = globalVolume;
    modalVolRange.addEventListener('input', (e) => {
        globalVolume = parseFloat(e.target.value);
        localStorage.setItem('niko_volume', globalVolume);
        const v = document.querySelector('.video-slide.active-slide .video-player');
        if (v) { v.volume = globalVolume; v.muted = (globalVolume === 0); }
    });
}

// === 9. API ФУНКЦИИ ===
if (uiSuggestBtn && suggestForm) {
    uiSuggestBtn.addEventListener('click', (e) => { e.stopPropagation(); suggestForm.style.display = (suggestForm.style.display === 'flex') ? 'none' : 'flex'; });
}
if (sugBtn) {
    sugBtn.addEventListener('click', async () => {
        const url = sugUrl.value.trim();
        const author = sugAuthor.value.trim();
        const desc = sugDesc.value.trim();
        if (!url) { showCustomNotification('Вставьте ссылку!', { isError: true }); return; }
        const originalText = sugBtn.innerText;
        sugBtn.innerText = '...';
        sugBtn.disabled = true;
        try {
            const res = await fetch(`${API_BASE}/api/suggest`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, author, desc, user: tg?.initDataUnsafe?.user }) });
            if (res.ok) {
                sugBtn.innerText = 'Отправлено!';
                sugUrl.value = ''; sugAuthor.value = ''; sugDesc.value = '';
                showCustomNotification('Спасибо за предложенное видео!', { showConfetti: true });
                setTimeout(() => { suggestForm.style.display = 'none'; sugBtn.innerText = originalText; sugBtn.disabled = false; }, 1000);
            } else {
                showCustomNotification('Ошибка API.', { isError: true });
                sugBtn.innerText = originalText;
                sugBtn.disabled = false;
            }
        } catch (e) {
            showCustomNotification('Ошибка сети.', { isError: true });
            sugBtn.innerText = originalText;
            sugBtn.disabled = false;
        }
    });
}
if (uiShareBtn) {
    uiShareBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const data = getActiveSlideData();
        if (!data) return;
        if (!tg?.initDataUnsafe?.user) {
            navigator.clipboard.writeText(data.videoUrl).then(() => { showCustomNotification('Ссылка скопирована!', { showConfetti: true }); }).catch(() => {});
            return;
        }
        try {
            await fetch(`${API_BASE}/api/share`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ videoUrl: data.videoUrl, author: data.author, desc: data.desc, user: tg.initDataUnsafe.user }) });
            showCustomNotification('Видео отправлено в ЛС!', { showConfetti: true });
        } catch (e) { showCustomNotification('Ошибка сети.', { isError: true }); }
    });
}


// === НОВАЯ ЛОГИКА ТЕМ (ОБНОВЛЕННАЯ) ===
async function checkWinterTheme() {
    try {
        const res = await fetch(`${API_BASE}/api/theme`);
        let data = { isWinter: false, version: 1 };
        if (res.ok) data = await res.json();

        // 1. Убираем/скрываем опцию "Зима" из селекта, если она выключена админом
        const winterOption = themeSelect.querySelector('option[value="winter"]');
        if (!data.isWinter) {
            if (winterOption) winterOption.disabled = true; // Или remove()
            // Если была выбрана зима, сбрасываем на default
            if (themeSelect.value === 'winter') {
                 changeTheme('default');
            }
        } else {
            if (winterOption) winterOption.disabled = false;
        }

        // 2. Логика баннера и сохраненной темы
        const savedTheme = localStorage.getItem('app_theme_preference'); // 'default', 'winter'
        const lastSeenVersion = localStorage.getItem('winter_theme_seen_version');

        // Если есть сохраненная тема - применяем её
        if (savedTheme) {
            changeTheme(savedTheme);
        } else {
            // Если темы нет, но зима активна и версия новая -> предлагаем баннер
            if (data.isWinter) {
                // Если пользователь еще не видел эту версию зимы
                if (parseInt(lastSeenVersion) !== data.version) {
                    showWinterBanner(data.version);
                }
            }
        }
    } catch (e) { console.error('Theme check failed', e); }
}

function changeTheme(themeName) {
    // 1. Обновляем селект
    if (themeSelect) themeSelect.value = themeName;
    localStorage.setItem('app_theme_preference', themeName);

    // 2. Логика применения CSS
    if (themeName === 'winter') {
        if (!document.getElementById('winter-theme-css')) {
            const link = document.createElement('link');
            link.id = 'winter-theme-css';
            link.rel = 'stylesheet';
            link.href = 'css/winter.css';
            document.head.appendChild(link);
        }
    } else {
        const link = document.getElementById('winter-theme-css');
        if (link) link.remove();
    }
}

function showWinterBanner(version) {
    // Создаем элемент с ТЕМ ЖЕ классом, что и обычные уведомления
    // + добавляем класс persistent-banner, чтобы не перекрывался обычными тостами
    if (document.querySelector('.persistent-banner')) return;

    const banner = document.createElement('div');
    banner.className = 'custom-toast-notification persistent-banner';
    // Добавляем аватарку
    const avatarUrl = '/assets/avatar.jpg';
    
    banner.innerHTML = `
        <img src="${avatarUrl}" class="toast-avatar" alt="bot-avatar">
        <div class="toast-message" style="display:flex; flex-direction:column; gap:2px;">
            <span style="font-weight:bold;">Включить снег? ❄️</span>
            <span style="font-size:0.8em; opacity:0.8;">Зимнее настроение</span>
        </div>
        <div class="banner-actions">
            <button class="banner-btn btn-accept">Да</button>
            <button class="banner-btn btn-decline">Нет</button>
        </div>
    `;

    // Сдвигаем навигацию (как обычный тост)
    const navBar = document.getElementById('top-nav-bar');
    if (navBar) navBar.classList.add('hidden-by-toast');

    document.body.appendChild(banner);
    
    // Анимация
    requestAnimationFrame(() => banner.classList.add('show'));

    // Обработчики
    banner.querySelector('.btn-accept').onclick = () => {
        changeTheme('winter');
        localStorage.setItem('winter_theme_seen_version', version);
        closeBanner();
        showCustomNotification("❄️ Ура! Снег пошел!", { showConfetti: true });
    };

    banner.querySelector('.btn-decline').onclick = () => {
        localStorage.setItem('winter_theme_seen_version', version);
        closeBanner();
    };

    function closeBanner() {
        banner.classList.remove('show');
        if (navBar) navBar.classList.remove('hidden-by-toast');
        setTimeout(() => banner.remove(), 500);
    }
}

// Слушатель селекта
if (themeSelect) {
    themeSelect.addEventListener('change', (e) => {
        changeTheme(e.target.value);
    });
}


// === INIT ===
window.addEventListener('load', async () => {
    injectNewStyles();
    if (modalVolRange) modalVolRange.value = globalVolume;
    await loadVideosOnce(); 
    await syncSubs();
    
    // --- ЗАПУСК ПРОВЕРКИ ТЕМЫ ---
    checkWinterTheme();
    
    updateInd(tabForYou);
    renderFeed(shuffle([...allVideos]).slice(0, 5));
});


setInterval(reloadVideosAndFeed, 30000);
