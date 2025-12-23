// maintenance.js
const API_BASE = 'https://feed.mettaneko.ru'; // Тот же API_BASE, что и в основном скрипте

document.addEventListener('DOMContentLoaded', () => {
    const totpInput = document.getElementById('totp-input');
    const submitBtn = document.getElementById('submit-btn');
    const errorMessage = document.getElementById('error-message');

    submitBtn.addEventListener('click', async () => {
        const token = totpInput.value.trim();
        if (token.length !== 6 || !/^\d{6}$/.test(token)) {
            errorMessage.textContent = 'Код должен состоять из 6 цифр.';
            return;
        }

        errorMessage.textContent = '';
        submitBtn.disabled = true;
        submitBtn.textContent = '...';

        try {
            const response = await fetch(`${API_BASE}/api/verify_totp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token })
            });

            if (response.ok) {
                const data = await response.json();
                if (data.success && data.pass) {
                    // Сохраняем "пропуск" в sessionStorage, чтобы он жил до закрытия вкладки
                    sessionStorage.setItem('maintenance_access_pass', JSON.stringify(data.pass));
                    // Перенаправляем на главную страницу
                    window.location.href = '/'; 
                }
            } else {
                const errorData = await response.json();
                errorMessage.textContent = errorData.error || 'Неверный код.';
            }
        } catch (error) {
            errorMessage.textContent = 'Ошибка сети. Попробуйте снова.';
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Войти';
        }
    });
});
