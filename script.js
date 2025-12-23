// === KONFIG ===
const API_BASE = ''; 
const BATCH_SIZE = 5; 
const BOT_LINK = 'https://t.me/oneshotfeedbot'; 
const ADMIN_CODE_KEY = 'admin_bypass_token'; 
const SESSION_DURATION = 5 * 60 * 1000; 

// === 0. TELEGRAM WEB APP ===
const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
const isTelegramUser = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;

if (!isTelegramUser) {
    const redirectBanner = document.getElementById('disable-redirect-banner');
    if (redirectBanner) redirectBanner.classList.add('show');
}
if (tg) { tg.expand(); tg.ready(); }

const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx;

// === 1. GLOBAL VARS ===
let subscribedAuthors = [];
let hasInteracted = false;
let globalVolume = parseFloat(localStorage.getItem('niko_volume') || '1.0');

let allVideosCache = []; 
let queue = [];          
let currentTab = 'foryou';
let currentActiveAuthor = null;

// DOM ELEMENTS
const feedContainer = document.getElementById('feed');
const tabForYou = document.getElementById('tab-foryou');
const tabFollowing = document.getElementById('tab-following');
const indicator = document.getElementById('nav-indicator');
const uiAuthor = document.getElementById('ui-author');
const uiDesc = document.getElementById('ui-desc');
const uiSubBtn = document.getElementById('ui-sub-btn');
const uiVolBtn = document.getElementById('ui-vol-btn');
const uiVolCont = document.getElementById('ui-vol-cont');
const uiVolRange = document.getElementById('ui-vol-range');
const uiShareBtn = document.getElementById('ui-share-btn');
const uiSuggestBtn = document.getElementById('ui-suggest-btn');
const suggestForm = document.getElementById('suggest-form');
const sugUrl = document.getElementById('sug-url');
const sugAuthor = document.getElementById('sug-author');
const sugDesc = document.getElementById('sug-desc');
const sugBtn = document.getElementById('sug-send');

// === 2. AUTH CHECK ===
function isTokenValid() {
    const token = localStorage.getItem(ADMIN_CODE_KEY);
    if (!token) return false;
    try {
        const payload = JSON.parse(atob(token));
        if (Date.now() - payload.ts < SESSION_DURATION) return true;
    } catch (e) {}
    localStorage.removeItem(ADMIN_CODE_KEY);
    return false;
}

// === 3. ЗАГРУЗКА ДАННЫХ ===
async function fetchVideos(isUpdate = false) {
    try {
        const res = await fetch(`${API_BASE}/api/get_feed`);
        if (!res.ok) return;
        const data = await res.json();

        // Проверка техработ
        if (data.maintenance === true && !isTokenValid()) {
            if (!window.location.pathname.includes('maintenance.html')) {
                window.location.href = 'maintenance.html';
            }
            return;
        }

        // Обработка списка видео из Redis
        let newVideos = data.videos || [];

        if (newVideos.length === 0) return;

        // Обновляем кеш
        const currentIds = new Set(allVideosCache.map(v => v.id));
        const freshContent = newVideos.filter(v => v && !currentIds.has(v.id));

        if (freshContent.length > 0) {
            allVideosCache = [...freshContent, ...allVideosCache];
            // Если это фоновое обновление - просто добавляем в начало, если нет - чистим и рендерим
            if (!isUpdate) {
                prepareQueue(currentTab);
            }
        }
    } catch (e) {
        console.error('Ошибка API:', e);
    }
}

// === 4. ЛЕНТА И ОЧЕРЕДЬ ===
function prepareQueue(type) {
    let source = [];
    if (type === 'foryou') source = [...allVideosCache];
    else source = allVideosCache.filter(v => subscribedAuthors.includes(v.author));
    
    if (source.length === 0 && type === 'following') {
        feedContainer.innerHTML = '<div style="padding:20px;text-align:center;">Вы еще ни на кого не подписаны</div>';
        return;
    }

    queue = shuffle(source);
    feedContainer.innerHTML = '';
    addVideosToDom(BATCH_SIZE);
}

function addVideosToDom(count) {
    const chunk = queue.splice(0, count);
    chunk.forEach(v => {
        const slide = createSlide(v);
        feedContainer.appendChild(slide);
        observer.observe(slide);
    });
}

// === 5. СОЗДАНИЕ СЛАЙДА ===
function createSlide(data) {
    const slide = document.createElement('div');
    slide.className = 'video-slide';
    slide.dataset.jsonData = JSON.stringify(data);
    
    const poster = data.cover ? `poster="${data.cover}"` : '';

    slide.innerHTML = `
        <video class="video-blur-bg" loop muted playsinline src="${data.videoUrl}"></video>
        <div class="video-wrapper">
            <video class="video-player" ${poster} loop playsinline src="${data.videoUrl}"></video>
            <div class="video-progress-container"><div class="video-progress-fill"></div></div>
            <div class="video-status-msg" style="display:none; position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); color:white; background:rgba(0,0,0,0.6); padding:10px 20px; border-radius:12px; z-index:5;">Восстанавливаем...</div>
        </div>`;
        
    const vid = slide.querySelector('.video-player');
    const bg = slide.querySelector('.video-blur-bg');
    const fill = slide.querySelector('.video-progress-fill');
    const bar = slide.querySelector('.video-progress-container');

    vid.dataset.userPaused = "false";

    // Обработка клика (Пауза/Плей)
    vid.parentElement.addEventListener('click', () => {
        if (vid.paused) {
            vid.dataset.userPaused = "false";
            vid.play(); bg.play();
        } else {
            vid.dataset.userPaused = "true";
            vid.pause(); bg.pause();
        }
    });

    // Прогресс-бар
    vid.addEventListener('timeupdate', () => { 
        if(vid.duration) fill.style.height=`${(vid.currentTime/vid.duration)*100}%`;
    });

    // Перемотка кликом по полоске
    bar.addEventListener('click', (e) => {
        e.stopPropagation();
        const rect = bar.getBoundingClientRect();
        const pct = 1 - (e.clientY - rect.top) / rect.height;
        vid.currentTime = pct * vid.duration;
    });
    
    return slide;
}

// === 6. Intersection Observer (Автоплей) ===
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        const slide = entry.target;
        const vid = slide.querySelector('.video-player');
        const bg = slide.querySelector('.video-blur-bg');
        
        if (entry.isIntersecting) {
            document.querySelectorAll('.video-slide').forEach(s => s.classList.remove('active-slide'));
            slide.classList.add('active-slide');
            
            const data = JSON.parse(slide.dataset.jsonData);
            updateGlobalUI(data);

            vid.currentTime = 0;
            vid.volume = globalVolume;
            vid.muted = !hasInteracted || (globalVolume === 0);
            
            vid.play().then(() => bg.play()).catch(() => {
                vid.muted = true;
                vid.play();
            });

            // Подгрузка при скролле
            if (!slide.nextElementSibling) addVideosToDom(BATCH_SIZE);
        } else {
            vid.pause();
            bg.pause();
        }
    });
}, { threshold: 0.6 });

// === 7. UI & Взаимодействие ===
function updateGlobalUI(data) {
    uiAuthor.innerText = data.author || '@unknown';
    uiDesc.innerText = data.desc || '';
    currentActiveAuthor = data.author;
    uiSubBtn.classList.toggle('subscribed', subscribedAuthors.includes(currentActiveAuthor));
}

function unlockAudioContext() {
    hasInteracted = true;
    const overlay = document.getElementById('audio-unlock-overlay');
    if (overlay) overlay.remove();
    const activeVid = document.querySelector('.active-slide .video-player');
    if (activeVid) { activeVid.muted = false; activeVid.volume = globalVolume; }
}

function shuffle(arr) { return [...arr].sort(() => Math.random() - 0.5); }

// Обработчики событий
document.getElementById('audio-unlock-overlay')?.addEventListener('click', unlockAudioContext);

tabForYou.addEventListener('click', () => {
    currentTab = 'foryou';
    tabForYou.classList.add('active'); tabFollowing.classList.remove('active');
    prepareQueue('foryou');
});

tabFollowing.addEventListener('click', () => {
    currentTab = 'following';
    tabFollowing.classList.add('active'); tabForYou.classList.remove('active');
    prepareQueue('following');
});

uiVolRange.addEventListener('input', (e) => {
    globalVolume = parseFloat(e.target.value);
    localStorage.setItem('niko_volume', globalVolume);
    const v = document.querySelector('.active-slide .video-player');
    if (v) v.volume = globalVolume;
});

// Кнопка Share
uiShareBtn.addEventListener('click', async () => {
    const activeSlide = document.querySelector('.active-slide');
    if (!activeSlide) return;
    const v = JSON.parse(activeSlide.dataset.jsonData);
    
    if (!tg?.initDataUnsafe?.user) {
        navigator.clipboard.writeText(v.videoUrl);
        alert('Ссылка скопирована!');
        return;
    }

    try {
        await fetch(`${API_BASE}/api/share`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ ...v, user: tg.initDataUnsafe.user })
        });
        tg.showPopup({title: 'Готово', message: 'Видео отправлено в бот'});
    } catch(e) { tg.showAlert('Ошибка'); }
});

// Инициализация
window.addEventListener('load', async () => {
    if (uiVolRange) uiVolRange.value = globalVolume;
    await fetchVideos();
    // Синхронизация подписок (упрощенно)
    const localSubs = localStorage.getItem('subscribedAuthors');
    if (localSubs) subscribedAuthors = JSON.parse(localSubs);
});