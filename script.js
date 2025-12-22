// === ГЛОБАЛЬНЫЕ НАСТРОЙКИ ===
let currentPage = 1;
let isLoading = false;
let noMoreVideos = false;
const feedContainer = document.querySelector('.tiktok-feed');
const observerOptions = { root: null, rootMargin: '0px', threshold: 0.6 };

// === 0. ПРОВЕРКА ТЕХ. РАБОТ ===
async function checkMaintenance() {
    try {
        // Проверяем статус в API (GitHub Pages -> Vercel API)
        const res = await fetch('/api/status');
        const data = await res.json();
        
        if (data.maintenance) {
            // Если включено - редирект на заглушку
            window.location.href = 'maintenance.html';
            return true; // Стоп скрипт
        }
    } catch (e) {
        console.error('Ошибка проверки статуса:', e);
    }
    return false;
}

// === 1. ИНИЦИАЛИЗАЦИЯ ===
document.addEventListener('DOMContentLoaded', async () => {
    // Сначала проверяем, не закрыт ли сайт
    const isClosed = await checkMaintenance();
    if (isClosed) return;

    // Если открыт, грузим ленту
    initFeed();

    // Запускаем бесконечный скролл
    feedContainer.addEventListener('scroll', handleScroll);
    
    // Кнопка разблокировки звука
    document.getElementById('audio-unlock-overlay')?.addEventListener('click', unlockAudio);
});

// === 2. ЛОГИКА ЗАГРУЗКИ (ПАГИНАЦИЯ) ===
async function initFeed() {
    await loadMoreVideos();
}

async function loadMoreVideos() {
    if (isLoading || noMoreVideos) return;
    isLoading = true;

    try {
        console.log(`📡 Загружаю страницу ${currentPage}...`);
        
        // Вставь сюда СВОЙ домен от Vercel
        const API_BASE = 'https://oneshotfeed.vercel.app'; 

        const res = await fetch(`${API_BASE}/api/get_feed?page=${currentPage}`);
        if (!res.ok) throw new Error('Network error');
        
        const newVideos = await res.json();

        if (!newVideos || newVideos.length === 0) {
            console.log("🏁 Видео закончились.");
            noMoreVideos = true;
            if (currentPage === 1) showEmptyMessage();
            return;
        }

        renderVideos(newVideos);
        currentPage++; // Следующая страница

    } catch (e) {
        console.error("Ошибка загрузки:", e);
        if (currentPage === 1) showErrorMessage();
    } finally {
        isLoading = false;
    }
}

// === 3. РЕНДЕРИНГ ВИДЕО ===
function renderVideos(videos) {
    videos.forEach(video => {
        // Защита от битых данных
        if (!video.videoUrl) return;

        const slide = document.createElement('div');
        slide.className = 'video-slide';
        
        // Разметка слайда
        slide.innerHTML = `
            <div class="video-blur-bg"></div>
            <div class="video-wrapper">
                <video class="video-player" 
                       src="${video.videoUrl}" 
                       loop 
                       playsinline 
                       webkit-playsinline
                       preload="metadata"
                       poster="${video.cover || ''}">
                </video>
                
                <!-- Прогресс бар -->
                <div class="video-progress-container">
                    <div class="video-progress-fill"></div>
                </div>

                <!-- Оверлей паузы (иконка) -->
                <div class="pause-overlay" style="display:none;">
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
                     <button class="control-btn btn-share" onclick="shareVideo('${video.videoUrl}', '${video.author}', '${video.desc || ''}')">
                        <i class="fas fa-share"></i>
                    </button>
                    <!-- Кнопка Telegram (если есть юзернейм) -->
                    <button class="control-btn" onclick="window.open('https://t.me/OneShotFeedBot', '_blank')">
                         <i class="fab fa-telegram-plane"></i>
                    </button>
                </div>
            </div>
        `;

        // Установка фона (блюр)
        if (video.cover) {
            slide.querySelector('.video-blur-bg').style.backgroundImage = `url(${video.cover})`;
        }

        // Логика плеера (клик - пауза/плей)
        const videoEl = slide.querySelector('video');
        const wrapper = slide.querySelector('.video-wrapper');
        const pauseOverlay = slide.querySelector('.pause-overlay');
        
        wrapper.addEventListener('click', () => togglePlay(videoEl, pauseOverlay));
        
        // Логика прогресс бара
        setupProgressBar(slide, videoEl);

        // Наблюдатель (чтобы играть только когда видео на экране)
        observer.observe(slide);
        
        feedContainer.appendChild(slide);
    });
}

// === 4. OBSERVER (АВТОПЛЕЙ) ===
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        const video = entry.target.querySelector('video');
        if (!video) return;

        if (entry.isIntersecting) {
            // Видео появилось на экране
            video.currentTime = 0; // Начинаем сначала
            const playPromise = video.play();
            if (playPromise !== undefined) {
                playPromise.catch(() => {
                    // Автоплей заблокирован браузером (нужен тап)
                    console.log('Autoplay blocked');
                });
            }
        } else {
            // Видео ушло с экрана
            video.pause();
        }
    });
}, observerOptions);

// === 5. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===

function togglePlay(video, overlay) {
    if (video.paused) {
        video.play();
        overlay.style.display = 'none';
    } else {
        video.pause();
        overlay.style.display = 'flex';
        overlay.style.justifyContent = 'center';
        overlay.style.alignItems = 'center';
        overlay.style.position = 'absolute';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
    }
}

function setupProgressBar(slide, video) {
    const progressContainer = slide.querySelector('.video-progress-container');
    const progressFill = slide.querySelector('.video-progress-fill');

    // Обновление полоски
    video.addEventListener('timeupdate', () => {
        const percent = (video.currentTime / video.duration) * 100;
        progressFill.style.height = `${percent}%`;
    });

    // Перемотка кликом
    progressContainer.addEventListener('click', (e) => {
        e.stopPropagation(); // Чтобы не сработала пауза
        const rect = progressContainer.getBoundingClientRect();
        const pos = (e.clientY - rect.top) / rect.height; // Vertical progress
        // У тебя прогресс бар вертикальный? Если нет, используй clientX и width
        // Судя по CSS (height: 60%, width: 4px) - он вертикальный справа.
        // Но обычно fill растет снизу вверх. Проверь стили.
        // Если fill bottom: 0, то клик сверху это 0% или 100%?
        // Сделаем стандартно: 
        const percent = 1 - pos; // Инвертируем, если 0 внизу
        video.currentTime = percent * video.duration;
    });
}

// Бесконечный скролл
function handleScroll() {
    const distanceToBottom = feedContainer.scrollHeight - (feedContainer.scrollTop + feedContainer.clientHeight);
    if (distanceToBottom < 800) { // Если осталось меньше 2 экранов
        loadMoreVideos();
    }
}

// Share Logic
async function shareVideo(url, author, desc) {
    // Твой share.js
    if (navigator.share) {
        try {
            await navigator.share({
                title: `Video by @${author}`,
                text: desc || 'Check this out!',
                url: url
            });
        } catch (err) {
            console.log('Share canceled');
        }
    } else {
        // Fallback: копируем ссылку
        navigator.clipboard.writeText(url).then(() => alert('Ссылка скопирована!'));
    }
}

function unlockAudio() {
    const overlay = document.getElementById('audio-unlock-overlay');
    overlay.classList.add('hidden');
    // Находим активное видео и включаем звук
    const activeSlide = document.querySelector('.video-slide'); // Первый слайд
    if (activeSlide) {
        const vid = activeSlide.querySelector('video');
        vid.muted = false;
        vid.play();
    }
}

function showEmptyMessage() {
    const msg = document.createElement('div');
    msg.style.color = 'white';
    msg.style.textAlign = 'center';
    msg.style.marginTop = '50vh';
    msg.innerText = 'Лента пуста. Добавьте видео через бота!';
    feedContainer.appendChild(msg);
}

function showErrorMessage() {
    // Можно показать тост
    console.log("Error loading feed");
}
