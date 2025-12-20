// === KONFIG ===
const API_BASE = 'https://niko-feed.vercel.app'; 

// === 0. TELEGRAM WEB APP ===
const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;

// === ПРОВЕРКА TELEGRAM + ПЕРЕНАПРАВЛЕНИЕ ===
const isTelegram = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
const redirectBanner = document.getElementById('disable-redirect-banner');
const disableBtn = document.getElementById('disable-redirect-btn');

// Если НЕ в Telegram — показываем плашку и редиректим через 3 сек
if (!isTelegram && localStorage.getItem('disableRedirect') !== 'true') {
    redirectBanner.classList.add('show');
    
    // Редирект через 3 секунды
    //SetTimeout(() => {
        //window.location.href = 'https://t.me/oneshotfeedbot';
    //}, 3000);
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
let globalVolume = 1.0;
let currentTab = 'foryou';
let currentActiveAuthor = null;
let allVideos = [];

// DOM Элементы
const feedContainer = document.getElementById('feed');
const tabForYou = document.getElementById('tab-foryou');
const tabFollowing = document.getElementById('tab-following');
const indicator = document.getElementById('nav-indicator');
const uiAuthor = document.getElementById('ui-author');
const uiDesc = document.getElementById('ui-desc');

// Кнопки (Play удален)
const uiSubBtn = document.getElementById('ui-sub-btn');
const uiVolBtn = document.getElementById('ui-vol-btn');
const uiVolCont = document.getElementById('ui-vol-cont');
const uiVolRange = document.getElementById('ui-vol-range');
const uiShareBtn = document.getElementById('ui-share-btn');
const uiSuggestBtn = document.getElementById('ui-suggest-btn');

// Форма
const suggestForm = document.getElementById('suggest-form');
const sugUrl = document.getElementById('sug-url');
const sugAuthor = document.getElementById('sug-author');
const sugDesc = document.getElementById('sug-desc');
const sugBtn = document.getElementById('sug-send');

// === 2. ЗАГРУЗКА ВИДЕО ===
async function loadVideosOnce() {
    try {
        const res = await fetch('public/videos.json', { cache: 'no-store' });
        if (!res.ok) {
             const res2 = await fetch('videos.json');
             if (res2.ok) { allVideos = await res2.json(); return; }
             return;
        }
        const data = await res.json();
        if (Array.isArray(data)) allVideos = data;
    } catch (e) { console.error('Video load error:', e); }
}

async function reloadVideosAndFeed() {
    const oldVideos = allVideos.slice();
    await loadVideosOnce();
    const oldIds = new Set(oldVideos.map(v => v.id));
    const newOnes = allVideos.filter(v => !oldIds.has(v.id));
    if (newOnes.length === 0) return;
    newOnes.forEach(v => {
        const slide = createSlide(v);
        feedContainer.appendChild(slide);
        observer.observe(slide);
    });
}

// === 3. СИНХРОНИЗАЦИЯ ПОДПИСОК ===
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
        } catch (e) { console.error('Sync subs error:', e); }
    }
}

// === 4. АУДИО И ОВЕРЛЕЙ ===
function unlockAudioContext(e) {
    if (e) e.stopPropagation(); // Чтобы клик не передался видео

    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    
    // Пикаем пустым звуком
    const buffer = audioCtx.createBuffer(1, 1, 22050);
    const source = audioCtx.createBufferSource();
    source.buffer = buffer; 
    source.connect(audioCtx.destination); 
    source.start(0);

    // Убираем оверлей
    const overlay = document.getElementById('audio-unlock-overlay');
    if (overlay) { 
        overlay.classList.add('hidden'); 
        setTimeout(() => overlay.remove(), 500); 
    }
    
    hasInteracted = true;
    
    // Включаем звук у текущего
    const activeSlide = document.querySelector('.video-slide.active-slide');
    if (activeSlide) {
        const vid = activeSlide.querySelector('.video-player');
        if (vid) { 
            vid.muted = false; 
            vid.volume = globalVolume; 
            if (vid.paused) vid.play();
        }
    }
}

const overlayEl = document.getElementById('audio-unlock-overlay');
if (overlayEl) {
    overlayEl.addEventListener('click', unlockAudioContext);
    overlayEl.addEventListener('touchstart', unlockAudioContext);
}

// === 5. НАВИГАЦИЯ ===
function updateInd(tab) {
    if (!tab) return;
    indicator.style.width = `${tab.offsetWidth}px`;
    indicator.style.transform = `translateX(${tab.offsetLeft}px)`;
}
function shuffle(arr) { return arr.sort(() => Math.random() - 0.5); }
function switchToForYou() {
    currentTab = 'foryou';
    tabForYou.classList.add('active'); tabFollowing.classList.remove('active');
    updateInd(tabForYou); renderFeed(shuffle([...allVideos]));
}
tabForYou.addEventListener('click', switchToForYou);
tabFollowing.addEventListener('click', () => {
    if (subscribedAuthors.length === 0) return;
    currentTab = 'following';
    tabFollowing.classList.add('active'); tabForYou.classList.remove('active');
    updateInd(tabFollowing);
    renderFeed(allVideos.filter(v => subscribedAuthors.includes(v.author)));
});

// === 6. UI ЛОГИКА ===
function updateSubBtnState() {
    if (!currentActiveAuthor) return;
    uiSubBtn.classList.toggle('subscribed', subscribedAuthors.includes(currentActiveAuthor));
}
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
        else renderFeed(allVideos.filter(v => subscribedAuthors.includes(v.author)));
    }

    if (tg?.initDataUnsafe?.user) {
        try {
            await fetch(`${API_BASE}/api/subscribe`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: tg.initDataUnsafe.user.id, author: currentActiveAuthor, action })
            });
        } catch (e) { console.error('Sub API error:', e); }
    } else {
        localStorage.setItem('subscribedAuthors', JSON.stringify(subscribedAuthors));
    }
});

function getActiveSlideData() {
    const slide = document.querySelector('.video-slide.active-slide');
    if (!slide) return null;
    try { return JSON.parse(slide.dataset.jsonData); } catch { return null; }
}

// === 7. СЛАЙДЫ + ПЛЕЕР ===
function createSlide(data) {
    const slide = document.createElement('div');
    slide.className = 'video-slide';
    slide.dataset.jsonData = JSON.stringify(data);
    slide.innerHTML = `<video class="video-blur-bg" loop muted playsinline src="${data.videoUrl}"></video><div class="video-wrapper"><video class="video-player" loop muted playsinline src="${data.videoUrl}"></video><div class="video-progress-container"><div class="video-progress-fill"></div></div></div>`;
    const vid = slide.querySelector('.video-player');
    const bg = slide.querySelector('.video-blur-bg');
    const fill = slide.querySelector('.video-progress-fill');
    const bar = slide.querySelector('.video-progress-container');
    
    // Клик по видео: только Пауза/Плей, без смены иконки кнопки (кнопки больше нет)
    vid.addEventListener('click', () => {
        if (vid.paused) { 
            vid.play(); 
            bg.play(); 
        } else { 
            vid.pause(); 
            bg.pause(); 
        }
    });

    vid.addEventListener('timeupdate', () => { if (vid.duration) fill.style.height = `${(vid.currentTime/vid.duration)*100}%`; });
    
    let isDragging = false;
    const handle = (y) => {
        const rect = bar.getBoundingClientRect();
        vid.currentTime = Math.max(0, Math.min(1, 1 - (y - rect.top)/rect.height)) * vid.duration;
    };
    const start = (e) => { e.preventDefault(); isDragging=true; handle(e.touches?e.touches[0].clientY:e.clientY); };
    const move = (e) => { if(isDragging) { e.preventDefault(); handle(e.touches?e.touches[0].clientY:e.clientY); } };
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
        if (!vid || !bg) return;
        if (entry.isIntersecting) {
            document.querySelectorAll('.video-slide').forEach(s => s.classList.remove('active-slide'));
            slide.classList.add('active-slide');
            try { updateGlobalUI(JSON.parse(slide.dataset.jsonData)); } catch (e) {}
            if (hasInteracted) { vid.volume = globalVolume; vid.muted = (globalVolume === 0); } else vid.muted = true;
            if (vid.paused) { vid.play().then(() => bg.play()).catch(() => { vid.muted=true; vid.play(); bg.play(); }); }
        } else { vid.pause(); bg.pause(); }
    });
}, { threshold: 0.6 });

function renderFeed(videos, append = false) {
    if (!append) feedContainer.innerHTML = '';
    videos.forEach(v => { const s = createSlide(v); feedContainer.appendChild(s); observer.observe(s); });
}
feedContainer.addEventListener('scroll', () => {
    if (feedContainer.scrollHeight - (feedContainer.scrollTop + feedContainer.clientHeight) < 300) {
        if (currentTab === 'foryou') renderFeed(shuffle([...allVideos]), true);
        else if (subscribedAuthors.length) renderFeed(allVideos.filter(v => subscribedAuthors.includes(v.author)), true);
    }
});

uiVolBtn.addEventListener('click', (e) => { e.stopPropagation(); uiVolCont.classList.toggle('active'); });
uiVolRange.addEventListener('input', (e) => { e.stopPropagation(); globalVolume=parseFloat(e.target.value); const v=document.querySelector('.video-slide.active-slide .video-player'); if(v) { v.volume=globalVolume; v.muted=(globalVolume===0); } });

// === 8. API ФУНКЦИИ ===
if (uiSuggestBtn && suggestForm) {
    uiSuggestBtn.addEventListener('click', (e) => { e.stopPropagation(); suggestForm.style.display = (suggestForm.style.display==='flex')?'none':'flex'; });
}
// ... (выше код suggestForm) ...

if (sugBtn) {
    sugBtn.addEventListener('click', async () => {
        const url = sugUrl.value.trim();
        const author = sugAuthor.value.trim();
        const desc = sugDesc.value.trim();
        
        // 1. Простая проверка
        if (!url) { tg?.showAlert('Вставь ссылку!'); return; }
        
        // 2. БЛОКИРУЕМ КНОПКУ (Защита от двойного клика)
        sugBtn.disabled = true; 
        const originalText = sugBtn.innerText;
        sugBtn.innerText = '⏳';
        
        try {
            const res = await fetch(`${API_BASE}/api/suggest`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    url, 
                    author, 
                    desc, 
                    user: tg?.initDataUnsafe?.user 
                })
            });
            
            if (res.ok) { 
                // УСПЕХ
                sugBtn.innerText = 'Отправлено!';
                sugUrl.value = ''; sugAuthor.value = ''; sugDesc.value = '';
                
                // Закрываем через 1.5 сек
                setTimeout(() => {
                    suggestForm.style.display = 'none';
                    sugBtn.innerText = originalText;
                    sugBtn.disabled = false; // Разблокируем для следующего раза
                }, 1500);

            } else if (res.status === 429) {
                // ПОЙМАЛИ НА СПАМЕ
                tg?.showAlert('Подожди минуту перед следующей отправкой!');
                sugBtn.innerText = originalText;
                sugBtn.disabled = false;
            } else {
                tg?.showAlert('Ошибка API');
                sugBtn.innerText = originalText;
                sugBtn.disabled = false;
            }
        } catch (e) { 
            tg?.showAlert('Ошибка сети'); 
            sugBtn.innerText = originalText;
            sugBtn.disabled = false;
        }
    });
}

if (uiShareBtn) {
    uiShareBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const data = getActiveSlideData();
        if (!data || !tg?.initDataUnsafe?.user) { if(data) alert(`Скопировано: ${data.videoUrl}`); return; }
        try {
            const res = await fetch(`${API_BASE}/api/share`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ videoUrl: data.videoUrl, author: data.author, desc: data.desc, user: tg.initDataUnsafe.user })
            });
            if (res.ok) tg.showPopup({title:'Готово', message:'Бот отправил видео!', buttons:[{type:'ok'}]});
            else tg.showAlert('Ошибка бота');
        } catch (e) { tg.showAlert('Ошибка сети'); }
    });
}

// === INIT ===
window.addEventListener('load', async () => {
    await loadVideosOnce();
    await syncSubs(); 
    updateInd(tabForYou);
    renderFeed(shuffle([...allVideos]));
});
setInterval(reloadVideosAndFeed, 10000);
