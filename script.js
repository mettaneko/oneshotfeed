// === KONFIG ===
const API_BASE = ''; 
const BATCH_SIZE = 5; 
const LOAD_TIMEOUT = 5000; 

// === 0. TELEGRAM WEB APP ===
const tg = window.Telegram?.WebApp || null;
const isVersionAtLeast = (ver) => tg && tg.isVersionAtLeast(ver);
if (tg) { tg.expand(); tg.ready(); }

// === 1. GLOBAL VARS ===
let subscribedAuthors = [];
let hasInteracted = false;
let globalMuted = localStorage.getItem('niko_muted') === 'true';

let allVideosCache = []; 
let queue = [];          
let currentTab = 'foryou';

const showNotify = (msg) => (isVersionAtLeast('6.2') ? tg.showAlert(msg) : alert(msg));

// === 2. FETCH & QUEUE ===
async function fetchVideos(isUpdate = false) {
    try {
        const res = await fetch(`${API_BASE}/api/get_feed`);
        const data = await res.json();
        if (data.videos) {
            const currentIds = new Set(allVideosCache.map(v => v.id));
            const fresh = data.videos.filter(v => v && !currentIds.has(v.id));
            if (fresh.length > 0) {
                allVideosCache = [...fresh, ...allVideosCache];
                if (!isUpdate) prepareQueue(currentTab);
            }
        }
    } catch (e) { console.error("Load error:", e); }
}

function prepareQueue(type) {
    let source = (type === 'foryou') 
        ? [...allVideosCache] 
        : allVideosCache.filter(v => subscribedAuthors.includes(v.author));
    queue = source.sort(() => Math.random() - 0.5);
    document.getElementById('feed').innerHTML = '';
    addVideosToDom(BATCH_SIZE);
}

function addVideosToDom(count) {
    const chunk = queue.splice(0, count);
    chunk.forEach(v => {
        const slide = createSlide(v);
        document.getElementById('feed').appendChild(slide);
        observer.observe(slide);
    });
}

// === 3. PLAYER LOGIC ===
function createSlide(data) {
    const slide = document.createElement('div');
    slide.className = 'video-slide';
    slide.dataset.videoData = JSON.stringify(data);
    
    slide.innerHTML = `
        <video class="video-blur-bg" loop muted playsinline src="${data.videoUrl}"></video>
        <div class="video-wrapper">
            <video class="video-player" loop playsinline poster="${data.cover || ''}" src="${data.videoUrl}"></video>
            <div class="video-spinner"><i class="fas fa-spinner fa-spin"></i></div>
            <div class="video-progress-container"><div class="video-progress-fill"></div></div>
        </div>`;
        
    const vid = slide.querySelector('.video-player');
    const bg = slide.querySelector('.video-blur-bg');
    const fill = slide.querySelector('.video-progress-fill');
    const progressCont = slide.querySelector('.video-progress-container');
    const spinner = slide.querySelector('.video-spinner');

    let loadTimer;

    const toggleErrorUI = (isError) => {
        if (isError) {
            progressCont.classList.add('error-state');
            spinner.style.display = 'block';
        } else {
            progressCont.classList.remove('error-state');
            spinner.style.display = 'none';
        }
    };

    vid.addEventListener('waiting', () => {
        if (!slide.classList.contains('active-slide')) return;
        loadTimer = setTimeout(() => toggleErrorUI(true), LOAD_TIMEOUT);
    });

    vid.addEventListener('playing', () => {
        clearTimeout(loadTimer);
        toggleErrorUI(false);
    });

    vid.addEventListener('timeupdate', () => { 
        if(vid.duration && slide.classList.contains('active-slide')) {
            fill.style.height = `${(vid.currentTime / vid.duration) * 100}%`;
        }
    });

    vid.addEventListener('error', () => {
        if (slide.classList.contains('active-slide')) {
            vid.load(); vid.play();
        }
    });

    slide.addEventListener('click', () => {
        if (vid.paused) { vid.play(); bg.play(); } 
        else { vid.pause(); bg.pause(); }
    });
    
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
            const data = JSON.parse(slide.dataset.videoData);
            document.getElementById('ui-author').innerText = `@${data.author}`;
            document.getElementById('ui-desc').innerText = data.desc || '';
            vid.muted = globalMuted || !hasInteracted;
            vid.play().then(() => bg.play()).catch(() => { vid.muted = true; vid.play(); });
            if (!slide.nextElementSibling) addVideosToDom(BATCH_SIZE);
        } else {
            vid.pause(); bg.pause(); vid.muted = true;
        }
    });
}, { threshold: 0.7 });

// === 4. BUTTONS ===
document.getElementById('ui-vol-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    globalMuted = !globalMuted;
    localStorage.setItem('niko_muted', globalMuted);
    document.querySelector('#ui-vol-btn i').className = globalMuted ? 'fas fa-volume-mute' : 'fas fa-volume-up';
    const activeVid = document.querySelector('.active-slide .video-player');
    if (activeVid) { activeVid.muted = globalMuted; activeVid.volume = globalMuted ? 0 : 1; }
});

document.getElementById('sug-send').addEventListener('click', async () => {
    const btn = document.getElementById('sug-send');
    const url = document.getElementById('sug-url').value.trim();
    if (!url) return showNotify('Вставь ссылку!');
    btn.disabled = true;
    try {
        const res = await fetch(`${API_BASE}/api/suggest`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                url, author: document.getElementById('sug-author').value,
                desc: document.getElementById('sug-desc').value,
                user: tg?.initDataUnsafe?.user || { id: 0 }
            })
        });
        if (res.ok) { showNotify('Отправлено!'); document.getElementById('suggest-form').style.display = 'none'; }
    } catch (e) { showNotify('Ошибка сети'); }
    btn.disabled = false;
});

document.getElementById('ui-share-btn').addEventListener('click', async (e) => {
    e.stopPropagation();
    const active = document.querySelector('.active-slide');
    if (!active) return;
    const v = JSON.parse(active.dataset.videoData);
    try {
        await fetch(`${API_BASE}/api/share`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ ...v, user: tg?.initDataUnsafe?.user })
        });
        showNotify('Видео отправлено в бот!');
    } catch(e) { showNotify('Ошибка'); }
});

document.getElementById('audio-unlock-overlay').addEventListener('click', () => {
    hasInteracted = true;
    document.getElementById('audio-unlock-overlay').remove();
    const v = document.querySelector('.active-slide .video-player');
    if (v) { v.muted = globalMuted; v.play(); }
});

window.addEventListener('load', () => {
    document.querySelector('#ui-vol-btn i').className = globalMuted ? 'fas fa-volume-mute' : 'fas fa-volume-up';
    fetchVideos();
});