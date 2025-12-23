const API_BASE = ''; 
const tg = window.Telegram?.WebApp || null;

let globalMuted = localStorage.getItem('niko_muted') !== 'false';
let hasInteracted = false;
let subscribedAuthors = [];

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    if (tg) {
        tg.expand();
        tg.ready();
    }
    initApp();
});

async function initApp() {
    await fetchVideos();
    if (tg?.initDataUnsafe?.user?.id) {
        await loadSubscriptions(tg.initDataUnsafe.user.id);
    }
    setupEventListeners();
}

// === ГЛИТЧ ЭФФЕКТ ===
function triggerGlitch() {
    const feed = document.getElementById('feed');
    feed.classList.add('glitch-active');
    
    if (tg?.HapticFeedback) {
        tg.HapticFeedback.impactOccurred('medium');
    }

    setTimeout(() => {
        feed.classList.remove('glitch-active');
    }, 250);
}

// === API: ЗАГРУЗКА ЛЕНТЫ ===
async function fetchVideos() {
    try {
        const res = await fetch(`${API_BASE}/api/get_feed`);
        const data = await res.json();
        
        if (data.maintenance) {
            window.location.href = 'maintenance.html';
            return;
        }
        renderFeed(data.videos || []);
    } catch (e) {
        console.error("Ошибка Мировой Машины:", e);
    }
}

function renderFeed(videos) {
    const container = document.getElementById('feed');
    container.innerHTML = videos.map((video, i) => `
        <div class="video-slide" data-id="${video.id}" data-author="${video.author}" data-desc="${video.desc}" data-url="${video.videoUrl || video.url}">
            <img src="${video.preview || ''}" class="video-blur-bg">
            <div class="video-wrapper">
                <video class="video-player" loop playsinline preload="auto">
                    <source src="${video.videoUrl || video.url}" type="video/mp4">
                </video>
            </div>
            <div class="video-progress-container">
                <div class="video-progress-fill"></div>
            </div>
        </div>
    `).join('');
    setupObserver();
}

// === OBSERVING (Скролл и Автоплей) ===
function setupObserver() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const video = entry.target.querySelector('video');
            if (entry.isIntersecting) {
                entry.target.classList.add('active-slide');
                updateUI(entry.target);
                
                if (hasInteracted) {
                    video.muted = globalMuted;
                    video.play().catch(e => console.log("Play blocked"));
                }
                
                // Прогресс бар
                const fill = entry.target.querySelector('.video-progress-fill');
                video.ontimeupdate = () => {
                    const p = (video.currentTime / video.duration) * 100;
                    fill.style.height = `${p}%`;
                };
            } else {
                entry.target.classList.remove('active-slide');
                video.pause();
                video.currentTime = 0;
            }
        });
    }, { threshold: 0.7 });

    document.querySelectorAll('.video-slide').forEach(s => observer.observe(s));
}

function updateUI(slide) {
    document.getElementById('ui-author').textContent = `@${slide.dataset.author}`;
    document.getElementById('ui-desc').textContent = slide.dataset.desc || '';
    
    // Проверка подписки
    const isSubbed = subscribedAuthors.includes(slide.dataset.author);
    const suggestBtn = document.getElementById('ui-suggest-btn');
    suggestBtn.style.color = isSubbed ? 'var(--accent-purple)' : 'white';
}

// === API: SHARE & SUBSCRIBE ===
async function shareCurrentVideo() {
    const active = document.querySelector('.active-slide');
    if (!active || !tg?.initDataUnsafe?.user) return;

    try {
        const res = await fetch(`${API_BASE}/api/share`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                videoUrl: active.dataset.url,
                author: active.dataset.author,
                desc: active.dataset.desc,
                user: tg.initDataUnsafe.user
            })
        });
        if (res.ok) tg.showAlert("Видео отправлено в избранное бота!");
    } catch (e) { console.error(e); }
}

async function toggleSubscribe() {
    const active = document.querySelector('.active-slide');
    if (!active || !tg?.initDataUnsafe?.user) return;

    const author = active.dataset.author;
    const isSubbed = subscribedAuthors.includes(author);
    const action = isSubbed ? 'remove' : 'add';

    try {
        const res = await fetch(`${API_BASE}/api/subscribe`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ 
                userId: tg.initDataUnsafe.user.id, 
                author, 
                action 
            })
        });
        if (res.ok) {
            if (action === 'add') subscribedAuthors.push(author);
            else subscribedAuthors = subscribedAuthors.filter(a => a !== author);
            updateUI(active);
        }
    } catch (e) { console.error(e); }
}

async function loadSubscriptions(userId) {
    try {
        const res = await fetch(`${API_BASE}/api/get_subs`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ userId })
        });
        const data = await res.json();
        subscribedAuthors = data.subs || [];
    } catch (e) { console.error(e); }
}

// === СЛУШАТЕЛИ ===
function setupEventListeners() {
    document.getElementById('audio-unlock-overlay').addEventListener('click', function() {
        hasInteracted = true;
        this.classList.add('hidden');
        const v = document.querySelector('.active-slide video');
        if (v) { v.muted = globalMuted; v.play(); }
    });

    document.getElementById('ui-vol-btn').addEventListener('click', () => {
        globalMuted = !globalMuted;
        localStorage.setItem('niko_muted', globalMuted);
        const v = document.querySelector('.active-slide video');
        if (v) v.muted = globalMuted;
        document.querySelector('#ui-vol-btn i').className = globalMuted ? 'fas fa-volume-mute' : 'fas fa-volume-up';
    });

    document.getElementById('ui-share-btn').addEventListener('click', shareCurrentVideo);
    
    // Используем кнопку плюса для подписки
    document.getElementById('ui-suggest-btn').addEventListener('click', toggleSubscribe);
}