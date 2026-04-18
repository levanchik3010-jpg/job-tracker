// ========== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ==========
let token = localStorage.getItem('token');
let allVacancies = [];
let currentPage = 1;
let itemsPerPage = 6;
let currentSearch = '';
let chart = null;

// ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========
function showMessage(msg, type) {
    const msgDiv = document.getElementById('authMessage');
    if (!msgDiv) return;
    msgDiv.innerHTML = `<div class="message message-${type}">${msg}</div>`;
    setTimeout(() => {
        msgDiv.innerHTML = '';
    }, 3000);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ========== ПАГИНАЦИЯ ==========
function renderPagination(totalItems) {
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const paginationContainer = document.getElementById('pagination');
    
    if (!paginationContainer) return;
    
    if (totalPages <= 1) {
        paginationContainer.innerHTML = '';
        return;
    }
    
    let html = '';
    
    if (currentPage > 1) {
        html += `<button class="page-btn" onclick="goToPage(${currentPage - 1})">← Назад</button>`;
    }
    
    for (let i = 1; i <= totalPages; i++) {
        if (i === currentPage) {
            html += `<button class="page-btn active">${i}</button>`;
        } else {
            html += `<button class="page-btn" onclick="goToPage(${i})">${i}</button>`;
        }
    }
    
    if (currentPage < totalPages) {
        html += `<button class="page-btn" onclick="goToPage(${currentPage + 1})">Вперёд →</button>`;
    }
    
    paginationContainer.innerHTML = html;
}

function goToPage(page) {
    currentPage = page;
    displayVacancies();
}

function displayVacancies() {
    let filtered = allVacancies;
    if (currentSearch) {
        const searchLower = currentSearch.toLowerCase();
        filtered = allVacancies.filter(v => 
            v.company.toLowerCase().includes(searchLower) || 
            v.position.toLowerCase().includes(searchLower)
        );
    }
    
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const pageItems = filtered.slice(start, end);
    
    const container = document.getElementById('vacanciesList');
    if (!container) return;
    
    if (pageItems.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:2rem; background:white; border-radius:20px;">📭 Нет вакансий</div>';
        renderPagination(0);
        return;
    }
    
    const statusNames = {
        'applied': '📤 Отклик',
        'interview': '📞 Собеседование',
        'offer': '🎉 Оффер',
        'rejected': '❌ Отказ',
        'accepted': '✅ Принят'
    };
    
    container.innerHTML = pageItems.map(v => `
        <div class="vacancy-card" data-id="${v.id}">
            <div class="vacancy-header">
                <div class="vacancy-company">🏢 ${escapeHtml(v.company)}</div>
                <div class="vacancy-position">💼 ${escapeHtml(v.position)}</div>
            </div>
            <div class="vacancy-body">
                <div class="status-badge status-${v.status}">${statusNames[v.status]}</div>
                ${v.salary ? `<div class="vacancy-info">💰 ${escapeHtml(v.salary)}</div>` : ''}
                ${v.url ? `<div class="vacancy-info">🔗 <a href="${escapeHtml(v.url)}" target="_blank">Ссылка на вакансию</a></div>` : ''}
                ${v.notes ? `<div class="vacancy-info">📝 ${escapeHtml(v.notes)}</div>` : ''}
                <div class="vacancy-info">📅 Добавлено: ${new Date(v.applied_at).toLocaleDateString()}</div>
                <div class="vacancy-actions">
                    <select onchange="updateStatus(${v.id}, this.value)">
                        <option value="applied" ${v.status === 'applied' ? 'selected' : ''}>📤 Отклик</option>
                        <option value="interview" ${v.status === 'interview' ? 'selected' : ''}>📞 Собеседование</option>
                        <option value="offer" ${v.status === 'offer' ? 'selected' : ''}>🎉 Оффер</option>
                        <option value="rejected" ${v.status === 'rejected' ? 'selected' : ''}>❌ Отказ</option>
                        <option value="accepted" ${v.status === 'accepted' ? 'selected' : ''}>✅ Принят</option>
                    </select>
                    <button class="delete-vacancy-btn" onclick="deleteVacancy(${v.id})">🗑️ Удалить</button>
                </div>
            </div>
        </div>
    `).join('');
    
    renderPagination(filtered.length);
}

// ========== ПОИСК ==========
function searchVacancies() {
    currentSearch = document.getElementById('searchInput').value;
    currentPage = 1;
    displayVacancies();
}

// ========== РЕГИСТРАЦИЯ И ВХОД ==========
function showRegister() {
    document.getElementById('loginForm').classList.add('hidden');
    document.getElementById('registerForm').classList.remove('hidden');
    document.getElementById('authTitle').innerText = '📝 Регистрация';
}

function showLogin() {
    document.getElementById('registerForm').classList.add('hidden');
    document.getElementById('loginForm').classList.remove('hidden');
    document.getElementById('authTitle').innerText = '🔐 Вход в систему';
}

async function register() {
    const username = document.getElementById('regUsername').value;
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPassword').value;

    const response = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password })
    });

    if (response.ok) {
        showMessage('✅ Регистрация успешна!', 'success');
        showLogin();
    } else {
        showMessage('❌ Ошибка регистрации', 'error');
    }
}

async function login() {
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;

    const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });

    if (response.ok) {
        const data = await response.json();
        token = data.access_token;
        localStorage.setItem('token', token);
        localStorage.setItem('username', username);
        document.getElementById('authForm').classList.add('hidden');
        document.getElementById('mainContent').classList.remove('hidden');
        document.getElementById('userInfo').classList.remove('hidden');
        document.getElementById('userName').innerHTML = `👋 ${username}`;
        loadVacancies();
        loadStats();
        loadNotifications();
        loadChart();
    } else {
        showMessage('❌ Неверные данные', 'error');
    }
}

function logout() {
    localStorage.clear();
    location.reload();
}

// ========== ЭКСПОРТ CSV ==========
async function exportCSV() {
    if (!token) {
        alert('Сначала войдите в систему');
        return;
    }
    
    try {
        const response = await fetch('/api/export/csv', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
            throw new Error('Ошибка экспорта');
        }
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'vacancies.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        showMessage('✅ Экспорт выполнен!', 'success');
    } catch (error) {
        showMessage('❌ Ошибка экспорта', 'error');
    }
}

// ========== РАБОТА С ВАКАНСИЯМИ ==========
async function addVacancy() {
    const company = document.getElementById('company').value;
    const position = document.getElementById('position').value;
    const salary = document.getElementById('salary').value;
    const url = document.getElementById('url').value;
    const notes = document.getElementById('notes').value;

    if (!company || !position) {
        showMessage('❌ Заполните компанию и должность', 'error');
        return;
    }

    const response = await fetch('/api/vacancies', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ company, position, salary, url, notes })
    });

    if (response.ok) {
        document.getElementById('company').value = '';
        document.getElementById('position').value = '';
        document.getElementById('salary').value = '';
        document.getElementById('url').value = '';
        document.getElementById('notes').value = '';
        loadVacancies();
        loadStats();
        loadChart();
        showMessage('✅ Вакансия добавлена!', 'success');
    } else {
        showMessage('❌ Ошибка при добавлении', 'error');
    }
}

async function updateStatus(vacancyId, status) {
    const response = await fetch(`/api/vacancies/${vacancyId}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status, notes: '' })
    });
    
    if (response.ok) {
        loadVacancies();
        loadStats();
        loadChart();
        showMessage('✅ Статус обновлён!', 'success');
    }
}

async function deleteVacancy(vacancyId) {
    if (confirm('Удалить вакансию?')) {
        const card = document.querySelector(`.vacancy-card[data-id="${vacancyId}"]`);
        if (card) {
            card.style.animation = 'fadeOut 0.2s ease forwards';
        }
        
        setTimeout(async () => {
            const response = await fetch(`/api/vacancies/${vacancyId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                loadVacancies();
                loadStats();
                loadChart();
                showMessage('✅ Вакансия удалена', 'success');
            }
        }, 150);
    }
}

// ========== ЗАГРУЗКА ДАННЫХ ==========
async function loadVacancies() {
    const container = document.getElementById('vacanciesList');
    if (container) {
        container.innerHTML = `
            <div class="skeleton" style="height: 220px; border-radius: 16px;"></div>
            <div class="skeleton" style="height: 220px; border-radius: 16px;"></div>
            <div class="skeleton" style="height: 220px; border-radius: 16px;"></div>
        `;
    }
    
    const response = await fetch('/api/vacancies', {
        headers: { 'Authorization': `Bearer ${token}` }
    });

    if (response.ok) {
        allVacancies = await response.json();
        currentPage = 1;
        displayVacancies();
    }
}

async function loadStats() {
    const response = await fetch('/api/vacancies', {
        headers: { 'Authorization': `Bearer ${token}` }
    });

    if (response.ok) {
        const vacancies = await response.json();
        const stats = {
            total: vacancies.length,
            applied: vacancies.filter(v => v.status === 'applied').length,
            interview: vacancies.filter(v => v.status === 'interview').length,
            offer: vacancies.filter(v => v.status === 'offer').length,
            accepted: vacancies.filter(v => v.status === 'accepted').length,
            rejected: vacancies.filter(v => v.status === 'rejected').length
        };

        const statsContainer = document.getElementById('stats');
        if (statsContainer) {
            statsContainer.innerHTML = `
                <div class="stat-card"><div class="stat-number">${stats.total}</div><div class="stat-label">Всего</div></div>
                <div class="stat-card"><div class="stat-number">${stats.applied}</div><div class="stat-label">Отклики</div></div>
                <div class="stat-card"><div class="stat-number">${stats.interview}</div><div class="stat-label">Собеседования</div></div>
                <div class="stat-card"><div class="stat-number">${stats.offer}</div><div class="stat-label">Офферы</div></div>
                <div class="stat-card"><div class="stat-number">${stats.accepted}</div><div class="stat-label">Принято</div></div>
                <div class="stat-card"><div class="stat-number">${stats.rejected}</div><div class="stat-label">Отказы</div></div>
            `;
        }
    }
}

async function loadNotifications() {
    const response = await fetch('/api/expired', {
        headers: { 'Authorization': `Bearer ${token}` }
    });

    if (response.ok) {
        const expired = await response.json();
        const container = document.getElementById('notificationsList');
        const notificationsBlock = document.getElementById('notifications');
        
        if (expired.length > 0 && notificationsBlock && container) {
            notificationsBlock.style.display = 'block';
            container.innerHTML = expired.map(v => `
                <div class="notification-item">
                    <strong>${escapeHtml(v.company)}</strong> — ${escapeHtml(v.position)}<br>
                    <small>⚠️ Не обновлялось более 14 дней</small>
                </div>
            `).join('');
        } else if (notificationsBlock) {
            notificationsBlock.style.display = 'none';
        }
    }
}

async function loadChart() {
    const response = await fetch('/api/vacancies', {
        headers: { 'Authorization': `Bearer ${token}` }
    });

    if (response.ok) {
        const vacancies = await response.json();
        const statusCounts = {
            'applied': 0,
            'interview': 0,
            'offer': 0,
            'rejected': 0,
            'accepted': 0
        };
        
        vacancies.forEach(v => {
            if (statusCounts.hasOwnProperty(v.status)) {
                statusCounts[v.status]++;
            }
        });
        
        const ctx = document.getElementById('statusChart');
        if (!ctx) return;
        
        const context = ctx.getContext('2d');
        
        if (chart) {
            chart.destroy();
        }
        
        chart = new Chart(context, {
            type: 'doughnut',
            data: {
                labels: ['Отклики', 'Собеседования', 'Офферы', 'Отказы', 'Принято'],
                datasets: [{
                    data: [
                        statusCounts.applied,
                        statusCounts.interview,
                        statusCounts.offer,
                        statusCounts.rejected,
                        statusCounts.accepted
                    ],
                    backgroundColor: ['#e2e8f0', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6'],
                    borderWidth: 0,
                    hoverOffset: 10
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                cutout: '60%',
                plugins: {
                    legend: { 
                        position: 'bottom',
                        labels: {
                            font: { size: 11 },
                            usePointStyle: true,
                            boxWidth: 8
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const label = context.label || '';
                                const value = context.raw || 0;
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percent = total > 0 ? Math.round((value / total) * 100) : 0;
                                return `${label}: ${value} (${percent}%)`;
                            }
                        }
                    }
                }
            }
        });
        
        const chartContainer = document.getElementById('chartContainer');
        if (chartContainer) {
            chartContainer.style.display = 'block';
        }
    }
}

// ========== ИНИЦИАЛИЗАЦИЯ ==========
if (token) {
    const authForm = document.getElementById('authForm');
    const mainContent = document.getElementById('mainContent');
    const userInfo = document.getElementById('userInfo');
    const userName = document.getElementById('userName');
    
    if (authForm) authForm.classList.add('hidden');
    if (mainContent) mainContent.classList.remove('hidden');
    if (userInfo) userInfo.classList.remove('hidden');
    if (userName) userName.innerHTML = `👋 ${localStorage.getItem('username') || 'User'}`;
    
    loadVacancies();
    loadStats();
    loadNotifications();
    loadChart();
}