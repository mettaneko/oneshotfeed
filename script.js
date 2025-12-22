// === НАСТРОЙКИ ===
// 👇 ВСТАВЬ СЮДА ССЫЛКУ ИЗ VERCEL (например: https://oneshotfeed.vercel.app)
// БЕЗ СЛЕША В КОНЦЕ!
const API_BASE = 'https://niko-feed.vercel.app'; 

let currentPage = 1;
let isLoading = false;
let noMoreVideos = false;
const feedContainer = document.querySelector('.tiktok-feed');

// Опции для автоплея (когда видео появляется на экране)
const observerOptions = { root: null, rootMargin: '0px', threshold: 0.6 };

// === 1. ПРОВЕРКА ТЕХ. РАБОТ ===
async function checkMaintenance() {
    try {
        if (!API_BASE.includes('http')) {
            console.warn('⚠️ API_BASE не настроен в script.js! Локальная версия может не работать.');
            return false;
        }
        const res = await fetch(`${API_BASE}/api/status`);
        const data = await res.json();
        
        if (data.maintenance) {
            window.location.href = 'maintenance.html';
            return true;
        }
    } catch (e) {
        console.error('Ошибка проверки статуса:', e);
    }
    return false;
}

// === 2. ИНИЦИАЛИЗАЦИЯ ===
document.addEventListener('DOMContentLoaded', async () => {
    // Шторка звука
    const unlockOverlay = document.getElementById('audio-unlock-overlay');
    if (unlockOverlay) {
        unlockOverlay.addEventListener('click', unlockAudio);
    }

    const isClosed = await checkMaintenance();
    if (isClosed) return;

    // Загрузка ленты
    await loadMoreVideos();

    // Бесконечный скролл
    feedContainer.addEventListener('scroll', handleScroll);
});

// === 3. ЛОГИКА ЗАГРУЗКИ (ПАГИНАЦИЯ) ===
async function loadMoreVideos() {
    if (isLoading || noMoreVideos) return;
    isLoading = true;

    try {
        console.log(`📡 Загружаю страницу ${currentPage}...`);
        
        const res = await fetch(`${API_BASE}/api/get_feed?page=${currentPage}`);
        if (!res.ok) throw new Error(`Ошибка сети: ${res.status}`);
        
        const newVideos = await res.json();

        if (!newVideos || newVideos.length === 0) {
            console.log("🏁 Видео закончились.");
            noMoreVideos = true;
            if (currentPage === 1) showEmptyMessage();
            return;
        }

        renderVideos(newVideos);
        currentPage++; // Готовим следующую страницу

    } catch (e) {
        console.error("Ошибка загрузки:", e);
        if (currentPage === 1) showErrorMessage();
    } finally {
        isLoading = false;
    }
}

// === 4. РЕНДЕРИНГ (ТВОИ КНОПКИ И ДИЗАЙН) ===
function renderVideos(videos) {
    videos.forEach(video => {
        if (!video.videoUrl) return;

        const slide = document.createElement('div');
        slide.className = 'video-slide';
        
        // Вставляем HTML (Твой дизайн сохранен)
        slide.innerHTML = `
            <div class="video-blur-bg" style="background-image: url('${video.cover || ''}')"></div>
            <div class="video-wrapper">
                <video class="video-player" 
                       src="${video.videoUrl}" 
                       loop 
                       playsinline 
                       webkit-playsinline
                       poster="${video.cover || ''}"
                       preload="metadata">
                </video>
                
                <!-- Прогресс бар -->
                <div class="video-progress-container">
                    <div class="video-progress-fill"></div>
                </div>

                <!-- Пауза -->
                <div class="pause-overlay" style="display:none; position:absolute; top:0; left:0; width:100%; height:100%; justify-content:center; align-items:center; z-index:5;">
                   <i class="fas fa-play" style="font-size: 3rem; color: rgba(255,255,255,0.5);"></i>
                </div>
            </div>

            <!-- Интерфейс -->
            <div class="liquid-controls-container">
                <div class="video-info-capsule">
                    <div class="author-row">
                        <h3 class="author-name">@${video.author || 'unknown'}</h3>
                    </div>
                    ${video.desc ? `<p class="video-desc">${video.desc}</p>` : ''}
                </div>

                <div class="glass-deck">
                    <!-- Кнопка Share (Через твой share.js) -->
                     <button class="control-btn btn-share" onclick="shareVideo('${video.videoUrl}', '${video.author}', '${video.desc ? video.desc.replace(/'/g, "\\'") : ''}')">
                        <i class="fas fa-share"></i>
                    </button>
                    
                    <!-- Кнопка Telegram -->
                    <button class="control-btn" onclick="window.open('https://t.me/OneShotFeedBot', '_blank')">
                         <i class="fab fa-telegram-plane"></i>
                    </button>

                     <!-- Кнопка Volume (Заглушка для красоты, т.к. звук общий) -->
                    <button class="control-btn">
                         <i class="fas fa-volume-up"></i>
                    </button>
                </div>
            </div>
        `;

        // Логика плеера
        const videoEl = slide.querySelector('video');
        const wrapper = slide.querySelector('.video-wrapper');
        const pauseOverlay = slide.querySelector('.pause-overlay');

        // Клик по видео -> Пауза/Плей
        wrapper.addEventListener('click', () => {
            if (videoEl.paused) {
                videoEl.play();
                pauseOverlay.style.display = 'none';
            } else {
                videoEl.pause();
                pauseOverlay.style.display = 'flex';
            }
        });

        // Прогресс бар
        setupProgressBar(slide, videoEl);

        // Добавляем в наблюдатель (для автоплея при скролле)
        observer.observe(slide);
        
        feedContainer.appendChild(slide);
    });
}

// === 5. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===

// Intersection Observer (Автоплей)
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        const video = entry.target.querySelector('video');
        if (!video) return;

        if (entry.isIntersecting) {
            // Видео на экране
            video.currentTime = 0;
            const p = video.play();
            if (p !== undefined) {
                p.catch(() => { /* Автоплей заблокирован до клика */ });
            }
        } else {
            // Видео ушло
            video.pause();
        }
    });
}, observerOptions);

function setupProgressBar(slide, video) {
    const progressFill = slide.querySelector('.video-progress-fill');
    video.addEventListener('timeupdate', () => {
        const percent = (video.currentTime / video.duration) * 100;
        progressFill.style.height = `${percent}%`;
    });
}

function handleScroll() {
    const distanceToBottom = feedContainer.scrollHeight - (feedContainer.scrollTop + feedContainer.clientHeight);
    if (distanceToBottom < 800) { 
        loadMoreVideos();
    }
}

// Твоя функция Share
async function shareVideo(url, author, desc) {
    // Если поддерживается нативный шаринг (телефон)
    if (navigator.share) {
        try {
            await navigator.share({
                title: `Video by @${author}`,
                text: desc,
                url: url
            });
        } catch (err) {}
    } else {
        // Если ПК - просто копируем
        navigator.clipboard.writeText(url).then(() => alert('Ссылка скопирована!'));
    }
}

function unlockAudio() {
    const overlay = document.getElementById('audio-unlock-overlay');
    if (overlay) overlay.classList.add('hidden');
    
    // Включаем первое видео
    const firstVid = document.querySelector('video');
    if (firstVid) {
        firstVid.muted = false;
        firstVid.play();
    }
}

function showEmptyMessage() {
    const msg = document.createElement('div');
    msg.style.cssText = 'color: white; text-align: center; margin-top: 50vh; font-family: sans-serif;';
    msg.innerText = 'Лента пуста. Добавь видео в бота!';
    feedContainer.appendChild(msg);
}

function showErrorMessage() {
    console.log("Ошибка загрузки фида.");
}
