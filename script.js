// script.js

// --- БЛОК УПРАВЛЕНИЯ РЕЖИМОМ ТЕХ. РАБОТ ---
(async function() {
    const API_BASE = 'https://feed.mettaneko.ru';
    const SESSION_DURATION = 5 * 60 * 1000;
    const ACCESS_TOKEN_KEY = 'maintenance_access_pass';

    // Функция, которая проверяет статус и решает, нужно ли перенаправлять пользователя
    const checkStatusAndRedirect = async () => {
        try {
            const response = await fetch(`${API_BASE}/api/maintenance`);
            if (!response.ok) return; // Если API недоступен, ничего не делаем

            const data = await response.json();

            // Если режим тех. работ ВКЛЮЧЕН
            if (data.maintenance) {
                let hasValidPass = false;
                const token = localStorage.getItem(ACCESS_TOKEN_KEY);

                if (token) {
                    try {
                        const payload = JSON.parse(atob(token));
                        // Проверяем, не истек ли пропуск
                        if (Date.now() <= (payload.ts + SESSION_DURATION)) {
                            hasValidPass = true;
                        }
                    } catch (e) { /* Невалидный токен, считаем что пропуска нет */ }
                }
                
                // Если валидного пропуска нет, немедленно перенаправляем
                if (!hasValidPass && window.location.pathname !== '/maintenance.html') {
                    window.location.replace('/maintenance.html');
                }
            }
        } catch (e) {
            console.error("Maintenance check failed.", e);
        }
    };

    // 1. Выполняем проверку немедленно при загрузке страницы
    await checkStatusAndRedirect();

    // 2. Устанавливаем периодическую проверку каждые 10 секунд
    setInterval(checkStatusAndRedirect, 10000); 

})();
// --- КОНЕЦ БЛОКА УПРАВЛЕНИЯ ---


// === KONFIG ===
const API_BASE = 'https://feed.mettaneko.ru';

// === 0. TELEGRAM WEB APP ===
const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
if (tg) {
    tg.expand();
    tg.ready();
}

const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx;

// === 1. ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ===
let subscribedAuthors = [];
let hasInteracted = false;

// --- ГРОМКОСТЬ (С СОХРАНЕНИЕМ) ---
let savedVol = localStorage.getItem('niko_volume');
let globalVolume = savedVol !== null ? parseFloat(savedVol) : 1.0;

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

// Кнопки
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

// === ПРОВЕРКА TELEGRAM (ОПЦИОНАЛЬНО) ===
const isTelegram = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
const redirectBanner = document.getElementById('disable-redirect-banner');

if (!isTelegram && redirectBanner) {
    redirectBanner.classList.add('show');
}

if (redirectBanner) {
    const disableBtn = document.getElementById('disable-redirect-btn');
    if (disableBtn) {
        disableBtn.addEventListener('click', () => {
            redirectBanner.classList.remove('show');
            setTimeout(() => redirectBanner.remove(), 500);
        });
    }
}

// === 2. ЗАГРУЗКА ВИДЕО (ГИБРИДНАЯ: JSON + БД) ===
async function loadVideosOnce() {
    let localVideos = [];
    let dbVideos = [];

    // 1. Грузим из файла (videos.json) - СТАРЫЕ
    try {
        const res = await fetch('public/videos.json', { cache: 'no-store' });
        if (res.ok) {
            localVideos = await res.json();
        } else {
            const res2 = await fetch('videos.json');
            if (res2.ok) localVideos = await res2.json();
        }
    } catch (e) {
        console.error('Local JSON error:', e);
    }

    // 2. Грузим из Базы Данных (API) - НОВЫЕ
    try {
        const res = await fetch(`${API_BASE}/api/get_feed`);
        if (res.ok) {
            dbVideos = await res.json();
        }
    } catch (e) {
        console.error('DB Feed error:', e);
    }

    // 3. Склеиваем!
    allVideos = [...dbVideos, ...localVideos];
    if (allVideos.length === 0) console.warn('No videos found!');
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
        } catch (e) {
            console.error('Sync subs error:', e);
        }
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
    if (overlay) {
        overlay.classList.add('hidden');
        setTimeout(() => overlay.remove(), 500);
    }
    hasInteracted = true;

    const activeSlide = document.querySelector('.video-slide.active-slide');
    if (activeSlide) {
        const vid = activeSlide.querySelector('.video-player');
        if (vid) {
            vid.muted = false;
            vid.volume = globalVolume;
            if (vid.paused) {
                vid.play().catch(err => console.log('Unlock play error', err));
            }
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

function shuffle(arr) {
    return arr.sort(() => Math.random() - 0.5);
}

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
        else {
            const filtered = allVideos.filter(v => subscribedAuthors.includes(v.author));
            renderFeed(filtered.slice(0, 5));
        }
    }

    if (tg?.initDataUnsafe?.user) {
        try {
            await fetch(`${API_BASE}/api/subscribe`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: tg.initDataUnsafe.user.id,
                    author: currentActiveAuthor,
                    action
                })
            });
        } catch (e) {
            console.error('Sub API error:', e);
        }
    } else {
        localStorage.setItem('subscribedAuthors', JSON.stringify(subscribedAuthors));
    }
});

function getActiveSlideData() {
    const slide = document.querySelector('.video-slide.active-slide');
    if (!slide) return null;
    try {
        return JSON.parse(slide.dataset.jsonData);
    } catch {
        return null;
    }
}

// === 7. УПРАВЛЕНИЕ ПАМЯТЬЮ И ЗАГРУЗКОЙ ВИДЕО ===

function loadVideo(slide) {
    if (!slide) return;
    const vid = slide.querySelector('.video-player');
    const bg = slide.querySelector('.video-blur-bg');
    const url = slide.dataset.videoUrl;

    if (vid && !vid.getAttribute('src')) {
        vid.src = url;
        vid.load();
    }
    if (bg && !bg.getAttribute('src')) {
        bg.src = url;
        bg.load();
    }
}

function unloadVideo(slide) {
    if (!slide) return;
    const vid = slide.querySelector('.video-player');
    const bg = slide.querySelector('.video-blur-bg');

    if (vid && vid.getAttribute('src')) {
        vid.pause();
        vid.removeAttribute('src'); 
        vid.load();
    }
    if (bg && bg.getAttribute('src')) {
        bg.pause();
        bg.removeAttribute('src');
        bg.load();
    }
}

function manageVideoMemory(activeSlide) {
    const allSlides = Array.from(document.querySelectorAll('.video-slide'));
    const activeIndex = allSlides.indexOf(activeSlide);

    if (activeIndex === -1) return;

    allSlides.forEach((slide, index) => {
        if (Math.abs(index - activeIndex) <= 2) {
            loadVideo(slide);
        } else {
            unloadVideo(slide);
        }
    });
}

// === 8. СЛАЙДЫ + ПЛЕЕР ===
function createSlide(data) {
    const slide = document.createElement('div');
    slide.className = 'video-slide';
    slide.dataset.jsonData = JSON.stringify(data);
    slide.dataset.videoUrl = data.videoUrl;

    slide.innerHTML = `
        <video class="video-blur-bg" loop muted playsinline></video>
        <div class="video-wrapper">
            <video class="video-player" loop muted playsinline></video>
            <div class="video-progress-container">
                <div class="video-progress-fill"></div>
            </div>
        </div>`;

    const vid = slide.querySelector('.video-player');
    const bg = slide.querySelector('.video-blur-bg');
    const fill = slide.querySelector('.video-progress-fill');
    const bar = slide.querySelector('.video-progress-container');

    vid.addEventListener('click', () => {
        if (vid.paused) {
            vid.play().catch(e => console.log('Click play error', e));
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

            if (hasInteracted) {
                vid.volume = globalVolume;
                vid.muted = (globalVolume === 0);
            } else {
                vid.muted = true;
            }

            requestAnimationFrame(() => {
                if (vid.paused) {
                    const playPromise = vid.play();
                    if (playPromise !== undefined) {
                        playPromise
                            .then(() => {
                                bg.play().catch(() => {});
                            })
                            .catch(error => {
                                vid.muted = true;
                                vid.play().catch(e => console.log('Muted play also failed', e));
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

let isFetching = false;
feedContainer.addEventListener('scroll', () => {
    if (feedContainer.scrollHeight - (feedContainer.scrollTop + feedContainer.clientHeight) < 300) {
        if (isFetching) return;
        isFetching = true;

        setTimeout(() => {
            let nextBatch = [];
            if (currentTab === 'foryou') {
                nextBatch = shuffle([...allVideos]).slice(0, 5);
            } else if (subscribedAuthors.length) {
                const filtered = allVideos.filter(v => subscribedAuthors.includes(v.author));
                nextBatch = shuffle(filtered).slice(0, 5);
            }

            if (nextBatch.length > 0) {
                renderFeed(nextBatch, true);
            }
            isFetching = false;
        }, 500);
    }
});

uiVolBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    uiVolCont.classList.toggle('active');
});

uiVolRange.addEventListener('input', (e) => {
    e.stopPropagation();
    globalVolume = parseFloat(e.target.value);
    localStorage.setItem('niko_volume', globalVolume);

    const v = document.querySelector('.video-slide.active-slide .video-player');
    if (v) {
        v.volume = globalVolume;
        v.muted = (globalVolume === 0);
    }
});

// === 8. API ФУНКЦИИ (Предложка + Шер) ===
if (uiSuggestBtn && suggestForm) {
    uiSuggestBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        suggestForm.style.display = (suggestForm.style.display === 'flex') ? 'none' : 'flex';
    });
}
if (sugBtn) {
    sugBtn.addEventListener('click', async () => {
        const url = sugUrl.value.trim();
        const author = sugAuthor.value.trim();
        const desc = sugDesc.value.trim();
        if (!url) { tg?.showAlert('Вставь ссылку!'); return; }

        const originalText = sugBtn.innerText;
        sugBtn.innerText = '...';
        sugBtn.disabled = true;

        try {
            const res = await fetch(`${API_BASE}/api/suggest`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url, author, desc, user: tg?.initDataUnsafe?.user })
            });

            if (res.ok) {
                sugBtn.innerText = 'Отправлено!';
                sugUrl.value = ''; sugAuthor.value = ''; sugDesc.value = '';
                setTimeout(() => {
                    suggestForm.style.display = 'none';
                    sugBtn.innerText = originalText;
                    sugBtn.disabled = false;
                }, 1000);
            } else if (res.status === 429) {
                tg?.showAlert('Подожди минуту!');
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
        if (!data || !tg?.initDataUnsafe?.user) {
            if (data) alert(`Скопировано: ${data.videoUrl}`);
            return;
        }
        try {
            const res = await fetch(`${API_BASE}/api/share`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    videoUrl: data.videoUrl,
                    author: data.author,
                    desc: data.desc,
                    user: tg.initDataUnsafe.user
                })
            });
            if (res.ok) tg.showPopup({ title: 'Готово', message: 'Бот отправил видео!', buttons: [{ type: 'ok' }] });
            else tg.showAlert('Ошибка бота');
        } catch (e) { tg.showAlert('Ошибка сети'); }
    });
}

// === INIT ===
window.addEventListener('load', async () => {
    if (uiVolRange) uiVolRange.value = globalVolume;

    await loadVideosOnce(); 
    await syncSubs();
    updateInd(tabForYou);
    
    renderFeed(shuffle([...allVideos]).slice(0, 5));
});

setInterval(reloadVideosAndFeed, 30000);
