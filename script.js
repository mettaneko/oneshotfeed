// script.js

// === БЛОК УПРАВЛЕНИЯ РЕЖИМОМ ТЕХ. РАБОТ ===
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
                    } catch (e) { }
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


// === TELEGRAM WEB APP ===
const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
if (tg) {
    tg.expand();
    tg.ready();
}


// === УВЕДОМЛЕНИЯ ===
function showCustomNotification(message, options = {}) {
    const { isError = false, showConfetti = false } = options;
    if (document.querySelector('.custom-toast-notification:not(.persistent-banner)')) return;

    const toast = document.createElement('div');
    toast.className = 'custom-toast-notification';
    const avatarUrl = '/assets/avatar.jpg';

    toast.innerHTML = `<img src="${avatarUrl}" class="toast-avatar" alt="bot-avatar"><span class="toast-message">${message}</span>`;
    if (isError) toast.classList.add('error');
    
    const navBar = document.getElementById('top-nav-bar');
    if (navBar) navBar.classList.add('hidden-by-toast');

    document.body.appendChild(toast);
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
    const confettiCount = 100;
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
    let frame = 0; const gravity = 0.4;
    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (let i = 0; i < confetti.length; i++) {
            const c = confetti[i];
            ctx.beginPath(); ctx.lineWidth = c.r; ctx.strokeStyle = c.color;
            ctx.moveTo(c.x + c.tilt, c.y); ctx.lineTo(c.x, c.y + c.tilt + c.r); ctx.stroke();
            c.tiltAngle += c.tiltAngleIncrement; c.y -= c.speed; c.x += Math.sin(c.angle) * c.speed / 2; c.speed -= gravity; c.tilt = Math.sin(c.tiltAngle) * 20;
        }
        if (frame < 120 && confetti.some(c => c.y < canvas.height && c.y > -20)) { requestAnimationFrame(draw); frame++; } else { canvas.remove(); }
    }
    draw();
}


// === СТИЛИ (BOTTOM SHEET / ШТОРКА СНИЗУ) ===
function injectNewStyles() {
    const style = document.createElement('style');
    style.textContent = `
        /* Навигация */
        .feed-navigation { gap: 20px; }
        .feed-navigation .nav-tab { padding: 10px 15px; height: auto; white-space: nowrap; }
        #top-nav-bar {
            transform: translateX(-50%) translateY(0); opacity: 1;
            transition: transform 0.5s, opacity 0.5s; z-index: 100;
        }
        #top-nav-bar.hidden-by-toast { transform: translateX(-50%) translateY(-150%); opacity: 0; pointer-events: none; }
        .liquid-controls-container { z-index: 100; }
        .suggest-form { z-index: 1001; }
        
        /* Уведомления */
        .custom-toast-notification {
            position: fixed; top: 20px; left: 50%; min-width: 300px; max-width: 90%;
            transform: translateX(-50%) translateY(-150%); padding: 12px 24px; z-index: 2000; opacity: 0;
            transition: transform 0.5s, opacity 0.5s; display: flex; align-items: center; gap: 12px;
            background: rgba(0, 0, 0, 0.6); backdrop-filter: blur(15px); -webkit-backdrop-filter: blur(15px);
            border: 1px solid rgba(255, 255, 255, 0.1); box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
            border-radius: 30px; color: #fff; font-family: "Manrope", sans-serif;
        }
        .custom-toast-notification.show { transform: translateX(-50%) translateY(0); opacity: 1; }
        .custom-toast-notification.error { background-color: rgba(217, 83, 79, 0.85); border-color: rgba(255, 80, 80, 0.3); }
        .toast-avatar { width: 36px; height: 36px; border-radius: 10px; object-fit: cover; }
        .toast-message { font-weight: 500; font-size: 0.95rem; flex: 1; line-height: 1.3; }
        .confetti-canvas { position: fixed; bottom: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 50; }

        /* === НАСТРОЙКИ (BOTTOM SHEET - ШТОРКА) === */
        .settings-modal-overlay {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            z-index: 9000; 
            
            /* Позиционирование внизу */
            display: flex; align-items: flex-end; justify-content: center;
            
            /* Фон прозрачный, только блюр */
            background: transparent; 
            backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
            
            opacity: 0; transition: opacity 0.3s; pointer-events: none;
        }
        .settings-modal-overlay.show { opacity: 1; pointer-events: auto; }

        .settings-panel {
            width: 100%; 
            max-width: 100%;
            /* Высота авто, но не больше 70%, чтобы оставить место сверху */
            height: auto;
            max-height: 70vh;
            
            padding: 30px 24px 50px; /* Большой паддинг снизу */
            
            /* Выезд снизу */
            transform: translateY(100%); 
            transition: transform 0.4s cubic-bezier(0.19, 1, 0.22, 1);
            
            /* Стеклянный стиль */
            background: rgba(18, 18, 18, 0.95); 
            
            /* Границы и тени */
            border-top: 1px solid rgba(255, 255, 255, 0.15);
            border-radius: 32px 32px 0 0; /* Закругляем ТОЛЬКО ВЕРХ */
            box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.6);
            color: #fff;
            
            display: flex; flex-direction: column;
        }
        
        /* Полоска-индикатор ("ручка") */
        .settings-panel::before {
            content: ''; position: absolute; top: 12px; left: 50%; transform: translateX(-50%);
            width: 40px; height: 5px; background: rgba(255,255,255,0.25); border-radius: 3px;
        }

        .settings-modal-overlay.show .settings-panel { transform: translateY(0); }
        
        .settings-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; }
        .settings-header h2 { font-size: 1.4rem; font-weight: 700; margin: 0; }
        
        .settings-header button { 
            background: rgba(255,255,255,0.1); border: none; color: white; width: 34px; height: 34px; 
            border-radius: 50%; display: flex; align-items: center; justify-content: center; 
            cursor: pointer; transition: background 0.2s; 
        }
        .settings-header button:active { background: rgba(255,255,255,0.2); }

        .setting-item { display: flex; justify-content: space-between; align-items: center; margin-bottom: 28px; }
        .setting-label { display: flex; align-items: center; gap: 12px; font-size: 1.05rem; font-weight: 500; color: rgba(255,255,255,0.9); }
        .settings-footer { display: none; }

        .thin-range { -webkit-appearance: none; width: 110px !important; height: 6px; background: rgba(255,255,255,0.15); border-radius: 3px; outline: none; }
        .thin-range::-webkit-slider-thumb { -webkit-appearance: none; width: 20px; height: 20px; border-radius: 50%; background: #fff; cursor: pointer; border: none; box-shadow: 0 2px 10px rgba(0,0,0,0.3); }

        .theme-select {
            appearance: none; -webkit-appearance: none; background-color: rgba(255,255,255,0.08); 
            border: 1px solid rgba(255,255,255,0.1); color: white; padding: 10px 36px 10px 14px;
            border-radius: 12px; font-size: 0.95rem; font-weight: 500; cursor: pointer;
            background-image: url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23FFFFFF%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E");
            background-repeat: no-repeat; background-position: right 12px top 50%; background-size: 10px auto;
        }
        .theme-select option { background: #1e1e23; color: white; }

        .banner-actions { display: flex; gap: 10px; margin-top: 2px; }
        .banner-btn { border: none; padding: 6px 14px; border-radius: 8px; font-size: 0.85rem; cursor: pointer; font-weight: 600; }
        .btn-accept { background: white; color: black; }
        .btn-decline { background: rgba(255,255,255,0.1); color: white; }
    `;
    document.head.appendChild(style);
}


// === GLOBAL VARS ===
let subscribedAuthors = [];
let hasInteracted = false;
let savedVol = localStorage.getItem('niko_volume');
let globalVolume = savedVol !== null ? parseFloat(savedVol) : 1.0;
let currentTab = 'foryou';
let currentActiveAuthor = null;
let allVideos = []; 


// === DOM ===
const feedContainer = document.getElementById('feed');
const tabForYou = document.getElementById('tab-foryou');
const tabFollowing = document.getElementById('tab-following');
const indicator = document.getElementById('nav-indicator');
const uiAuthor = document.getElementById('ui-author');
const uiDesc = document.getElementById('ui-desc');
const uiSubBtn = document.getElementById('ui-sub-btn');

const uiSettingsBtn = document.getElementById('ui-settings-btn');
const settingsModal = document.getElementById('settings-modal');
const closeSettingsBtn = document.getElementById('close-settings');
const modalVolRange = document.getElementById('modal-vol-range');
const themeSelect = document.getElementById('theme-select'); 

const uiShareBtn = document.getElementById('ui-share-btn');
const uiSuggestBtn = document.getElementById('ui-suggest-btn');
const suggestForm = document.getElementById('suggest-form');
const sugUrl = document.getElementById('sug-url');
const sugAuthor = document.getElementById('sug-author');
const sugDesc = document.getElementById('sug-desc');
const sugBtn = document.getElementById('sug-send');
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx;


// === VIDEO LOADING ===
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
    if (feedContainer.scrollTop > 100) return;
    const oldVideos = allVideos.slice();
    await loadVideosOnce();
    const oldIds = new Set(oldVideos.map(v => v.id));
    const newOnes = allVideos.filter(v => !oldIds.has(v.id));
    if (newOnes.length === 0) return;
}


// === SUBSCRIPTIONS ===
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


// === AUDIO & OVERLAY ===
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


// === NAVIGATION ===
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
    const publicVideos = allVideos.filter(v => !v.isSecret);
    renderFeed(shuffle([...publicVideos]).slice(0, 5));
}

tabForYou.addEventListener('click', switchToForYou);
tabFollowing.addEventListener('click', () => {
    if (subscribedAuthors.length === 0) return;
    currentTab = 'following';
    tabFollowing.classList.add('active');
    tabForYou.classList.remove('active');
    updateInd(tabFollowing);
    const filtered = allVideos.filter(v => subscribedAuthors.includes(v.author) && !v.isSecret);
    renderFeed(filtered.slice(0, 5));
});


// === UI UPDATES ===
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
        else { const filtered = allVideos.filter(v => subscribedAuthors.includes(v.author) && !v.isSecret); renderFeed(filtered.slice(0, 5)); }
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


// === MEMORY & VIDEO LOGIC ===
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


// === SLIDE CREATION ===
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


// === SCROLL ===
let isFetching = false;
feedContainer.addEventListener('scroll', () => {
    if (feedContainer.scrollHeight - (feedContainer.scrollTop + feedContainer.clientHeight) < 300) {
        if (isFetching) return;
        isFetching = true;
        setTimeout(() => {
            let nextBatch = [];
            if (currentTab === 'foryou') {
                const publicVideos = allVideos.filter(v => !v.isSecret);
                nextBatch = shuffle([...publicVideos]).slice(0, 5);
            } else if (subscribedAuthors.length) { 
                const filtered = allVideos.filter(v => subscribedAuthors.includes(v.author) && !v.isSecret);
                nextBatch = shuffle(filtered).slice(0, 5); 
            }
            if (nextBatch.length > 0) { renderFeed(nextBatch, true); }
            isFetching = false;
        }, 500);
    }
});


// === SETTINGS UI (С ПАУЗОЙ) ===
if(uiSettingsBtn && settingsModal) {
    uiSettingsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        
        // Пауза видео при открытии
        const activeVid = document.querySelector('.video-slide.active-slide .video-player');
        const activeBg = document.querySelector('.video-slide.active-slide .video-blur-bg');
        if (activeVid) activeVid.pause();
        if (activeBg) activeBg.pause();

        settingsModal.style.display = 'flex';
        setTimeout(() => settingsModal.classList.add('show'), 10);
    });
}
if(closeSettingsBtn && settingsModal) {
    closeSettingsBtn.addEventListener('click', () => {
        // Плей видео при закрытии
        const activeVid = document.querySelector('.video-slide.active-slide .video-player');
        const activeBg = document.querySelector('.video-slide.active-slide .video-blur-bg');
        if (activeVid) activeVid.play().catch(()=>{});
        if (activeBg) activeBg.play().catch(()=>{});

        settingsModal.classList.remove('show');
        setTimeout(() => settingsModal.style.display = 'none', 300);
    });
    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) closeSettingsBtn.click();
    });
}
const footer = document.querySelector('.settings-footer');
if(footer) footer.style.display = 'none';

if(modalVolRange) {
    modalVolRange.value = globalVolume;
    modalVolRange.addEventListener('input', (e) => {
        globalVolume = parseFloat(e.target.value);
        localStorage.setItem('niko_volume', globalVolume);
        const v = document.querySelector('.video-slide.active-slide .video-player');
        if (v) { v.volume = globalVolume; v.muted = (globalVolume === 0); }
    });
}


// === ACTIONS (SHARE/SUGGEST) ===
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
            await fetch(`${API_BASE}/api/share`, { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify({ 
                    id: data.id,
                    videoUrl: data.videoUrl, 
                    author: data.author, 
                    desc: data.desc, 
                    user: tg.initDataUnsafe.user 
                }) 
            });
            showCustomNotification('Видео отправлено в ЛС!', { showConfetti: true });
        } catch (e) { showCustomNotification('Ошибка сети.', { isError: true }); }
    });
}


// === МЕНЕДЖЕР ТЕМ ===
function loadThemeScript(url, callback) {
    if (document.querySelector(`script[src="${url}"]`)) {
        if(callback) callback();
        return;
    }
    const script = document.createElement('script');
    script.src = url;
    script.onload = callback;
    document.body.appendChild(script);
}

function applyTheme(themeName) {
    if (window.WinterTheme) window.WinterTheme.disable();
    if (themeName === 'winter') {
        loadThemeScript('themes/winter.js', () => {
            if (window.WinterTheme) window.WinterTheme.enable();
        });
    }
    if (themeSelect) themeSelect.value = themeName;
    localStorage.setItem('app_theme_preference', themeName);
}

async function checkThemes() {
    try {
        const res = await fetch(`${API_BASE}/api/theme`);
        let data = { isWinter: false, version: 1 };
        if (res.ok) data = await res.json();

        const winterOption = themeSelect ? themeSelect.querySelector('option[value="winter"]') : null;
        const savedTheme = localStorage.getItem('app_theme_preference');
        const lastSeenVersion = localStorage.getItem('winter_theme_seen_version');

        if (!data.isWinter) {
            if (winterOption) winterOption.disabled = true;
            if (savedTheme === 'winter') applyTheme('default');
            return;
        }

        if (winterOption) winterOption.disabled = false;

        if (savedTheme) {
            applyTheme(savedTheme);
            if (savedTheme !== 'winter') {
                 if (parseInt(lastSeenVersion) !== data.version) showWinterBanner(data.version);
            }
        } else { showWinterBanner(data.version); }

    } catch (e) { console.error('Theme check failed', e); }
}

function showWinterBanner(version) {
    if (document.querySelector('.persistent-banner')) return;
    const banner = document.createElement('div');
    banner.className = 'custom-toast-notification persistent-banner';
    const avatarUrl = '/assets/avatar.jpg';
    banner.innerHTML = `
        <img src="${avatarUrl}" class="toast-avatar" alt="bot-avatar">
        <div class="toast-message" style="display:flex; flex-direction:column; gap:2px;">
            <span style="font-weight:bold;">Включить снег?</span>
            <span style="font-size:0.8em; opacity:0.8;">Новый год близко же!</span>
        </div>
        <div class="banner-actions">
            <button class="banner-btn btn-accept">Да</button>
            <button class="banner-btn btn-decline">Нет</button>
        </div>
    `;
    const navBar = document.getElementById('top-nav-bar');
    if (navBar) navBar.classList.add('hidden-by-toast');
    document.body.appendChild(banner);
    requestAnimationFrame(() => banner.classList.add('show'));

    banner.querySelector('.btn-accept').onclick = () => {
        applyTheme('winter');
        localStorage.setItem('winter_theme_seen_version', version);
        closeBanner();
        showCustomNotification("Смотри, снег пошел!", { showConfetti: true });
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

if (themeSelect) { themeSelect.addEventListener('change', (e) => applyTheme(e.target.value)); }


// === INIT ===
window.addEventListener('load', async () => {
    injectNewStyles();
    if (modalVolRange) modalVolRange.value = globalVolume;
    await loadVideosOnce(); 
    await syncSubs();
    checkThemes();
    updateInd(tabForYou);

    let targetId = null;
    if (tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param) {
        const param = tg.initDataUnsafe.start_param; 
        if (param.startsWith('v_')) {
            targetId = param.replace('v_', '');
        }
    }
    if (!targetId && window.location.hash.includes('video=')) {
        targetId = window.location.hash.split('video=')[1];
    }

    let feedToRender = [];
    if (targetId) {
        const targetVideo = allVideos.find(v => String(v.id) === String(targetId));
        if (targetVideo) {
            const others = shuffle(allVideos.filter(v => String(v.id) !== String(targetId) && !v.isSecret));
            feedToRender = [targetVideo, ...others];
        } else {
            feedToRender = shuffle(allVideos.filter(v => !v.isSecret));
        }
    } else {
        feedToRender = shuffle(allVideos.filter(v => !v.isSecret));
    }

    renderFeed(feedToRender.slice(0, 5));
});

setInterval(reloadVideosAndFeed, 30000);
