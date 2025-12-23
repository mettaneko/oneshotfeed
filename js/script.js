// === КОНФИГ ===
const API_BASE = ''; 
const BATCH_SIZE = 5; 

const tg = window.Telegram?.WebApp || null;
if (tg) { tg.expand(); tg.ready(); }

let allVideosCache = [];
let loadedCount = 0;
let hasInteracted = false;
let globalMuted = localStorage.getItem('niko_muted') !== 'false';
let isSeeking = false;

// === ИНИЦИАЛИЗАЦИЯ ===
document.addEventListener('DOMContentLoaded', () => {
    fetchVideos();
    setupGlobalEvents();
});

async function fetchVideos() {
    try {
        const res = await fetch(`${API_BASE}/api/get_feed`);
        const data = await res.json();
        
        if (data.maintenance) {
            window.location.href = 'maintenance.html';
            return;
        }

        allVideosCache = data.videos || [];
        renderNextBatch();
    } catch (e) {
        console.error("Ошибка синхронизации:", e);
    }
}

// === РЕНДЕР И ЛЕНИВАЯ ЗАГРУЗКА ===
function createSlideHTML(v, i) {
    return `
        <div class="video-slide" data-index="${i}" data-video-data='${JSON.stringify(v)}'>
            <div class="video-wrapper">
                <video class="video-player" loop playsinline>
                    <source src="${v.videoUrl || v.url}" type="video/mp4">
                </video>
            </div>
            <div class="video-progress-container" onmousedown="startSeek(event)" ontouchstart="startSeek(event)">
                <div class="video-progress-fill"></div>
            </div>
        </div>
    `;
}

function renderNextBatch() {
    const feed = document.getElementById('feed');
    const nextBatch = allVideosCache.slice(loadedCount, loadedCount + BATCH_SIZE);
    
    nextBatch.forEach((v, i) => {
        const container = document.createElement('div');
        container.innerHTML = createSlideHTML(v, loadedCount + i);
        const slide = container.firstElementChild;
        feed.appendChild(slide);
        observer.observe(slide);
    });
    
    loadedCount += nextBatch.length;
}

// === УПРАВЛЕНИЕ ВИДЕО (PAUSE & SEEK) ===
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        const video = entry.target.querySelector('video');
        if (entry.isIntersecting) {
            entry.target.classList.add('active-slide');
            updateUI(entry.target);
            
            if (hasInteracted) {
                video.muted = globalMuted;
                video.play().catch(() => {});
            }

            // Обновление прогресс-бара
            const fill = entry.target.querySelector('.video-progress-fill');
            video.ontimeupdate = () => {
                if (!isSeeking) {
                    const p = (video.currentTime / video.duration) * 100;
                    fill.style.height = `${p}%`;
                }
            };

            // Проверка на подгрузку следующей пачки
            const idx = parseInt(entry.target.dataset.index);
            if (idx >= loadedCount - 2 && loadedCount < allVideosCache.length) {
                renderNextBatch();
            }
        } else {
            entry.target.classList.remove('active-slide');
            video.pause();
            video.currentTime = 0;
        }
    });
}, { threshold: 0.6 });

function updateUI(slide) {
    const data = JSON.parse(slide.dataset.videoData);
    document.getElementById('ui-author').textContent = `@${data.author.toLowerCase()}`;
    document.getElementById('ui-desc').textContent = data.desc || '';
}

// === ЛОГИКА ПЕРЕМОТКИ ===
window.startSeek = function(e) {
    isSeeking = true;
    handleSeek(e);
    const moveEvent = e.type === 'touchstart' ? 'touchmove' : 'mousemove';
    const endEvent = e.type === 'touchstart' ? 'touchend' : 'mouseup';
    
    const onMove = (event) => handleSeek(event);
    const onEnd = () => {
        isSeeking = false;
        window.removeEventListener(moveEvent, onMove);
        window.removeEventListener(endEvent, onEnd);
    };

    window.addEventListener(moveEvent, onMove);
    window.addEventListener(endEvent, onEnd);
};

function handleSeek(e) {
    const slide = document.querySelector('.active-slide');
    if (!slide) return;
    const video = slide.querySelector('video');
    const container = slide.querySelector('.video-progress-container');
    const fill = slide.querySelector('.video-progress-fill');
    
    const rect = container.getBoundingClientRect();
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    let pos = 1 - ((clientY - rect.top) / rect.height);
    pos = Math.max(0, Math.min(1, pos));
    
    fill.style.height = `${pos * 100}%`;
    if (video.duration) {
        video.currentTime = video.duration * pos;
    }
}

// === ГЛОБАЛЬНЫЕ СОБЫТИЯ ===
function setupGlobalEvents() {
    // Tap to Pause
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('video-player')) {
            const video = e.target;
            video.paused ? video.play() : video.pause();
        }
    });

    // Unlock Audio
    const overlay = document.getElementById('audio-unlock-overlay');
    if (overlay) {
        overlay.addEventListener('click', () => {
            hasInteracted = true;
            overlay.classList.add('hidden');
            const activeVideo = document.querySelector('.active-slide video');
            if (activeVideo) {
                activeVideo.muted = globalMuted;
                activeVideo.play();
            }
        });
    }

    // Volume Toggle
    document.getElementById('ui-vol-btn').addEventListener('click', () => {
        globalMuted = !globalMuted;
        localStorage.setItem('niko_muted', globalMuted);
        const v = document.querySelector('.active-slide video');
        if (v) v.muted = globalMuted;
        document.querySelector('#ui-vol-btn i').className = globalMuted ? 'fas fa-volume-mute' : 'fas fa-volume-up';
    });

    // Share API Integration
    document.getElementById('ui-share-btn').addEventListener('click', async () => {
        const active = document.querySelector('.active-slide');
        if (!active || !tg?.initDataUnsafe?.user) return;
        const v = JSON.parse(active.dataset.videoData);
        
        try {
            await fetch('/api/share', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ ...v, user: tg.initDataUnsafe.user })
            });
            tg.showAlert("Видео отправлено в бот!");
        } catch(e) { console.error(e); }
    });
}