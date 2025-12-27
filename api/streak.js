// streak.js

const STREAK_STORAGE_KEY = 'pancake_streak_v1';
const STREAK_TZ = 'Europe/Moscow';
const DAILY_TARGET = 5;
const PROGRESS_THRESHOLD = 0.30; // 30% видео надо посмотреть

const PancakeStreak = {
    state: {
        todayKey: null,
        todayVideoIds: [],
        todayCompleted: false,
        lastCompleteKey: null,
        streak: 0
    },

    init() {
        this.loadState();
        this.ensureToday();
        this.renderBadge();
    },

    dateKeyAt(ms = Date.now()) {
        // Формат YYYY-MM-DD в московском времени
        const fmt = new Intl.DateTimeFormat('en-CA', {
            timeZone: STREAK_TZ,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
        return fmt.format(new Date(ms));
    },

    loadState() {
        try {
            const raw = localStorage.getItem(STREAK_STORAGE_KEY);
            if (raw) this.state = JSON.parse(raw);
        } catch (e) {}
    },

    saveState() {
        localStorage.setItem(STREAK_STORAGE_KEY, JSON.stringify(this.state));
    },

    ensureToday() {
        const today = this.dateKeyAt();
        if (this.state.todayKey !== today) {
            this.state.todayKey = today;
            this.state.todayVideoIds = []; // Сброс списка просмотренных сегодня
            this.state.todayCompleted = false; // Сброс флага "день выполнен"
            this.saveState();
        }
    },

    renderBadge() {
        const el = document.getElementById('streak-badge');
        if (!el) return;
        el.textContent = `${this.state.streak} 🥞 · ${this.state.todayVideoIds.length}/${DAILY_TARGET}`;
    },

    markTodayCompleted() {
        if (this.state.todayCompleted) return;

        // Проверяем, был ли вчерашний день засчитан для продолжения стрика
        const yesterday = this.dateKeyAt(Date.now() - 24 * 60 * 60 * 1000);

        if (this.state.lastCompleteKey === yesterday) {
            this.state.streak += 1;
        } else {
            this.state.streak = 1; // Сброс стрика, если пропустили день
        }

        this.state.lastCompleteKey = this.state.todayKey;
        this.state.todayCompleted = true;
        
        this.saveState();
        this.renderBadge();

        // Показываем уведомление (используем глобальную функцию из script.js, если доступна)
        if (typeof showCustomNotification === 'function') {
            showCustomNotification(`Блинный день засчитан! Стрик: ${this.state.streak} 🥞`, { showConfetti: true });
        }
    },

    trackView(videoId) {
        if (!videoId) return;
        
        this.ensureToday();

        // Если видео еще не засчитано сегодня
        if (!this.state.todayVideoIds.includes(String(videoId))) {
            this.state.todayVideoIds.push(String(videoId));
            this.saveState();
            this.renderBadge();
            
            // Проверка на выполнение цели дня
            if (this.state.todayVideoIds.length >= DAILY_TARGET) {
                this.markTodayCompleted();
            }
        }
    },

    // Логика отслеживания прогресса видео
    attachToVideo(videoElement, videoId) {
        if (!videoElement || !videoId) return;
        if (videoElement._streakAttached) return; // Чтобы не вешать листенеры дважды
        
        videoElement._streakAttached = true;
        let counted = false;

        const checkProgress = () => {
            if (counted) return;
            if (!videoElement.duration) return;

            const progress = videoElement.currentTime / videoElement.duration;
            
            // Условие: Прогресс > 30% ИЛИ (видео короткое и почти конец)
            // Дополнительно можно проверять 'ended', но для лупов это сложно.
            // Поэтому 30% - надежный критерий вовлеченности.
            if (progress >= PROGRESS_THRESHOLD) {
                this.trackView(videoId);
                counted = true;
                // Можно отписаться, чтобы не грузить проц
                videoElement.removeEventListener('timeupdate', checkProgress);
            }
        };

        videoElement.addEventListener('timeupdate', checkProgress);
        
        // Также засчитываем, если видео закончилось (для очень коротких видео)
        videoElement.addEventListener('ended', () => {
             if (!counted) {
                 this.trackView(videoId);
                 counted = true;
             }
        });
    }
};

// Авто-инициализация
window.addEventListener('load', () => {
    PancakeStreak.init();
});
