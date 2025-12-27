// streak.js

(function() {
    // Безопасные константы
    const STREAK_STORAGE_KEY = 'pancake_streak_v1';
    const STREAK_TZ = 'Europe/Moscow';
    const DAILY_TARGET = 5;
    const PROGRESS_THRESHOLD = 0.30;

    // Глобальный объект (делаем его доступным везде)
    window.PancakeStreak = {
        state: {
            todayKey: null,
            todayVideoIds: [],
            todayCompleted: false,
            lastCompleteKey: null,
            streak: 0
        },

        // Инициализация
        init: function() {
            try {
                this.loadState();
                this.ensureToday();
                // Ждем загрузки DOM, если он еще не готов
                if (document.readyState === 'loading') {
                    document.addEventListener('DOMContentLoaded', () => this.renderBadge());
                } else {
                    this.renderBadge();
                }
                console.log('🥞 PancakeStreak initialized');
            } catch (e) {
                console.error('Streak init failed:', e);
            }
        },

        // Получение даты (YYYY-MM-DD)
        dateKeyAt: function(ms) {
            if (!ms) ms = Date.now();
            try {
                const fmt = new Intl.DateTimeFormat('en-CA', {
                    timeZone: STREAK_TZ,
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit'
                });
                return fmt.format(new Date(ms));
            } catch (e) {
                // Фоллбэк, если Intl упал (старые браузеры)
                return new Date(ms).toISOString().split('T')[0];
            }
        },

        // Загрузка из LocalStorage
        loadState: function() {
            try {
                const raw = localStorage.getItem(STREAK_STORAGE_KEY);
                if (raw) {
                    const parsed = JSON.parse(raw);
                    // Простая валидация структуры
                    if (parsed && typeof parsed === 'object') {
                        this.state = { ...this.state, ...parsed };
                    }
                }
            } catch (e) {
                console.warn('Could not load streak state:', e);
            }
        },

        // Сохранение
        saveState: function() {
            try {
                localStorage.setItem(STREAK_STORAGE_KEY, JSON.stringify(this.state));
            } catch (e) {
                console.warn('Could not save streak state:', e);
            }
        },

        // Проверка смены дня
        ensureToday: function() {
            const today = this.dateKeyAt();
            if (this.state.todayKey !== today) {
                this.state.todayKey = today;
                this.state.todayVideoIds = [];
                this.state.todayCompleted = false;
                this.saveState();
            }
        },

        // Отрисовка бейджа
        renderBadge: function() {
            const el = document.getElementById('streak-badge');
            if (!el) return;
            // Защита от undefined
            const currentCount = this.state.todayVideoIds ? this.state.todayVideoIds.length : 0;
            const currentStreak = this.state.streak || 0;
            el.textContent = `${currentStreak} 🥞 · ${currentCount}/${DAILY_TARGET}`;
        },

        // Отметка выполнения дня
        markTodayCompleted: function() {
            if (this.state.todayCompleted) return;

            const yesterday = this.dateKeyAt(Date.now() - 24 * 60 * 60 * 1000);

            if (this.state.lastCompleteKey === yesterday) {
                this.state.streak = (this.state.streak || 0) + 1;
            } else {
                this.state.streak = 1;
            }

            this.state.lastCompleteKey = this.state.todayKey;
            this.state.todayCompleted = true;
            
            this.saveState();
            this.renderBadge();

            // Попытка показать уведомление (если функция есть в window)
            if (window.showCustomNotification) {
                window.showCustomNotification(`Блинный день засчитан! Стрик: ${this.state.streak} 🥞`, { showConfetti: true });
            }
        },

        // Трекинг просмотра
        trackView: function(videoId) {
            if (!videoId) return;
            
            this.ensureToday();

            // Приводим ID к строке для надежности
            const strId = String(videoId);

            if (!this.state.todayVideoIds.includes(strId)) {
                this.state.todayVideoIds.push(strId);
                this.saveState();
                this.renderBadge();
                
                if (this.state.todayVideoIds.length >= DAILY_TARGET) {
                    this.markTodayCompleted();
                }
            }
        },

        // Прикрепление к видео-элементу
        attachToVideo: function(videoElement, videoId) {
            // Защита от дурака
            if (!videoElement || !videoId) return;
            if (videoElement._streakAttached) return; 
            
            const _self = this; // Сохраняем контекст
            videoElement._streakAttached = true;
            let counted = false;

            const checkProgress = function() {
                if (counted) return;
                // Проверка на валидность duration
                if (!videoElement.duration || !isFinite(videoElement.duration) || videoElement.duration <= 0) return;

                const progress = videoElement.currentTime / videoElement.duration;
                
                if (progress >= PROGRESS_THRESHOLD) {
                    _self.trackView(videoId);
                    counted = true;
                    videoElement.removeEventListener('timeupdate', checkProgress);
                }
            };

            videoElement.addEventListener('timeupdate', checkProgress);
            videoElement.addEventListener('ended', function() {
                 if (!counted) {
                     _self.trackView(videoId);
                     counted = true;
                 }
            });
        }
    };

    // Запускаем
    window.PancakeStreak.init();

})();
