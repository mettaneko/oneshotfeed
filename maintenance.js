const SESSION_DURATION = 5 * 60 * 1000; // 5 минут

        // 1. ПРОВЕРКА СУЩЕСТВУЮЩЕГО ТОКЕНА
        function isTokenValid() {
            const token = localStorage.getItem('admin_bypass_token');
            if (!token) return false;
            try {
                const payload = JSON.parse(atob(token));
                // Если прошло меньше 5 минут
                if (Date.now() - payload.ts < SESSION_DURATION) {
                    return true;
                }
            } catch (e) {}
            localStorage.removeItem('admin_bypass_token'); // Удаляем тухлый
            return false;
        }

        if (isTokenValid()) {
            window.location.href = '/';
        }

        // 2. ПРОВЕРКА: ЗАКОНЧИЛИСЬ ЛИ РАБОТЫ?
        setInterval(() => {
            fetch('/api/get_feed')
                .then(r => r.json())
                .then(d => {
                    // Если maintenance: false, пускаем всех
                    if (!d.maintenance) window.location.href = '/';
                })
                .catch(() => {});
        }, 5000);

        // 3. ЛОГИКА ВВОДА КОДА
        const input = document.getElementById('2fa-input');
        const err = document.getElementById('error-text');
        const spinner = document.getElementById('loading-spinner');

        input.addEventListener('input', async (e) => {
            const val = input.value;
            
            if (val.length === 6) {
                input.disabled = true;
                spinner.style.display = 'block';
                err.classList.remove('show');

                try {
                    const res = await fetch('/api/auth', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ code: val })
                    });

                    if (res.ok) {
                        const data = await res.json();
                        // Сохраняем токен
                        localStorage.setItem('admin_bypass_token', data.token);
                        
                        input.style.borderColor = '#4cd964';
                        input.style.color = '#4cd964';
                        
                        setTimeout(() => window.location.href = '/', 500);
                    } else {
                        throw new Error('Invalid code');
                    }
                } catch (e) {
                    spinner.style.display = 'none';
                    input.disabled = false;
                    input.focus();
                    
                    err.classList.add('show');
                    input.style.borderColor = '#ff6961'; 
                    
                    setTimeout(() => {
                        input.value = '';
                        input.style.borderColor = 'rgba(255,255,255,0.1)';
                        input.style.color = 'white';
                        err.classList.remove('show');
                    }, 1500);
                }
            }
        });