// === KONFIG ===
const API_BASE = 'https://niko-feed.vercel.app'; // ← ТВОЙ VERCEL URL
// Например: 'https://niko-feed.vercel.app'

// === 0. TELEGRAM WEB APP ===
const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
if (tg) {
    tg.expand();
    tg.ready();
}

const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx;

// === 1. ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ===
let subscribedAuthors = JSON.parse(localStorage.getItem('subscribedAuthors')) || [];
let hasInteracted = false;
let globalVolume = 1.0;
let currentTab = 'foryou';
let currentActiveAuthor = null;
let allVideos = [];

// DOM
const feedContainer = document.getElementById('feed');
const tabForYou = document.getElementById('tab-foryou');
const tabFollowing = document.getElementById('tab-following');
const indicator = document.getElementById('nav-indicator');
const uiAuthor = document.getElementById('ui-author');
const uiDesc = document.getElementById('ui-desc');
const uiSubBtn = document.getElementById('ui-sub-btn');
const uiPlayBtn = document.getElementById('ui-play-btn');
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

// === 2. ВИДЕО (с GitHub Pages) ===
async function loadVideosOnce() {
    try {
        // Загружаем локально с GitHub Pages
        const res = await fetch('public/videos.json', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data)) allVideos = data;
    } catch (e) {
        console.error('Video load error:', e);
    }
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

// === 3. АУДИО ===
function unlockAudioContext() {
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const buffer = audioCtx.createBuffer(1, 1, 22050);
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(audioCtx.destination);
    source.start(0);
    const overlay = document.getElementById('audio-unlock-overlay');
    if (overlay) {
        overlay.classList.add('hidden');
        setTimeout(() => overlay.remove(), 500);
    }
    hasInteracted = true;
    const activeSlide = document.querySelector('.video-slide.active-slide');
    if (activeSlide) {
        const vid = activeSlide.querySelector('.video-player');
        if (vid) { vid.muted = false; vid.volume = globalVolume; }
    }
}
const overlayEl = document.getElementById('audio-unlock-overlay');
if (overlayEl) {
    overlayEl.addEventListener('click', unlockAudioContext, { once: true });
    overlayEl.addEventListener('touchstart', unlockAudioContext, { once: true });
}

// === 4. НАВИГАЦИЯ ===
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

// === 5. UI ===
function updateSubBtnState() {
    if (!currentActiveAuthor) return;
    uiSubBtn.classList.toggle('subscribed', subscribedAuthors.includes(currentActiveAuthor));
}
function updateGlobalUI(videoData) {
    if (uiAuthor) uiAuthor.innerText = `@${videoData.author}`;
    if (uiDesc) uiDesc.innerText = videoData.desc;
    currentActiveAuthor = videoData.author;
    updateSubBtnState();
    if (uiPlayBtn) { uiPlayBtn.querySelector('i').className = 'fas fa-pause'; uiPlayBtn.classList.add('active'); }
}
uiSubBtn.addEventListener('click', (e) => {
    e.stopPropagation(); if (!currentActiveAuthor) return;
    if (subscribedAuthors.includes(currentActiveAuthor)) {
        subscribedAuthors = subscribedAuthors.filter(a => a !== currentActiveAuthor);
        if (currentTab === 'following' && subscribedAuthors.length === 0) switchToForYou();
        else if (currentTab === 'following') renderFeed(allVideos.filter(v => subscribedAuthors.includes(v.author)));
    } else { subscribedAuthors.push(currentActiveAuthor); }
    localStorage.setItem('subscribedAuthors', JSON.stringify(subscribedAuthors)); updateSubBtnState();
});
function getActiveSlideData() {
    const slide = document.querySelector('.video-slide.active-slide');
    if (!slide) return null;
    try { return JSON.parse(slide.dataset.jsonData); } catch { return null; }
}

// === 6. СЛАЙДЫ + ПЛЕЕР ===
// ... (тут твой код createSlide, attachSeek, observer - он не менялся) ...
// Я его сократил для краткости, вставь свою версию функций createSlide/attachSeek/observer/renderFeed

function createSlide(data) {
    const slide = document.createElement('div');
    slide.className = 'video-slide';
    slide.dataset.jsonData = JSON.stringify(data);
    slide.innerHTML = `<video class="video-blur-bg" loop muted playsinline src="${data.videoUrl}"></video><div class="video-wrapper"><video class="video-player" loop muted playsinline src="${data.videoUrl}"></video><div class="video-progress-container"><div class="video-progress-fill"></div></div></div>`;
    const vid = slide.querySelector('.video-player');
    const bg = slide.querySelector('.video-blur-bg');
    const fill = slide.querySelector('.video-progress-fill');
    const bar = slide.querySelector('.video-progress-container');
    
    vid.addEventListener('click', () => {
        if (vid.paused) { vid.play(); bg.play(); uiPlayBtn.querySelector('i').className = 'fas fa-pause'; uiPlayBtn.classList.add('active'); }
        else { vid.pause(); bg.pause(); uiPlayBtn.querySelector('i').className = 'fas fa-play'; uiPlayBtn.classList.remove('active'); }
    });
    vid.addEventListener('timeupdate', () => { if (vid.duration) fill.style.height = `${(vid.currentTime/vid.duration)*100}%`; });
    attachSeek(bar, vid);
    return slide;
}

function attachSeek(bar, vid) {
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

uiPlayBtn.addEventListener('click', (e) => { e.stopPropagation(); const v=document.querySelector('.video-slide.active-slide .video-player'); if(v) v.click(); });
uiVolBtn.addEventListener('click', (e) => { e.stopPropagation(); uiVolCont.classList.toggle('active'); });
uiVolRange.addEventListener('input', (e) => { e.stopPropagation(); globalVolume=parseFloat(e.target.value); const v=document.querySelector('.video-slide.active-slide .video-player'); if(v) { v.volume=globalVolume; v.muted=(globalVolume===0); } });


// === 10. API: ПРЕДЛОЖКА (на Vercel) ===
if (uiSuggestBtn && suggestForm) {
    uiSuggestBtn.addEventListener('click', (e) => { e.stopPropagation(); suggestForm.style.display = (suggestForm.style.display==='flex')?'none':'flex'; });
}
if (sugBtn) {
    sugBtn.addEventListener('click', async () => {
        const url = sugUrl.value.trim();
        const author = sugAuthor.value.trim();
        const desc = sugDesc.value.trim();
        if (!url) { tg?.showAlert('Вставь ссылку!'); return; }

        try {
            // Шлём запрос на VERCEL
            const res = await fetch(`${API_BASE}/api/suggest`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url, author, desc, user: tg?.initDataUnsafe?.user })
            });

            if (res.ok) {
                tg?.showPopup({title:'Готово', message:'Отправлено админу!', buttons:[{type:'ok'}]});
                sugUrl.value=''; sugAuthor.value=''; sugDesc.value=''; suggestForm.style.display='none';
            } else tg?.showAlert('Ошибка API');
        } catch (e) { tg?.showAlert('Ошибка сети'); }
    });
}

// === 11. API: SHARE (на Vercel) ===
if (uiShareBtn) {
    uiShareBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const data = getActiveSlideData();
        if (!data || !tg?.initDataUnsafe?.user) {
            if(data) alert(`Скопировано: ${data.videoUrl}`);
            return;
        }

        try {
            // Шлём запрос на VERCEL
            const res = await fetch(`${API_BASE}/api/share`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    videoUrl: data.videoUrl, author: data.author, desc: data.desc,
                    user: tg.initDataUnsafe.user
                })
            });
            if (res.ok) tg.showPopup({title:'Готово', message:'Бот отправил видео!', buttons:[{type:'ok'}]});
            else tg.showAlert('Ошибка бота');
        } catch (e) { tg.showAlert('Ошибка сети'); }
    });
}

// INIT
window.addEventListener('load', async () => {
    await loadVideosOnce();
    updateInd(tabForYou);
    renderFeed(shuffle([...allVideos]));
});
setInterval(reloadVideosAndFeed, 30000);
