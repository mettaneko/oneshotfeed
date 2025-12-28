// script.js
// ==========================================
// 🥞 PANCAKE STREAK MODULE (Client Side)
// ==========================================
(function() {
    const DAILY_TARGET = 5;       // Цель: 5 видео
    const PROGRESS_THRESHOLD = 0.30; // Засчитываем просмотр после 30% длительности

    // Получение ID пользователя из Telegram WebApp
    function getUserId() {
        try {
            const tg = window.Telegram?.WebApp;
            if (tg?.initDataUnsafe?.user?.id) {
                return String(tg.initDataUnsafe.user.id);
            }
            return null;
        } catch {
            return null;
        }
    }

    // Создание или получение элемента интерфейса (таблетки)
    function ensureBadge() {
        let el = document.getElementById('streak-badge-container');
        if (el) return el;
        
        const navBar = document.getElementById('top-nav-bar');
        if (!navBar) return null;

        el = document.createElement('div');
        el.id = 'streak-badge-container';
        el.className = 'streak-capsule hidden';
        // Вставляем сразу после навигационной панели
        navBar.parentNode.insertBefore(el, navBar.nextSibling);
        return el;
    }

    // Отрисовка данных в таблетке
    function render(data) {
        const el = ensureBadge();
        if (!el) return;

        const streak = data?.streak || 0;
        const todayCount = data?.todayCount || 0;
        const target = data?.target || DAILY_TARGET;
        const isCompleted = data?.todayCompleted || (todayCount >= target);

        el.classList.remove('hidden');
        el.classList.remove('glowing');

        if (isCompleted) {
            // Цель выполнена: показываем только стрик и эффект свечения
            el.textContent = `${streak} 🥞`;
            el.classList.add('glowing');
        } else {
            // В процессе: показываем прогресс (например, 2/5)
            el.textContent = `${streak} 🥞 · ${todayCount}/${target}`;
        }
    }

    window.PancakeStreak = {
        _userId: null,
        
        // Инициализация при загрузке страницы
        async init() {
            this._userId = getUserId();
            ensureBadge();

            if (!this._userId) {
                console.log('🥞 Streak: ID пользователя не найден (не в Telegram?)');
                return;
            }

            try {
                // Запрашиваем актуальное состояние с сервера
                const res = await fetch(`${API_BASE}/api/streak?userId=${this._userId}`);
                if (res.ok) {
                    const data = await res.json();
                    render(data);
                }
            } catch (e) {
                console.warn('Streak init error:', e);
            }
        },

        // Метод вызывается для каждого видео-слайда
        attachToVideo(videoEl, videoId) {
            if (!videoEl || !videoId) return;
            if (videoEl._pancakeAttached) return; // Защита от повторного навешивания
            videoEl._pancakeAttached = true;

            let sent = false;

            const onTimeUpdate = async () => {
                if (sent) return;
                // Проверяем валидность длительности видео
                if (!videoEl.duration || !isFinite(videoEl.duration) || videoEl.duration <= 0) return;

                const progress = videoEl.currentTime / videoEl.duration;
                
                // Если просмотрено больше порога (30%)
                if (progress >= PROGRESS_THRESHOLD) {
                    sent = true;
                    videoEl.removeEventListener('timeupdate', onTimeUpdate); // Убираем слушатель

                    if (!this._userId) return;

                    try {
                        // Отправляем данные на сервер
                        const res = await fetch(`${API_BASE}/api/streak`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ 
                                userId: this._userId, 
                                videoId: String(videoId) 
                            })
                        });

                        if (res.ok) {
                            const data = await res.json();
                            render(data);
                            
                            // Если только что выполнили цель — показываем конфетти
                            if (data.newlyCompleted && window.showCustomNotification) {
                                window.showCustomNotification(`Цель дня выполнена! Серия: ${data.streak} дн.`, { showConfetti: true });
                            }
                        }
                    } catch (e) {
                        console.warn('Streak update error:', e);
                    }
                }
            };

            videoEl.addEventListener('timeupdate', onTimeUpdate);
        }
    };
})();


// ==========================================
// 🚀 MAIN SCRIPT
// ==========================================

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
    // Красим хедер в черный, чтобы сливалось
    tg.setHeaderColor('#000000');
    tg.setBackgroundColor('#000000');
}


// === УВЕДОМЛЕНИЯ ===
function showCustomNotification(message, options = {}) {
    const { isError = false, showConfetti = false } = options;
    if (document.querySelector('.custom-toast-notification:not(.persistent-banner)')) return;

    const toast = document.createElement('div');
    toast.className = 'custom-toast-notification';
    const avatarUrl = 'assets/avatar.jpg'; // Убедитесь, что путь верный

    toast.innerHTML = `<img src="${avatarUrl}" class="toast-avatar" alt="bot"><span class="toast-message">${message}</span>`;
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
window.showCustomNotification = showCustomNotification; 


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

// === СТИЛИ ===
// Генерируем только то, что нельзя перенести в CSS (динамические пути и т.д.)
// Основные стили теперь в feed.css!
function injectDynamicStyles() {
    const style = document.createElement('style');
    style.textContent = `
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500;700&display=swap');

        /* Скрываем навбар при уведомлении */
        #top-nav-bar {
            transition: transform 0.5s, opacity 0.5s;
        }
        #top-nav-bar.hidden-by-toast { transform: translateX(-50%) translateY(-200%); opacity: 0; pointer-events: none; }
        
        /* === КАПСУЛА СТРИКА === */
        .streak-capsule {
            position: fixed;
            top: 85px; 
            left: 50%;
            transform: translateX(-50%);
            z-index: 99;
            
            /* Фон (без подсветки блока) */
            background: rgba(0, 0, 0, 0.5); 
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.15);
            
            padding: 6px 16px;
            border-radius: 20px;
            
            /* Текст - БЛИННЫЙ (Золотой) */
            color: #ffca28;
            font-family: 'JetBrains Mono', monospace; 
            font-size: 0.9rem;
            font-weight: 700;
            
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s ease;
            box-shadow: 0 4px 10px rgba(0,0,0,0.3);
        }
        .streak-capsule.hidden { opacity: 0; pointer-events: none; }
        
        /* СИЯНИЕ ТЕКСТА (только текст!) */
        .streak-capsule.glowing {
            color: #ffeb3b; 
            border-color: rgba(255, 215, 0, 0.4); 
            
            /* Текстовое свечение */
            text-shadow: 
                0 0 5px rgba(255, 202, 40, 0.8),
                0 0 10px rgba(255, 202, 40, 0.5),
                0 0 20px rgba(255, 140, 0, 0.4);
        }

        /* Шрифт автора */
        .author-name {
            font-family: 'JetBrains Mono', monospace !important;
            font-weight: 700;
        }
        
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

        /* Баннер действий (кнопки да/нет) */
        .banner-actions {
            display: flex; gap: 10px; margin-top: 4px; width: 100%; justify-content: flex-end;
        }
        .banner-btn {
            background: rgba(255,255,255,0.15); border: none; color: white;
            padding: 4px 12px; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 0.85rem;
        }
        .banner-btn:active { background: rgba(255,255,255,0.3); }
        .btn-accept { background: rgba(100, 255, 100, 0.2); color: #aaffaa; }
        
        /* Стили для формы предложки (как настройки) */
        /* Используем классы settings-modal-overlay и settings-panel из feed.css, но для формы */
        #suggest-form-modal .settings-panel {
             height: auto; /* Авто-высота под контент */
             max-height: 80vh;
             padding-bottom: 30px;
        }
        #suggest-form-modal textarea {
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,255,255,0.1);
            color: white;
            padding: 12px;
            border-radius: 12px;
            width: 100%;
            resize: none;
            font-family: inherit;
        }
        #suggest-form-modal input {
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,255,255,0.1);
            color: white;
            padding: 12px;
            border-radius: 12px;
            width: 100%;
            margin-bottom: 12px;
            font-family: inherit;
        }
        .suggest-send-btn {
            margin-top: 15px;
            width: 100%;
            padding: 14px;
            border-radius: 16px;
            background: var(--accent-color);
            color: #000;
            font-weight: 700;
            font-size: 1rem;
        }
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
let settingsWasPlaying = false; 

// === DOM ===
const feedContainer = document.getElementById('feed');
const tabForYou = document.getElementById('tab-foryou');
const tabFollowing = document.getElementById('tab-following');
const indicator = document.getElementById('nav-indicator');
const uiAuthor = document.getElementById('ui-author');
const uiDesc = document.getElementById('ui-desc');
const uiSubBtn = document.getElementById('ui-sub-btn');

// Кнопки и модалки
const uiSettingsBtn = document.getElementById('ui-settings-btn');
const settingsModal = document.getElementById('settings-modal');
const closeSettingsBtn = document.getElementById('close-settings');
const modalVolRange = document.getElementById('modal-vol-range');
const themeSelect = document.getElementById('theme-select'); 

const uiShareBtn = document.getElementById('ui-share-btn');
const uiSuggestBtn = document.getElementById('ui-suggest-btn');

// Предложка теперь тоже модалка
// Создаем DOM для модалки предложки динамически или используем скрытый div, переделанный под шторку
// В вашем HTML был блок .suggest-form, мы его обернем в логику шторки.


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
function updateSubBtnState() {
    if (!currentActiveAuthor) return;
    uiSubBtn.classList.toggle('subscribed', subscribedAuthors.includes(currentActiveAuthor));
}

function updateGlobalUI(videoData) {
    if (uiAuthor) uiAuthor.innerText = `@${videoData.author}`;
    if (uiDesc) uiDesc.innerText = "on tiktok"; // <-- FIX: всегда так
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
        else {
            const filtered = allVideos.filter(v => subscribedAuthors.includes(v.author) && !v.isSecret);
            renderFeed(filtered.slice(0, 5));
        }
    }

    if (tg?.initDataUnsafe?.user) {
        try {
            await fetch(`${API_BASE}/api/subscribe`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: tg.initDataUnsafe.user.id, author: currentActiveAuthor, action })
            });
        } catch (e) { }
    } else {
        localStorage.setItem('subscribedAuthors', JSON.stringify(subscribedAuthors));
    }
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
    allSlides.forEach((slide, index) => {
        if (Math.abs(index - activeIndex) <= 2) loadVideo(slide);
        else unloadVideo(slide);
    });
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

    // === PANCAKE STREAK ATTACH ===
    if (window.PancakeStreak) {
        window.PancakeStreak.attachToVideo(vid, data.id);
    }

    vid.addEventListener('click', () => {
        if (vid.paused) {
            vid.play().catch(e => {});
            bg.play().catch(() => {});
        } else {
            vid.pause();
            bg.pause();
        }
    });

    vid.addEventListener('timeupdate', () => {
        if (vid.duration) fill.style.height = `${(vid.currentTime / vid.duration) * 100}%`;
    });

    let isDragging = false;
    const handle = (y) => {
        const rect = bar.getBoundingClientRect();
        if (vid.duration) {
            vid.currentTime = Math.max(0, Math.min(1, 1 - (y - rect.top) / rect.height)) * vid.duration;
        }
    };
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

            if (hasInteracted) { vid.volume = globalVolume; vid.muted = (globalVolume === 0); }
            else { vid.muted = true; }

            requestAnimationFrame(() => {
                if (vid.paused) {
                    const playPromise = vid.play();
                    if (playPromise !== undefined) {
                        playPromise
                            .then(() => { bg.play().catch(() => {}); })
                            .catch(error => {
                                vid.muted = true;
                                vid.play().catch(e => {});
                                bg.play().catch(() => {});
                            });
                    }
                }
            });
        } else {
            vid.pause();
            bg.pause();
        }
    });
}, { threshold: 0.6 });



function renderFeed(videos, append = false) {
    if (!append) feedContainer.innerHTML = '';
    videos.forEach(v => {
        const s = createSlide(v);
        feedContainer.appendChild(s);
        observer.observe(s);
    });
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

            if (nextBatch.length > 0) renderFeed(nextBatch, true);
            isFetching = false;
        }, 500);
    }
});



// === MODAL UTILS ===
function openModal(modalId) {
    const m = document.getElementById(modalId);
    if (!m) return;

    const activeVid = document.querySelector('.video-slide.active-slide .video-player');
    const activeBg = document.querySelector('.video-slide.active-slide .video-blur-bg');
    settingsWasPlaying = !!(activeVid && !activeVid.paused);

    if (activeVid) activeVid.pause();
    if (activeBg) activeBg.pause();

    m.style.display = 'flex';
    setTimeout(() => m.classList.add('show'), 10);
}

function closeModal(modalId) {
    const m = document.getElementById(modalId);
    if (!m) return;

    m.classList.remove('show');
    setTimeout(() => {
        m.style.display = 'none';

        const activeVid = document.querySelector('.video-slide.active-slide .video-player');
        const activeBg = document.querySelector('.video-slide.active-slide .video-blur-bg');

        if (settingsWasPlaying) {
            if (activeVid) activeVid.play().catch(()=>{});
            if (activeBg) activeBg.play().catch(()=>{});
        }
    }, 300);
}



// === SETTINGS UI ===
if (uiSettingsBtn && settingsModal) {
    uiSettingsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openModal('settings-modal');
    });
}

if (closeSettingsBtn && settingsModal) {
    closeSettingsBtn.addEventListener('click', () => closeModal('settings-modal'));
    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) closeModal('settings-modal');
    });
}

if (modalVolRange) {
    modalVolRange.value = globalVolume;
    modalVolRange.addEventListener('input', (e) => {
        globalVolume = parseFloat(e.target.value);
        localStorage.setItem('niko_volume', globalVolume);

        const v = document.querySelector('.video-slide.active-slide .video-player');
        if (v) { v.volume = globalVolume; v.muted = (globalVolume === 0); }
    });
}



// === ПРЕДЛОЖКА (Новая - Шторка) ===
function createSuggestModal() {
    if (document.getElementById('suggest-form-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'suggest-form-modal';
    modal.className = 'settings-modal-overlay';
    modal.innerHTML = `
        <div class="settings-panel">
            <div class="settings-header">
                <h2>Предложить видео</h2>
                <button id="close-suggest"><i class="fas fa-times"></i></button>
            </div>
            <div style="padding-bottom: 20px;">
                <input id="sug-url" type="url" placeholder="Ссылка на видео (TikTok/YouTube)">
                <input id="sug-author" type="text" placeholder="Автор (необязательно)">
                <textarea id="sug-desc" placeholder="Комментарий или описание..." rows="3"></textarea>
                <button id="sug-send" class="suggest-send-btn">Отправить</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('close-suggest').addEventListener('click', () => closeModal('suggest-form-modal'));
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal('suggest-form-modal'); });

    document.getElementById('sug-send').addEventListener('click', async () => {
        const urlInput = document.getElementById('sug-url');
        const authorInput = document.getElementById('sug-author');
        const descInput = document.getElementById('sug-desc');
        const btn = document.getElementById('sug-send');

        const url = urlInput.value.trim();
        const author = authorInput.value.trim();
        const desc = descInput.value.trim();

        if (!url) { showCustomNotification('Нужна ссылка!', { isError: true }); return; }

        const originalText = btn.innerText;
        btn.innerText = 'Отправка...';
        btn.disabled = true;

        try {
            const res = await fetch(`${API_BASE}/api/suggest`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url, author, desc, user: tg?.initDataUnsafe?.user })
            });

            if (res.ok) {
                showCustomNotification('Спасибо за видео!', { showConfetti: true });
                urlInput.value = ''; authorInput.value = ''; descInput.value = '';
                closeModal('suggest-form-modal');
            } else {
                showCustomNotification('Ошибка сервера.', { isError: true });
            }
        } catch (e) {
            showCustomNotification('Ошибка сети.', { isError: true });
        } finally {
            btn.innerText = originalText;
            btn.disabled = false;
        }
    });
}

createSuggestModal();

if (uiSuggestBtn) {
    uiSuggestBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const oldForm = document.getElementById('suggest-form');
        if (oldForm) oldForm.style.display = 'none';
        openModal('suggest-form-modal');
    });
}



// === SHARE ===
if (uiShareBtn) {
    uiShareBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const data = getActiveSlideData();
        if (!data) return;

        if (!tg?.initDataUnsafe?.user) {
            navigator.clipboard.writeText(data.videoUrl)
                .then(() => { showCustomNotification('Ссылка скопирована!', { showConfetti: true }); })
                .catch(() => {});
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
                    desc: "on tiktok", // <-- FIX: всегда так
                    user: tg.initDataUnsafe.user
                })
            });
            showCustomNotification('Видео отправлено в ЛС!', { showConfetti: true });
        } catch (e) {
            showCustomNotification('Ошибка сети.', { isError: true });
        }
    });
}



// === МЕНЕДЖЕР ТЕМ ===
function loadThemeScript(url, callback) {
    if (document.querySelector(`script[src="${url}"]`)) {
        if (callback) callback();
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
        } else {
            showWinterBanner(data.version);
        }
    } catch (e) {
        console.error('Theme check failed', e);
    }
}

function showWinterBanner(version) {
    if (document.querySelector('.persistent-banner')) return;

    const banner = document.createElement('div');
    banner.className = 'custom-toast-notification persistent-banner';
    const avatarUrl = 'assets/avatar.jpg';

    banner.innerHTML = `
        <img src="${avatarUrl}" class="toast-avatar" alt="bot-avatar">
        <div class="toast-message" style="display:flex; flex-direction:column; gap:4px; width:100%;">
            <span style="font-weight:bold;">Включить снег?</span>
            <span style="font-size:0.8em; opacity:0.8;">Новый год близко!</span>
            <div class="banner-actions">
                <button class="banner-btn btn-accept">Да</button>
                <button class="banner-btn btn-decline">Нет</button>
            </div>
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

if (themeSelect) {
    themeSelect.addEventListener('change', (e) => applyTheme(e.target.value));
}



// === СТИЛИ ===
function injectDynamicStyles() {
    const style = document.createElement('style');
    style.textContent = `
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500;700&display=swap');

        #streak-badge-container {
            font-family: 'JetBrains Mono', monospace;
        }
    `;
    document.head.appendChild(style);
}



// === INIT ===
window.addEventListener('load', async () => {
    injectDynamicStyles();

    if (window.PancakeStreak) await window.PancakeStreak.init();

    if (modalVolRange) modalVolRange.value = globalVolume;
    await loadVideosOnce();
    await syncSubs();
    checkThemes();
    updateInd(tabForYou);

    let targetId = null;

    if (tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param) {
        const param = tg.initDataUnsafe.start_param;
        if (param.startsWith('v_')) targetId = param.replace('v_', '');
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
