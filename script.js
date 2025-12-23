// === KONFIG ===
const API_BASE = ''; 
const BATCH_SIZE = 5; 
const BOT_LINK = 'https://t.me/oneshotfeedbot'; 
const ADMIN_CODE_KEY = 'admin_bypass_token'; 
const SESSION_DURATION = 5 * 60 * 1000; 

// === 0. TELEGRAM WEB APP ===
const tg = window.Telegram?.WebApp || null;
const isTelegramUser = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;

if (!isTelegramUser) {
    document.getElementById('disable-redirect-banner')?.classList.add('show');
}
if (tg) { tg.expand(); tg.ready(); }

// === 1. GLOBAL VARS ===
let subscribedAuthors = [];
let hasInteracted = false;
let globalMuted = localStorage.getItem('niko_muted') === 'true'; // Сохраняем состояние звука
let globalVolume = 1.0;

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
const uiVolBtn = document.getElementById('ui-vol-btn'); // Кнопка звука
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
        return (Date.now() - payload.ts < SESSION_DURATION);
    } catch (e) { return false; }
}

// === 3. ЗАГРУЗКА ВИДЕО ===
async function fetchVideos(isUpdate = false) {
    try {
        const res = await fetch(`${API_BASE}/api/get_feed`);
        const data = await res.json();

        if (data.maintenance && !isTokenValid()) {
            if (!window.location.pathname.includes('maintenance.html')) {
                window.location.href = 'maintenance.html';
            }
            return;
        }

        if (data.videos) {
            const currentIds = new Set(allVideosCache.map(v => v.id));
            const fresh = data.videos.filter(v => v && !currentIds.has(v.id));

            if (fresh.length > 0) {
                allVideosCache = [...fresh, ...allVideosCache];
                if (!isUpdate) prepareQueue(currentTab);
            }
        }
    } catch (e) { console.error("Ошибка загрузки:", e); }
}

// === 4. ОЧЕРЕДЬ И РЕНДЕР ===
function prepareQueue(type) {
    let source = (type === 'foryou') 
        ? [...allVideosCache] 
        : allVideosCache.filter(v => subscribedAuthors.includes(v.author));
    
    queue = source.sort(() => Math.random() - 0.5);
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

function createSlide(data) {
    const slide = document.createElement('div');
    slide.className = 'video-slide';
    slide.dataset.jsonData = JSON.stringify(data);
    
    slide.innerHTML = `
        <video class="video-blur-bg" loop muted playsinline src="${data.videoUrl}"></video>
        <div class="video-wrapper">
            <video class="video-player" loop playsinline poster="${data.cover || ''}" src="${data.videoUrl}"></video>
            <div class="video-progress-container"><div class="video-progress-fill"></div></div>
        </div>`;
        
    const vid = slide.querySelector('.video-player');
    const bg = slide.querySelector('.video-blur-bg');
    const fill = slide.querySelector('.video-progress-fill');

    vid.addEventListener('timeupdate', () => { 
        if(vid.duration) fill.style.height=`${(vid.currentTime/vid.duration)*100}%`;
    });

    slide.addEventListener('click', () => {
        if (vid.paused) { vid.play(); bg.play(); } 
        else { vid.pause(); bg.pause(); }
    });
    
    return slide;
}

// === 5. АВТОПЛЕЙ И UI ===
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        const slide = entry.target;
        const vid = slide.querySelector('.video-player');
        const bg = slide.querySelector('.video-blur-bg');
        
        if (entry.isIntersecting) {
            slide.classList.add('active-slide');
            const data = JSON.parse(slide.dataset.jsonData);
            updateGlobalUI(data);

            vid.currentTime = 0;
            updateVolumeForVideo(vid);
            
            vid.play().then(() => bg.play()).catch(() => {
                vid.muted = true; vid.play();
            });

            if (!slide.nextElementSibling) addVideosToDom(BATCH_SIZE);
        } else {
            vid.pause(); bg.pause();
            slide.classList.remove('active-slide');
        }
    });
}, { threshold: 0.6 });

function updateGlobalUI(data) {
    uiAuthor.innerText = `@${data.author}`;
    uiDesc.innerText = data.desc || '';
    currentActiveAuthor = data.author;
    uiSubBtn.classList.toggle('subscribed', subscribedAuthors.includes(data.author));
}

function updateVolumeForVideo(vid) {
    if (!hasInteracted || globalMuted) {
        vid.muted = true;
    } else {
        vid.muted = false;
        vid.volume = 1.0;
    }
}

// === 6. ОБРАБОТЧИКИ КНОПОК ===

// ЗВУК (ВКЛ/ВЫКЛ)
uiVolBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    globalMuted = !globalMuted;
    localStorage.setItem('niko_muted', globalMuted);
    
    const icon = uiVolBtn.querySelector('i');
    icon.className = globalMuted ? 'fas fa-volume-mute' : 'fas fa-volume-up';

    const activeVid = document.querySelector('.active-slide .video-player');
    if (activeVid) updateVolumeForVideo(activeVid);
});

// ПРЕДЛОЖКА (ОТКРЫТЬ/ЗАКРЫТЬ)
uiSuggestBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    suggestForm.style.display = (suggestForm.style.display === 'flex') ? 'none' : 'flex';
});

// ПРЕДЛОЖКА (ОТПРАВИТЬ)
sugBtn.addEventListener('click', async () => {
    const url = sugUrl.value.trim();
    if (!url) { tg?.showAlert('Вставь ссылку!'); return; }
    
    sugBtn.innerText = '...';
    sugBtn.disabled = true;

    try {
        const res = await fetch(`${API_BASE}/api/suggest`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                url, 
                author: sugAuthor.value, 
                desc: sugDesc.value, 
                user: tg?.initDataUnsafe?.user
            })
        });
        if (res.ok) {
            tg?.showPopup({ message: 'Видео отправлено!' });
            suggestForm.style.display = 'none';
            sugUrl.value = ''; sugAuthor.value = ''; sugDesc.value = '';
        } else {
            tg?.showAlert('Ошибка (возможно, спам-фильтр)');
        }
    } catch (e) { tg?.showAlert('Ошибка сети'); }
    sugBtn.innerText = 'Отправить';
    sugBtn.disabled = false;
});

// SHARE
uiShareBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const activeSlide = document.querySelector('.active-slide');
    if (!activeSlide) return;
    const v = JSON.parse(activeSlide.dataset.jsonData);
    
    try {
        await fetch(`${API_BASE}/api/share`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ ...v, user: tg?.initDataUnsafe?.user })
        });
        tg?.showPopup({ message: 'Видео отправлено в бот!' });
    } catch(e) { tg?.showAlert('Ошибка'); }
});

// ПОДПИСКА
uiSubBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!currentActiveAuthor) return;
    const idx = subscribedAuthors.indexOf(currentActiveAuthor);
    if (idx > -1) subscribedAuthors.splice(idx, 1);
    else subscribedAuthors.push(currentActiveAuthor);
    
    localStorage.setItem('subscribedAuthors', JSON.stringify(subscribedAuthors));
    uiSubBtn.classList.toggle('subscribed');
});

// ПЕРЕКЛЮЧЕНИЕ ВКЛАДОК
tabForYou.addEventListener('click', () => {
    currentTab = 'foryou';
    tabForYou.classList.add('active'); tabFollowing.classList.remove('active');
    indicator.style.transform = `translateX(${tabForYou.offsetLeft}px)`;
    prepareQueue('foryou');
});
tabFollowing.addEventListener('click', () => {
    currentTab = 'following';
    tabFollowing.classList.add('active'); tabForYou.classList.remove('active');
    indicator.style.transform = `translateX(${tabFollowing.offsetLeft}px)`;
    prepareQueue('following');
});

// СТАРТ
document.getElementById('audio-unlock-overlay').addEventListener('click', () => {
    hasInteracted = true;
    document.getElementById('audio-unlock-overlay').remove();
    const v = document.querySelector('.active-slide .video-player');
    if (v) updateVolumeForVideo(v);
});

window.addEventListener('load', () => {
    const saved = localStorage.getItem('subscribedAuthors');
    if (saved) subscribedAuthors = JSON.parse(saved);
    
    // Устанавливаем иконку звука при загрузке
    const icon = uiVolBtn.querySelector('i');
    if (icon) icon.className = globalMuted ? 'fas fa-volume-mute' : 'fas fa-volume-up';

    fetchVideos();
});