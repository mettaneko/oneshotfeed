const tg = window.Telegram?.WebApp || null;
let globalMuted = true;
let hasInteracted = false;

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    if (tg) { tg.expand(); tg.ready(); }
    fetchVideos();
    setupEvents();
});

async function fetchVideos() {
    try {
        const res = await fetch('/api/get_feed');
        const data = await res.json();
        if (data.maintenance) { window.location.href = 'maintenance.html'; return; }
        renderFeed(data.videos || []);
    } catch (e) { console.error("Feed error", e); }
}

function renderFeed(videos) {
    const feed = document.getElementById('feed');
    feed.innerHTML = videos.map(v => `
        <div class="video-slide" data-author="${v.author}" data-desc="${v.desc || ''}" data-url="${v.videoUrl || v.url}">
            <img src="${v.preview || ''}" class="video-blur-bg">
            <div class="video-wrapper">
                <video class="video-player" loop playsinline>
                    <source src="${v.videoUrl || v.url}" type="video/mp4">
                </video>
            </div>
            <div class="video-progress-container"><div class="video-progress-fill"></div></div>
        </div>
    `).join('');
    setupObserver();
}

function setupObserver() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const video = entry.target.querySelector('video');
            if (entry.isIntersecting) {
                entry.target.classList.add('active-slide');
                updateUI(entry.target);
                if (hasInteracted) { video.muted = globalMuted; video.play(); }
                
                const fill = entry.target.querySelector('.video-progress-fill');
                video.ontimeupdate = () => {
                    fill.style.height = (video.currentTime / video.duration * 100) + '%';
                };
            } else {
                video.pause();
                video.currentTime = 0;
            }
        });
    }, { threshold: 0.7 });
    document.querySelectorAll('.video-slide').forEach(s => observer.observe(s));
}

function updateUI(slide) {
    document.getElementById('ui-author').textContent = `@${slide.dataset.author}`;
    document.getElementById('ui-desc').textContent = slide.dataset.desc;
}

function setupEvents() {
    document.getElementById('audio-unlock-overlay').addEventListener('click', function() {
        hasInteracted = true;
        this.classList.add('hidden');
        const v = document.querySelector('.active-slide video');
        if (v) { v.muted = globalMuted; v.play(); }
    });

    document.getElementById('ui-vol-btn').addEventListener('click', () => {
        globalMuted = !globalMuted;
        const v = document.querySelector('.active-slide video');
        if (v) v.muted = globalMuted;
        document.querySelector('#ui-vol-btn i').className = globalMuted ? 'fas fa-volume-mute' : 'fas fa-volume-up';
    });
}