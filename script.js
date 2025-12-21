// === KONFIG ===
const API_BASE = 'https://niko-feed.vercel.app'; 
const BATCH_SIZE = 5; 

// 👇 ПРАВИЛЬНАЯ ССЫЛКА НА БОТА
const BOT_LINK = 'https://t.me/oneshotfeedbot/app'; 

// === 0. TELEGRAM WEB APP & REDIRECT ===
const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;

// === 🚨 АВТО-РЕДИРЕКТ 🚨 ===
const isTelegramUser = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;

if (!isTelegramUser) {
    // 👇 ЗАКОММЕНТИРУЙ ЭТУ СТРОКУ, ЕСЛИ ХОЧЕШЬ ТЕСТИТЬ В БРАУЗЕРЕ БЕЗ РЕДИРЕКТА !!!
    window.location.href = BOT_LINK; 
    
    // Показываем кнопку "Открыть в Telegram", если редирект отключен
    const redirectBanner = document.getElementById('disable-redirect-banner');
    if (redirectBanner) redirectBanner.classList.add('show');
}

if (tg) {
    tg.expand();
    tg.ready();
}

const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx;

// === 1. ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ===
let subscribedAuthors = [];
let hasInteracted = false;
let globalVolume = parseFloat(localStorage.getItem('niko_volume') || '1.0');

// ГЛАВНЫЕ МАССИВЫ (КЭШ)
let allVideosCache = []; 
let queue = [];          

let currentTab = 'foryou';
let currentActiveAuthor = null;

// DOM Elements
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

// Баннер (если редирект отключен)
if (!isTelegramUser && document.getElementById('disable-redirect-btn')) {
    document.getElementById('disable-redirect-btn').addEventListener('click', () => {
        document.getElementById('disable-redirect-banner').classList.remove('show');
    });
}

// === 2. ЗАГРУЗКА ВИДЕО (Smart Fetch) ===
async function fetchVideos(isUpdate = false) {
    let newVideos = [];
    
    // 1. Запрос к базе
    try {
        const res = await fetch(`${API_BASE}/api/get_feed`);
        if (res.ok) {
            newVideos = await res.json();
        }
    } catch (e) { console.error('DB Fetch error:', e); return; }

    // 2. Фолбэк на локальный файл (ПУТЬ ИСПРАВЛЕН: 'videos.json' вместо 'public/videos.json')
    if (newVideos.length === 0 && allVideosCache.length === 0 && !isUpdate) {
        try {
            const res = await fetch('videos.json');
            if (res.ok) newVideos = await res.json();
        } catch (e) {}
    }

    if (newVideos.length === 0) return;

    // 3. Слияние с кэшем
    const currentIds = new Set(allVideosCache.map(v => v.id));
    const freshContent = newVideos.filter(v => !currentIds.has(v.id));

    if (freshContent.length > 0) {
        console.log(`🔥 Прилетело ${freshContent.length} новых видео!`);
        allVideosCache = [...freshContent, ...allVideosCache];
        queue.unshift(...freshContent);
        
        if (isUpdate && feedContainer.children.length < 3) {
            addVideosToDom(BATCH_SIZE);
        }
    } else if (!isUpdate) {
        allVideosCache = newVideos;
    }
}

// === 3. УПРАВЛЕНИЕ ЛЕНТОЙ ===
function prepareQueue(type) {
    let source = [];
    if (type === 'foryou') {
        source = [...allVideosCache];
    } else {
        source = allVideosCache.filter(v => subscribedAuthors.includes(v.author));
    }

    if (source.length === 0) return;

    queue = shuffle(source);
    feedContainer.innerHTML = '';
    addVideosToDom(BATCH_SIZE);
}

function addVideosToDom(count) {
    if (queue.length < count) {
        let refill = [...allVideosCache];
        if (currentTab === 'following') {
            refill = refill.filter(v => subscribedAuthors.includes(v.author));
        }
        if (refill.length > 0) {
            queue.push(...shuffle(refill));
        }
    }

    const chunk = queue.splice(0, count);

    chunk.forEach(v => {
        const slide = createSlide(v);
        feedContainer.appendChild(slide);
        observer.observe(slide);
    });

    const allSlides = document.querySelectorAll('.video-slide');
    if (allSlides.length > 15) {
        for (let i = 0; i < 5; i++) {
             if (allSlides[i]) {
                 observer.unobserve(allSlides[i]);
                 allSlides[i].remove();
             }
        }
    }
}

// === 4. ПОДПИСКИ ===
async function syncSubs() {
    const local = JSON.parse(localStorage.getItem('subscribedAuthors'));
    if (local) subscribedAuthors = local;

    if (tg?.initDataUnsafe?.user) {
        try {
            const res = await fetch(`${API_BASE}/api/get_subs`, {
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: tg.initDataUnsafe.user.id })
            });
            const data = await res.json();
            if (data.subs) {
                subscribedAuthors = data.subs;
                localStorage.setItem('subscribedAuthors', JSON.stringify(subscribedAuthors));
                updateSubBtnState();
            }
        } catch (e) {}
    }
}

// === 5. СОЗДАНИЕ СЛАЙДОВ (FIXED REFERER) ===
function createSlide(data) {
    const slide = document.createElement('div');
    slide.className = 'video-slide';
    slide.dataset.jsonData = JSON.stringify(data);
    const poster = data.cover ? `poster="${data.cover}"` : '';

    slide.innerHTML = `
        <video class="video-blur-bg" loop muted playsinline referrerpolicy="no-referrer" src="${data.videoUrl}"></video>
        <div class="video-wrapper">
            <video class="video-player" ${poster} loop muted playsinline referrerpolicy="no-referrer" src="${data.videoUrl}"></video>
            <div class="video-progress-container">
                <div class="video-progress-fill"></div>
            </div>
            <div class="video-error-msg" style="display:none; position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); text-align:center; color:white; font-family:sans-serif;">
                ⚠️ Ошибка<br><span style="font-size:12px; opacity:0.7">Нажми, чтобы повторить</span>
            </div>
        </div>`;
        
    const vid = slide.querySelector('.video-player');
    const bg = slide.querySelector('.video-blur-bg');
    const fill = slide.querySelector('.video-progress-fill');
    const bar = slide.querySelector('.video-progress-container');
    const errMsg = slide.querySelector('.video-error-msg');

    vid.addEventListener('error', () => {
        if (!vid.dataset.retried) {
             vid.dataset.retried = "true";
             const sep = data.videoUrl.includes('?') ? '&' : '?';
             const retryUrl = `${data.videoUrl}${sep}t=${Date.now()}`;
             vid.src = retryUrl;
             bg.src = retryUrl;
        } else {
             errMsg.style.display = 'block';
        }
    });

    const togglePlay = () => {
        if (errMsg.style.display === 'block') {
            vid.src = vid.src; 
            errMsg.style.display = 'none';
            return;
        }
        if (vid.paused) { vid.play(); bg.play(); } else { vid.pause(); bg.pause(); }
    };
    vid.parentElement.addEventListener('click', togglePlay);
    
    vid.addEventListener('timeupdate', () => { if (vid.duration) fill.style.height = `${(vid.currentTime/vid.duration)*100}%`; });
    
    let isDragging = false;
    const handle = (y) => {
        const rect = bar.getBoundingClientRect();
        vid.currentTime = Math.max(0, Math.min(1, 1 - (y - rect.top)/rect.height)) * vid.duration;
    };
    const start = (e) => { e.preventDefault(); e.stopPropagation(); isDragging=true; handle(e.touches?e.touches[0].clientY:e.clientY); };
    const move = (e) => { if(isDragging) { e.preventDefault(); e.stopPropagation(); handle(e.touches?e.touches[0].clientY:e.clientY); } };
    const end = () => isDragging=false;
    
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
        
        if (entry.isIntersecting) {
            document.querySelectorAll('.video-slide').forEach(s => s.classList.remove('active-slide'));
            slide.classList.add('active-slide');
            
            try { updateGlobalUI(JSON.parse(slide.dataset.jsonData)); } catch (e) {}

            if (hasInteracted) { 
                vid.volume = globalVolume; 
                vid.muted = (globalVolume === 0); 
            } else { 
                vid.muted = true; 
            }
            
            vid.play().then(() => bg.play()).catch(() => { vid.muted=true; vid.play(); bg.play(); });

            const allSlides = Array.from(document.querySelectorAll('.video-slide'));
            const index = allSlides.indexOf(slide);
            if (allSlides.length - index < 3) {
                addVideosToDom(BATCH_SIZE);
            }
        } else {
            vid.pause();
            bg.pause();
        }
    });
}, { threshold: 0.6 });

// === 6. UI HELPERS ===
function updateSubBtnState() {
    if (!currentActiveAuthor) return;
    uiSubBtn.classList.toggle('subscribed', subscribedAuthors.includes(currentActiveAuthor));
}
function updateGlobalUI(data) {
    if (uiAuthor) uiAuthor.innerText = data.author || '@unknown';
    if (uiDesc) uiDesc.innerText = data.desc || '';
    currentActiveAuthor = data.author;
    updateSubBtnState();
}
function unlockAudioContext(e) {
    if (e) e.stopPropagation();
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    
    const overlay = document.getElementById('audio-unlock-overlay');
    if (overlay) { 
        overlay.classList.add('hidden'); 
        setTimeout(() => overlay.remove(), 500); 
    }
    hasInteracted = true;
    const v = document.querySelector('.active-slide .video-player');
    if (v) { v.muted = false; v.volume = globalVolume; }
}
function updateInd(tab) {
    if (!tab) return;
    indicator.style.width = `${tab.offsetWidth}px`;
    indicator.style.transform = `translateX(${tab.offsetLeft}px)`;
}
function shuffle(arr) { return arr.sort(() => Math.random() - 0.5); }

// Event Listeners
const overlayEl = document.getElementById('audio-unlock-overlay');
if (overlayEl) overlayEl.addEventListener('click', unlockAudioContext);

tabForYou.addEventListener('click', () => {
    currentTab = 'foryou';
    tabForYou.classList.add('active'); tabFollowing.classList.remove('active');
    updateInd(tabForYou);
    prepareQueue('foryou');
});

tabFollowing.addEventListener('click', () => {
    if (subscribedAuthors.length === 0) return;
    currentTab = 'following';
    tabFollowing.classList.add('active'); tabForYou.classList.remove('active');
    updateInd(tabFollowing);
    prepareQueue('following');
});

uiSubBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!currentActiveAuthor) return;
    const isSub = subscribedAuthors.includes(currentActiveAuthor);
    const action = isSub ? 'remove' : 'add';
    if (action === 'add') subscribedAuthors.push(currentActiveAuthor);
    else subscribedAuthors = subscribedAuthors.filter(a => a !== currentActiveAuthor);
    updateSubBtnState();
    localStorage.setItem('subscribedAuthors', JSON.stringify(subscribedAuthors));
    if (tg?.initDataUnsafe?.user) {
        fetch(`${API_BASE}/api/subscribe`, { method: 'POST', body: JSON.stringify({ userId: tg.initDataUnsafe.user.id, author: currentActiveAuthor, action }) }).catch(()=>{});
    }
});

uiVolBtn.addEventListener('click', (e) => { e.stopPropagation(); uiVolCont.classList.toggle('active'); });
uiVolRange.addEventListener('input', (e) => { 
    e.stopPropagation(); globalVolume = parseFloat(e.target.value); 
    localStorage.setItem('niko_volume', globalVolume);
    const v = document.querySelector('.active-slide .video-player'); if(v) { v.volume = globalVolume; v.muted = (globalVolume === 0); } 
});

if (uiSuggestBtn && suggestForm) {
    uiSuggestBtn.addEventListener('click', (e) => { e.stopPropagation(); suggestForm.style.display = (suggestForm.style.display==='flex')?'none':'flex'; });
}
if (sugBtn) {
    sugBtn.addEventListener('click', async () => {
        const url = sugUrl.value.trim();
        const author = sugAuthor.value.trim();
        const desc = sugDesc.value.trim();
        if (!url) { tg?.showAlert('Вставь ссылку!'); return; }
        sugBtn.innerText = '...'; sugBtn.disabled = true;
        try {
            const res = await fetch(`${API_BASE}/api/suggest`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ url, author, desc, user: tg?.initDataUnsafe?.user }) });
            if (res.ok) { sugBtn.innerText='Отправлено!'; setTimeout(() => { suggestForm.style.display='none'; sugBtn.innerText='Отправить'; sugBtn.disabled=false; }, 1000); }
            else { tg?.showAlert('Ошибка'); sugBtn.innerText='Отправить'; sugBtn.disabled=false; }
        } catch (e) { tg?.showAlert('Сбой сети'); sugBtn.innerText='Отправить'; sugBtn.disabled=false; }
    });
}
if (uiShareBtn) {
    uiShareBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const data = document.querySelector('.active-slide')?.dataset.jsonData;
        if (!data) return;
        const v = JSON.parse(data);
        if (!tg?.initDataUnsafe?.user) { navigator.clipboard.writeText(v.videoUrl); alert('Ссылка скопирована!'); return; }
        try {
            const res = await fetch(`${API_BASE}/api/share`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ videoUrl: v.videoUrl, author: v.author, desc: v.desc, user: tg.initDataUnsafe.user }) });
            if (res.ok) tg.showPopup({title:'Готово', message:'Видео отправлено ботом', buttons:[{type:'ok'}]});
        } catch(e) { tg.showAlert('Ошибка сети'); }
    });
}

// === INIT ===
window.addEventListener('load', async () => {
    if(uiVolRange) uiVolRange.value = globalVolume;
    
    await fetchVideos(false); 
    await syncSubs(); 
    
    updateInd(tabForYou);
    prepareQueue('foryou');
    
    setInterval(() => fetchVideos(true), 60000);
});
