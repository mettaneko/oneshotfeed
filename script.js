// === KONFIG ===
const API_BASE = 'https://niko-feed.vercel.app'; 
const BATCH_SIZE = 5; 
const BOT_LINK = 'https://t.me/oneshotfeedbot'; 

// === 0. TELEGRAM WEB APP ===
const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
const isTelegramUser = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;

if (!isTelegramUser) {
    // window.location.href = BOT_LINK; // Включи для продакшена
    const redirectBanner = document.getElementById('disable-redirect-banner');
    if (redirectBanner) redirectBanner.classList.add('show');
}
if (tg) { tg.expand(); tg.ready(); }

const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx;

// === 1. ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ===
let subscribedAuthors = [];
let hasInteracted = false;
let globalVolume = parseFloat(localStorage.getItem('niko_volume') || '1.0');

let allVideosCache = []; 
let queue = [];          
let currentTab = 'foryou';
let currentActiveAuthor = null;

// DOM
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

if (!isTelegramUser && document.getElementById('disable-redirect-btn')) {
    document.getElementById('disable-redirect-btn').addEventListener('click', () => {
        document.getElementById('disable-redirect-banner').classList.remove('show');
    });
}

// === 2. ЗАГРУЗКА ===
async function fetchVideos(isUpdate = false) {
    let newVideos = [];
    try {
        const res = await fetch(`${API_BASE}/api/get_feed`);
        if (res.ok) newVideos = await res.json();
    } catch (e) { console.error('DB Error', e); return; }

    if (newVideos.length === 0 && allVideosCache.length === 0 && !isUpdate) {
        try {
            const res = await fetch('videos.json');
            if (res.ok) newVideos = await res.json();
        } catch (e) {}
    }
    if (newVideos.length === 0) return;

    const currentIds = new Set(allVideosCache.map(v => v.id));
    const freshContent = newVideos.filter(v => !currentIds.has(v.id));

    if (freshContent.length > 0) {
        console.log(`🔥 New: ${freshContent.length}`);
        allVideosCache = [...freshContent, ...allVideosCache];
        queue.unshift(...freshContent);
        if (isUpdate && feedContainer.children.length < 3) addVideosToDom(BATCH_SIZE);
    } else if (!isUpdate) {
        allVideosCache = newVideos;
    }
}

// === 3. ЛЕНТА ===
function prepareQueue(type) {
    let source = [];
    if (type === 'foryou') source = [...allVideosCache];
    else source = allVideosCache.filter(v => subscribedAuthors.includes(v.author));
    if (source.length === 0) return;
    queue = shuffle(source);
    feedContainer.innerHTML = '';
    addVideosToDom(BATCH_SIZE);
}

function addVideosToDom(count) {
    if (queue.length < count) {
        let refill = [...allVideosCache];
        if (currentTab === 'following') refill = refill.filter(v => subscribedAuthors.includes(v.author));
        if (refill.length > 0) queue.push(...shuffle(refill));
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
             if (allSlides[i]) { observer.unobserve(allSlides[i]); allSlides[i].remove(); }
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
                method: 'POST', headers: { 'Content-Type': 'application/json' },
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

// === 5. СЛАЙДЫ ===
function createSlide(data) {
    const slide = document.createElement('div');
    slide.className = 'video-slide';
    slide.dataset.jsonData = JSON.stringify(data);
    const poster = data.cover ? `poster="${data.cover}"` : '';

    slide.innerHTML = `
        <video class="video-blur-bg" loop muted playsinline referrerpolicy="no-referrer" src="${data.videoUrl}"></video>
        <div class="video-wrapper">
            <video class="video-player" ${poster} loop muted playsinline referrerpolicy="no-referrer" src="${data.videoUrl}"></video>
            <div class="video-progress-container"><div class="video-progress-fill"></div></div>
        </div>`;
        
    const vid = slide.querySelector('.video-player');
    const bg = slide.querySelector('.video-blur-bg');
    const fill = slide.querySelector('.video-progress-fill');
    const bar = slide.querySelector('.video-progress-container'); 

    // State
    vid.dataset.userPaused = "false";
    vid.dataset.lastTime = "0";
    vid.dataset.stuckCount = "0";
    vid.dataset.retryCount = "0"; 
    vid.dataset.reloading = "false"; 

    vid.referrerPolicy = "no-referrer";
    bg.referrerPolicy = "no-referrer";

    // Управление цветом полоски
    const setStatusColor = (status) => {
        // Сброс
        bar.classList.remove('error-state', 'fatal-error');
        
        if (status === 'error') {
            bar.classList.add('error-state'); // Обычный красный (загрузка/зависание)
        } else if (status === 'fatal') {
            bar.classList.add('fatal-error'); // Пульсирующий темно-красный (смерть)
        }
    };

    // -- БЕЗОПАСНАЯ ПЕРЕЗАГРУЗКА --
    slide.safeReload = () => {
        if (vid.dataset.reloading === "true") return;

        let retries = parseInt(vid.dataset.retryCount || 0);
        
        // ФАТАЛЬНАЯ ОШИБКА
        if (retries >= 3) {
            console.log("❌ Video Unavailable (Fatal)");
            setStatusColor('fatal'); // Включаем пульсацию
            vid.dataset.stuckCount = "0"; 
            return;
        }

        // ОБЫЧНАЯ ОШИБКА
        setStatusColor('error');
        
        console.log(`♻️ Reloading stream (${retries + 1}/3)...`);
        vid.dataset.reloading = "true";
        vid.dataset.retryCount = retries + 1;
        
        const sep = data.videoUrl.includes('?') ? '&' : '?';
        const retryUrl = `${data.videoUrl}${sep}t=${Date.now()}`;
        const savedTime = vid.currentTime;

        vid.removeAttribute('src');
        vid.load();

        setTimeout(() => {
            vid.src = retryUrl;
            bg.src = retryUrl;
            vid.load();

            const onMeta = () => {
                if (Number.isFinite(savedTime) && savedTime > 0) vid.currentTime = savedTime;

                if (hasInteracted) { vid.muted = (globalVolume === 0); vid.volume = globalVolume; } 
                else { vid.muted = true; }

                vid.play().then(() => {
                    bg.play().catch(()=>{});
                    setStatusColor('ok'); // Сброс цвета
                    vid.dataset.retryCount = "0"; 
                    vid.dataset.stuckCount = "0";
                    vid.dataset.reloading = "false";
                    if (hasInteracted) { vid.muted = (globalVolume === 0); vid.volume = globalVolume; }
                }).catch(e => {
                    if (e.name !== 'AbortError') console.warn("Autoplay blocked:", e);
                    vid.muted = true;
                    vid.play().then(() => {
                        if (hasInteracted) { vid.muted = (globalVolume === 0); vid.volume = globalVolume; }
                        setStatusColor('ok');
                        vid.dataset.reloading = "false";
                    }).catch(() => {
                        vid.dataset.reloading = "false";
                    });
                });
                vid.removeEventListener('loadedmetadata', onMeta);
            };
            vid.addEventListener('loadedmetadata', onMeta);
            
            const onError = () => {
                vid.dataset.reloading = "false";
                setStatusColor('error'); // Пока просто ошибка
                vid.removeEventListener('error', onError);
            };
            vid.addEventListener('error', onError);

        }, 1000);
    };

    // User Controls
    vid.parentElement.addEventListener('click', () => {
        if (vid.paused) {
            vid.dataset.userPaused = "false";
            // Если была фатальная или обычная ошибка, клик - это принудительная реанимация
            if (parseInt(vid.dataset.retryCount || 0) >= 3 || bar.classList.contains('error-state') || bar.classList.contains('fatal-error')) {
                 vid.dataset.retryCount = "0"; // Сброс счетчика
                 slide.safeReload();
            } else {
                 vid.play().then(() => { 
                     bg.play(); 
                     setStatusColor('ok'); 
                 }).catch(()=>{});
            }
        } else {
            vid.dataset.userPaused = "true";
            vid.pause(); bg.pause();
        }
    });
    
    vid.addEventListener('timeupdate', () => { 
        if(Number.isFinite(vid.duration) && vid.duration > 0) {
            fill.style.height=`${(vid.currentTime/vid.duration)*100}%`;
        }
        vid.dataset.stuckCount = "0";
        vid.dataset.lastTime = vid.currentTime;
        
        if (vid.dataset.reloading === "true") vid.dataset.reloading = "false";
        
        // Убираем красный, если видео реально пошло
        if ((bar.classList.contains('error-state') || bar.classList.contains('fatal-error')) && !vid.paused && vid.readyState > 2) {
             setStatusColor('ok');
        }
    });

    // Seek (Перемотка)
    let isDragging = false;
    const handle = (y) => {
        if (!Number.isFinite(vid.duration)) return;
        const rect = bar.getBoundingClientRect();
        const pct = Math.max(0, Math.min(1, 1 - (y - rect.top)/rect.height));
        vid.currentTime = pct * vid.duration;
        
        // СБРОС
        vid.dataset.stuckCount = "0";
        vid.dataset.retryCount = "0"; 
        setStatusColor('ok'); 
        
        vid.dataset.userPaused = "false";
        vid.play().then(() => bg.play()).catch(()=>{});
    };

    const start=(e)=>{e.preventDefault();e.stopPropagation();isDragging=true;handle(e.touches?e.touches[0].clientY:e.clientY);};
    const move=(e)=>{if(isDragging){e.preventDefault();e.stopPropagation();handle(e.touches?e.touches[0].clientY:e.clientY);}};
    const end=()=>isDragging=false;
    bar.addEventListener('mousedown', start); window.addEventListener('mousemove', move); window.addEventListener('mouseup', end);
    bar.addEventListener('touchstart', start); window.addEventListener('touchmove', move); window.addEventListener('touchend', end);
    bar.addEventListener('click', (e)=>{e.preventDefault();e.stopPropagation();handle(e.clientY);});
    
    return slide;
}

// === 6. HEARTBEAT ===
setInterval(() => {
    const activeSlide = document.querySelector('.active-slide');
    if (!activeSlide) return;

    const vid = activeSlide.querySelector('.video-player');
    const bg = activeSlide.querySelector('.video-blur-bg');
    const bar = activeSlide.querySelector('.video-progress-container');
    if (!vid) return;

    if (vid.dataset.reloading === "true") return;

    // 1. Resume false pause
    if (vid.paused && vid.dataset.userPaused === "false" && vid.readyState > 2) {
        // console.log("💓 Heartbeat: Resuming false pause"); // Spam removed
        vid.play().catch(()=>{}); 
        bg.play().catch(()=>{});
        return;
    }

    // 2. Check Stuck
    if (!vid.paused && vid.dataset.userPaused === "false") {
        const currentTime = vid.currentTime;
        const lastTime = parseFloat(vid.dataset.lastTime || 0);
        
        if (Math.abs(currentTime - lastTime) < 0.1) {
            let stuck = parseInt(vid.dataset.stuckCount || 0) + 1;
            vid.dataset.stuckCount = stuck;
            
            // console.log(`⚠️ Stuck counter: ${stuck}`); // Spam removed

            // КРАСИМ (Pre-warning)
            if (stuck >= 2 && bar && !bar.classList.contains('fatal-error')) {
                 bar.classList.add('error-state');
            }

            if (stuck >= 3) {
                 if (parseInt(vid.dataset.retryCount || 0) < 3) {
                     if (activeSlide.safeReload) activeSlide.safeReload();
                 } else {
                     // Лимит исчерпан -> ФАТАЛИТИ
                     if (bar) {
                         bar.classList.remove('error-state');
                         bar.classList.add('fatal-error');
                     }
                 }
            }
        } else {
            vid.dataset.stuckCount = "0";
            vid.dataset.lastTime = currentTime;
        }
    }
}, 1000);

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        const slide = entry.target;
        const vid = slide.querySelector('.video-player');
        const bg = slide.querySelector('.video-blur-bg');
        const bar = slide.querySelector('.video-progress-container');
        
        if (entry.isIntersecting) {
            document.querySelectorAll('.video-slide').forEach(s => s.classList.remove('active-slide'));
            slide.classList.add('active-slide');
            try { updateGlobalUI(JSON.parse(slide.dataset.jsonData)); } catch (e) {}

            vid.dataset.userPaused = "false"; 
            vid.dataset.stuckCount = "0";
            vid.dataset.retryCount = "0"; 
            vid.dataset.reloading = "false";
            
            if(bar) bar.classList.remove('error-state', 'fatal-error');
            
            if (hasInteracted) { vid.volume=globalVolume; vid.muted=(globalVolume===0); } else vid.muted=true;
            
            vid.play().then(()=>bg.play()).catch(()=>{ vid.muted=true; vid.play(); });

            const allSlides = Array.from(document.querySelectorAll('.video-slide'));
            if (allSlides.length - allSlides.indexOf(slide) < 3) addVideosToDom(BATCH_SIZE);
        } else {
            slide.classList.remove('active-slide');
            vid.pause();
            bg.pause();
        }
    });
}, { threshold: 0.6 });

// === UI & LISTENERS ===
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
    if (overlay) { overlay.classList.add('hidden'); setTimeout(() => overlay.remove(), 500); }
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

const overlayEl = document.getElementById('audio-unlock-overlay');
if (overlayEl) overlayEl.addEventListener('click', unlockAudioContext);

tabForYou.addEventListener('click', () => {
    currentTab = 'foryou';
    tabForYou.classList.add('active'); tabFollowing.classList.remove('active');
    updateInd(tabForYou); prepareQueue('foryou');
});
tabFollowing.addEventListener('click', () => {
    if (subscribedAuthors.length === 0) return;
    currentTab = 'following';
    tabFollowing.classList.add('active'); tabForYou.classList.remove('active');
    updateInd(tabFollowing); prepareQueue('following');
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
    if (tg?.initDataUnsafe?.user) fetch(`${API_BASE}/api/subscribe`, { method: 'POST', body: JSON.stringify({ userId: tg.initDataUnsafe.user.id, author: currentActiveAuthor, action }) }).catch(()=>{});
});
uiVolBtn.addEventListener('click', (e) => { e.stopPropagation(); uiVolCont.classList.toggle('active'); });
uiVolRange.addEventListener('input', (e) => { 
    e.stopPropagation(); globalVolume = parseFloat(e.target.value); 
    localStorage.setItem('niko_volume', globalVolume);
    const v = document.querySelector('.active-slide .video-player'); if(v) { v.volume = globalVolume; v.muted = (globalVolume === 0); } 
});

if (uiSuggestBtn && suggestForm) uiSuggestBtn.addEventListener('click', (e) => { e.stopPropagation(); suggestForm.style.display=(suggestForm.style.display==='flex')?'none':'flex'; });
if (sugBtn) sugBtn.addEventListener('click', async () => {
    const url = sugUrl.value.trim(); const author = sugAuthor.value.trim(); const desc = sugDesc.value.trim();
    if (!url) { tg?.showAlert('Вставь ссылку!'); return; }
    sugBtn.innerText='...'; sugBtn.disabled=true;
    try {
        const res = await fetch(`${API_BASE}/api/suggest`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ url, author, desc, user: tg?.initDataUnsafe?.user }) });
        if (res.ok) { sugBtn.innerText='Отправлено!'; setTimeout(()=>{ suggestForm.style.display='none'; sugBtn.innerText='Отправить'; sugBtn.disabled=false; }, 1000); }
        else { tg?.showAlert('Ошибка'); sugBtn.innerText='Отправить'; sugBtn.disabled=false; }
    } catch (e) { tg?.showAlert('Сбой сети'); sugBtn.innerText='Отправить'; sugBtn.disabled=false; }
});
if (uiShareBtn) uiShareBtn.addEventListener('click', async (e) => {
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

window.addEventListener('load', async () => {
    if(uiVolRange) uiVolRange.value = globalVolume;
    await fetchVideos(false); await syncSubs(); 
    updateInd(tabForYou); prepareQueue('foryou');
    setInterval(() => fetchVideos(true), 60000);
});
