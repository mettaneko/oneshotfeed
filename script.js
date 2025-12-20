// === 0. ГЛОБАЛЬНЫЙ АУДИО-КОНТЕКСТ ===
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx;

// === 1. ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ===
let subscribedAuthors = JSON.parse(localStorage.getItem('subscribedAuthors')) || [];
let hasInteracted = false;
let globalVolume = 1.0;
let currentTab = 'foryou';
let currentActiveAuthor = null;

// Видео берём из /videos.json
let allVideos = [];

// Элементы UI
const feedContainer = document.getElementById('feed');
const tabForYou = document.getElementById('tab-foryou');
const tabFollowing = document.getElementById('tab-following');
const indicator = document.getElementById('nav-indicator');

// Глобальный UI
const uiAuthor = document.getElementById('ui-author');
const uiDesc = document.getElementById('ui-desc');
const uiSubBtn = document.getElementById('ui-sub-btn');
const uiPlayBtn = document.getElementById('ui-play-btn');
const uiVolBtn = document.getElementById('ui-vol-btn');
const uiVolCont = document.getElementById('ui-vol-cont');
const uiVolRange = document.getElementById('ui-vol-range');

// === 2. ЗАГРУЗКА ВИДЕО ИЗ /videos.json ===
async function loadVideos() {
    try {
        const res = await fetch('/videos.json', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data)) {
            allVideos = data;
        }
    } catch (e) {
        console.error('videos.json load error', e);
    }
}

// === 3. РАЗБЛОКИРОВКА АУДИО ПО КЛИКУ ===
function unlockAudioContext() {
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

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

    const activeSlide = document.querySelector('.video-slide.active-slide') || document.querySelector('.video-slide');
    if (activeSlide) {
        const vid = activeSlide.querySelector('.video-player');
        if (vid) {
            vid.muted = false;
            vid.volume = globalVolume;
        }
    }
}

const overlayEl = document.getElementById('audio-unlock-overlay');
if (overlayEl) {
    overlayEl.addEventListener('click', unlockAudioContext, { once: true });
    overlayEl.addEventListener('touchstart', unlockAudioContext, { once: true });
}

// === 4. НАВИГАЦИЯ (For You / Following) ===
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
    renderFeed(shuffle([...allVideos]));
}

tabForYou.addEventListener('click', switchToForYou);

tabFollowing.addEventListener('click', () => {
    if (subscribedAuthors.length === 0) return;
    currentTab = 'following';
    tabFollowing.classList.add('active');
    tabForYou.classList.remove('active');
    updateInd(tabFollowing);
    const subs = allVideos.filter(v => subscribedAuthors.includes(v.author));
    renderFeed(subs);
});

// === 5. ГЛОБАЛЬНЫЙ UI (автор/описание/подписка) ===
function updateSubBtnState() {
    if (!currentActiveAuthor) return;
    if (subscribedAuthors.includes(currentActiveAuthor)) {
        uiSubBtn.classList.add('subscribed');
    } else {
        uiSubBtn.classList.remove('subscribed');
    }
}

function updateGlobalUI(videoData) {
    if (uiAuthor) uiAuthor.innerText = `@${videoData.author}`;
    if (uiDesc) uiDesc.innerText = videoData.desc;
    currentActiveAuthor = videoData.author;
    updateSubBtnState();

    if (uiPlayBtn) {
        uiPlayBtn.querySelector('i').className = 'fas fa-pause';
        uiPlayBtn.classList.add('active');
    }
}

uiSubBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!currentActiveAuthor) return;

    if (subscribedAuthors.includes(currentActiveAuthor)) {
        subscribedAuthors = subscribedAuthors.filter(a => a !== currentActiveAuthor);
        if (currentTab === 'following') {
            if (subscribedAuthors.length === 0) {
                switchToForYou();
            } else {
                const subs = allVideos.filter(v => subscribedAuthors.includes(v.author));
                renderFeed(subs);
            }
        }
    } else {
        subscribedAuthors.push(currentActiveAuthor);
    }

    localStorage.setItem('subscribedAuthors', JSON.stringify(subscribedAuthors));
    updateSubBtnState();
});

// === 6. ГЛОБАЛЬНЫЕ КНОПКИ ПЛЕЕРА ===
function getActiveVideo() {
    return document.querySelector('.video-slide.active-slide .video-player');
}
function getActiveBg() {
    return document.querySelector('.video-slide.active-slide .video-blur-bg');
}

uiPlayBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const v = getActiveVideo();
    const b = getActiveBg();
    if (!v) return;

    if (v.paused) {
        v.play();
        if (b) b.play();
        uiPlayBtn.querySelector('i').className = 'fas fa-pause';
        uiPlayBtn.classList.add('active');
    } else {
        v.pause();
        if (b) b.pause();
        uiPlayBtn.querySelector('i').className = 'fas fa-play';
        uiPlayBtn.classList.remove('active');
    }
});

uiVolBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    uiVolCont.classList.toggle('active');
});

uiVolRange.addEventListener('input', (e) => {
    e.stopPropagation();
    globalVolume = parseFloat(e.target.value);
    const v = getActiveVideo();
    if (v) {
        v.volume = globalVolume;
        v.muted = (globalVolume === 0);
    }
});

// === 7. ПРОМОТКА (VERTICAL SEEK) ===
function attachSeek(bar, vid) {
    let isDragging = false;

    function handleSeek(clientY) {
        const rect = bar.getBoundingClientRect();
        const y = clientY - rect.top;       // от верхнего края
        let ratio = y / rect.height;        // 0 вверху, 1 внизу
        ratio = 1 - ratio;                  // переворачиваем: 0 внизу, 1 вверху

        if (ratio < 0) ratio = 0;
        if (ratio > 1) ratio = 1;

        if (vid.duration && !isNaN(vid.duration)) {
            vid.currentTime = ratio * vid.duration;
        }
    }

    function startDrag(e) {
        e.preventDefault();
        e.stopPropagation();
        isDragging = true;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        handleSeek(clientY);
    }

    function moveDrag(e) {
        if (!isDragging) return;
        e.preventDefault();
        e.stopPropagation();
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        handleSeek(clientY);
    }

    function endDrag(e) {
        if (!isDragging) return;
        e.preventDefault();
        e.stopPropagation();
        isDragging = false;
    }

    // Мышь
    bar.addEventListener('mousedown', startDrag);
    window.addEventListener('mousemove', moveDrag);
    window.addEventListener('mouseup', endDrag);

    // Палец
    bar.addEventListener('touchstart', startDrag, { passive: false });
    window.addEventListener('touchmove', moveDrag, { passive: false });
    window.addEventListener('touchend', endDrag, { passive: false });

    // Одиночный тап/клик
    bar.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        handleSeek(e.clientY);
    });
}

// === 8. СОЗДАНИЕ СЛАЙДА ===
function createSlide(data) {
    const slide = document.createElement('div');
    slide.className = 'video-slide';
    slide.dataset.jsonData = JSON.stringify(data);

    slide.innerHTML = `
        <video class="video-blur-bg" loop muted playsinline src="${data.videoUrl}"></video>
        <div class="video-wrapper">
            <video class="video-player" loop muted playsinline src="${data.videoUrl}"></video>
            <div class="video-progress-container">
                <div class="video-progress-fill"></div>
            </div>
        </div>
    `;

    const vid = slide.querySelector('.video-player');
    const bg = slide.querySelector('.video-blur-bg');
    const fill = slide.querySelector('.video-progress-fill');
    const bar = slide.querySelector('.video-progress-container');

    // Клик по видео: play/pause
    vid.addEventListener('click', () => {
        if (vid.paused) {
            vid.play();
            bg.play();
            uiPlayBtn.querySelector('i').className = 'fas fa-pause';
            uiPlayBtn.classList.add('active');
        } else {
            vid.pause();
            bg.pause();
            uiPlayBtn.querySelector('i').className = 'fas fa-play';
            uiPlayBtn.classList.remove('active');
        }
    });

    // Обновление прогресс-бара
    vid.addEventListener('timeupdate', () => {
        if (vid.duration) {
            fill.style.height = `${(vid.currentTime / vid.duration) * 100}%`;
        }
    });

    // Промотка по фиолетовой полоске
    attachSeek(bar, vid);

    return slide;
}

// === 9. OBSERVER ДЛЯ АВТОПРОИГРЫВАНИЯ ===
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        const slide = entry.target;
        const vid = slide.querySelector('.video-player');
        const bg = slide.querySelector('.video-blur-bg');

        if (entry.isIntersecting) {
            document.querySelectorAll('.video-slide').forEach(s => s.classList.remove('active-slide'));
            slide.classList.add('active-slide');

            try {
                const data = JSON.parse(slide.dataset.jsonData);
                updateGlobalUI(data);
            } catch (e) {}

            vid.currentTime = 0;
            bg.currentTime = 0;

            if (hasInteracted) {
                vid.volume = globalVolume;
                vid.muted = (globalVolume === 0);
            } else {
                vid.muted = true;
            }

            vid.play().then(() => {
                bg.play();
            }).catch(() => {
                vid.muted = true;
                vid.play();
                bg.play();
            });
        } else {
            vid.pause();
            bg.pause();
        }
    });
}, { threshold: 0.6 });

// === 10. РЕНДЕР ЛЕНТЫ ===
function renderFeed(videos, append = false) {
    if (!append) feedContainer.innerHTML = '';
    videos.forEach(v => {
        const slide = createSlide(v);
        feedContainer.appendChild(slide);
        observer.observe(slide);
    });
}

// Подгрузка вниз по скроллу (опционально)
feedContainer.addEventListener('scroll', () => {
    if (feedContainer.scrollHeight - (feedContainer.scrollTop + feedContainer.clientHeight) < 300) {
        if (currentTab === 'foryou') {
            renderFeed(shuffle([...allVideos]), true);
        } else {
            const subs = allVideos.filter(v => subscribedAuthors.includes(v.author));
            if (subs.length > 0) renderFeed(subs, true);
        }
    }
});

// === 11. INIT ===
window.addEventListener('load', async () => {
    await loadVideos();
    updateInd(tabForYou);
    renderFeed(shuffle([...allVideos]));
});
