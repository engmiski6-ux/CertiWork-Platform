/**
 * CertiWork Platform — Admin Dashboard
 */
(function () {
    'use strict';

    const API_BASE = 'api';
    let passFailChart = null;

    const loginView = document.getElementById('login-view');
    const dashboardView = document.getElementById('dashboard-view');
    const loginForm = document.getElementById('login-form');
    const loginError = document.getElementById('login-error');
    const logoutBtn = document.getElementById('logout-btn');
    const adminNameEl = document.getElementById('admin-name');

    const questionModal = document.getElementById('question-modal');
    const questionForm = document.getElementById('question-form');
    const questionFormError = document.getElementById('question-form-error');
    const questionModalTitle = document.getElementById('question-modal-title');

    const reviewModal = document.getElementById('review-modal');
    const reviewModalBody = document.getElementById('review-modal-body');

    // --- Init ---

    document.addEventListener('DOMContentLoaded', checkAuth);

    async function checkAuth() {
        try {
            const res = await apiFetch('admin_login.php');
            if (res.authenticated) {
                showDashboard(res.admin);
            }
        } catch {
            showLogin();
        }
    }

    // --- Auth ---

    loginForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        hideError(loginError);

        const email = document.getElementById('admin-email').value.trim();
        const password = document.getElementById('admin-password').value;

        try {
            const res = await apiFetch('admin_login.php', {
                method: 'POST',
                body: { email, password },
            });
            showDashboard(res.admin);
        } catch (err) {
            showError(loginError, err.message || 'Login failed.');
        }
    });

    logoutBtn.addEventListener('click', async function () {
        try {
            await apiFetch('admin_login.php', { method: 'DELETE' });
        } catch { /* ignore */ }
        showLogin();
    });

    function showLogin() {
        loginView.classList.remove('hidden');
        dashboardView.classList.add('hidden');
        if (passFailChart) {
            passFailChart.destroy();
            passFailChart = null;
        }
    }

    function showDashboard(admin) {
        loginView.classList.add('hidden');
        dashboardView.classList.remove('hidden');
        adminNameEl.textContent = admin.full_name;
        loadDashboard();
    }

    // --- Dashboard Data ---

    async function loadDashboard() {
        await Promise.all([
            loadStats(),
            loadQuestions(),
            loadResults(),
        ]);
    }

    async function loadStats() {
        const res = await apiFetch('admin_stats.php');
        const m = res.metrics;

        document.getElementById('stat-candidates').textContent = m.total_candidates;
        document.getElementById('stat-pass-rate').textContent = `${m.pass_rate}%`;
        document.getElementById('stat-questions').textContent = m.active_questions;

        const specialtyList = document.getElementById('specialty-list');
        if (m.specialty_breakdown.length === 0) {
            specialtyList.innerHTML = '<li><span>No data yet</span></li>';
        } else {
            specialtyList.innerHTML = m.specialty_breakdown.map(function (s) {
                return `<li><span>${escapeHtml(s.specialty)}</span><span>${s.count}</span></li>`;
            }).join('');
        }

        renderChart(m.passed, m.failed);
    }

    function renderChart(passed, failed) {
        const ctx = document.getElementById('pass-fail-chart').getContext('2d');

        if (passFailChart) {
            passFailChart.destroy();
        }

        passFailChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Passed', 'Failed'],
                datasets: [{
                    data: [passed, failed],
                    backgroundColor: ['#ff5a14', '#1a2332'],
                    borderColor: ['#ff5a14', '#243044'],
                    borderWidth: 2,
                }],
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        labels: { color: '#94a3b8', font: { family: 'Segoe UI, sans-serif' } },
                    },
                },
            },
        });
    }

    // --- Questions CRUD ---

    async function loadQuestions() {
        const res = await apiFetch('admin_questions.php');
        const tbody = document.getElementById('questions-tbody');

        if (res.questions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-slate">No questions yet.</td></tr>';
            return;
        }

        tbody.innerHTML = res.questions.map(function (q) {
            const truncated = q.question_text.length > 60
                ? q.question_text.substring(0, 60) + '…'
                : q.question_text;
            return `
                <tr>
                    <td>${q.id}</td>
                    <td>${escapeHtml(truncated)}</td>
                    <td><span class="badge badge-track">${escapeHtml(q.track)}</span></td>
                    <td>${q.correct_option}</td>
                    <td class="table-actions">
                        <button type="button" class="btn btn-secondary btn-sm btn-edit" data-id="${q.id}">Edit</button>
                        <button type="button" class="btn btn-danger btn-sm btn-delete" data-id="${q.id}">Delete</button>
                    </td>
                </tr>`;
        }).join('');

        tbody.querySelectorAll('.btn-edit').forEach(function (btn) {
            btn.addEventListener('click', function () {
                openQuestionModal(parseInt(this.dataset.id, 10), res.questions);
            });
        });

        tbody.querySelectorAll('.btn-delete').forEach(function (btn) {
            btn.addEventListener('click', function () {
                deleteQuestion(parseInt(this.dataset.id, 10));
            });
        });
    }

    document.getElementById('add-question-btn').addEventListener('click', function () {
        openQuestionModal(null);
    });

    document.getElementById('close-question-modal').addEventListener('click', closeQuestionModal);
    document.getElementById('cancel-question-btn').addEventListener('click', closeQuestionModal);

    function openQuestionModal(id, questions) {
        hideError(questionFormError);
        questionForm.reset();
        document.getElementById('q-id').value = '';

        if (id && questions) {
            const q = questions.find(function (item) { return item.id === id; });
            if (q) {
                questionModalTitle.textContent = 'Edit Question';
                document.getElementById('q-id').value = q.id;
                document.getElementById('q-text').value = q.question_text;
                document.getElementById('q-a').value = q.option_a;
                document.getElementById('q-b').value = q.option_b;
                document.getElementById('q-c').value = q.option_c;
                document.getElementById('q-d').value = q.option_d;
                document.getElementById('q-correct').value = q.correct_option;
                document.getElementById('q-track').value = q.track;
            }
        } else {
            questionModalTitle.textContent = 'Add Question';
        }

        questionModal.classList.add('active');
    }

    function closeQuestionModal() {
        questionModal.classList.remove('active');
    }

    questionForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        hideError(questionFormError);

        const payload = {
            question_text: document.getElementById('q-text').value.trim(),
            option_a: document.getElementById('q-a').value.trim(),
            option_b: document.getElementById('q-b').value.trim(),
            option_c: document.getElementById('q-c').value.trim(),
            option_d: document.getElementById('q-d').value.trim(),
            correct_option: document.getElementById('q-correct').value,
            track: document.getElementById('q-track').value,
        };

        const id = document.getElementById('q-id').value;
        const isEdit = id !== '';

        try {
            if (isEdit) {
                payload.id = parseInt(id, 10);
                await apiFetch('admin_questions.php', { method: 'PUT', body: payload });
            } else {
                await apiFetch('admin_questions.php', { method: 'POST', body: payload });
            }
            closeQuestionModal();
            await loadDashboard();
        } catch (err) {
            showError(questionFormError, err.message || 'Failed to save question.');
        }
    });

    async function deleteQuestion(id) {
        if (!confirm('Delete this question? This cannot be undone.')) return;

        try {
            await apiFetch(`admin_questions.php?id=${id}`, { method: 'DELETE' });
            await loadDashboard();
        } catch (err) {
            alert(err.message || 'Failed to delete question.');
        }
    }

    // --- Results & Review ---

    async function loadResults() {
        const res = await apiFetch('admin_results.php');
        const tbody = document.getElementById('results-tbody');

        if (res.results.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-slate">No exam results yet.</td></tr>';
            return;
        }

        tbody.innerHTML = res.results.map(function (r) {
            const statusClass = r.passing_status === 'Passed' ? 'badge-pass' : 'badge-fail';
            const statusText = r.disqualified == 1 ? 'Disqualified' : r.passing_status;
            const date = new Date(r.exam_date).toLocaleDateString();
            return `
                <tr class="clickable" data-result-id="${r.id}">
                    <td>${escapeHtml(r.full_name)}<br><small class="text-slate">${escapeHtml(r.email)}</small></td>
                    <td>${escapeHtml(r.specialty)}</td>
                    <td>${r.total_score}/${r.total_questions} (${r.percentage}%)</td>
                    <td><span class="badge ${statusClass}">${statusText}</span></td>
                    <td>${date}</td>
                </tr>`;
        }).join('');

        tbody.querySelectorAll('tr.clickable').forEach(function (row) {
            row.addEventListener('click', function () {
                openReviewModal(parseInt(this.dataset.resultId, 10));
            });
        });
    }

    document.getElementById('close-review-modal').addEventListener('click', closeReviewModal);

    function closeReviewModal() {
        reviewModal.classList.remove('active');
    }

    async function openReviewModal(resultId) {
        reviewModal.classList.add('active');
        reviewModalBody.innerHTML = '<div class="loading"><div class="spinner"></div>Loading...</div>';

        try {
            const res = await apiFetch(`admin_results.php?result_id=${resultId}`);
            renderReview(res);
        } catch (err) {
            reviewModalBody.innerHTML = `<p class="text-danger">${escapeHtml(err.message)}</p>`;
        }
    }

    function renderReview(data) {
        const r = data.result;
        const answers = data.answers;

        document.getElementById('review-modal-title').textContent =
            `Review: ${r.full_name}`;

        let correct = 0, incorrect = 0, skipped = 0;
        answers.forEach(function (a) {
            if (a.selected_option === null) skipped++;
            else if (a.is_correct == 1) correct++;
            else incorrect++;
        });

        let html = `
            <div class="review-summary">
                <div><div class="label">Score</div><div class="value">${r.percentage}%</div></div>
                <div><div class="label">Correct</div><div class="value">${correct}</div></div>
                <div><div class="label">Incorrect</div><div class="value">${incorrect}</div></div>
                <div><div class="label">Skipped</div><div class="value">${skipped}</div></div>
            </div>`;

        answers.forEach(function (a, i) {
            let rowClass = 'skipped';
            let statusLabel = 'Skipped';

            if (a.selected_option !== null) {
                if (a.is_correct == 1) {
                    rowClass = 'correct';
                    statusLabel = 'Correct';
                } else {
                    rowClass = 'incorrect';
                    statusLabel = 'Incorrect';
                }
            }

            const selectedText = a.selected_option
                ? getOptionText(a, a.selected_option)
                : '—';
            const correctText = getOptionText(a, a.correct_option);

            html += `
                <div class="answer-row ${rowClass}">
                    <div class="q-text">Q${i + 1}. ${escapeHtml(a.question_text)}</div>
                    <div class="detail">
                        Selected: <strong>${escapeHtml(selectedText)}</strong> |
                        Correct: <strong>${escapeHtml(correctText)}</strong> |
                        Status: <strong>${statusLabel}</strong>
                    </div>
                </div>`;
        });

        reviewModalBody.innerHTML = html;
    }

    function getOptionText(q, key) {
        const map = { A: q.option_a, B: q.option_b, C: q.option_c, D: q.option_d };
        return `${key}: ${map[key] || '—'}`;
    }

    // --- API ---

    async function apiFetch(endpoint, options = {}) {
        const config = {
            method: options.method || 'GET',
            credentials: 'same-origin',
            headers: {},
        };

        if (options.body) {
            config.headers['Content-Type'] = 'application/json';
            config.body = JSON.stringify(options.body);
        }

        const res = await fetch(`${API_BASE}/${endpoint}`, config);
        const data = await res.json();

        if (!res.ok || data.success === false) {
            throw new Error(data.error || `Request failed (${res.status})`);
        }

        return data;
    }

    function showError(el, msg) {
        el.textContent = msg;
        el.classList.add('visible');
    }

    function hideError(el) {
        el.textContent = '';
        el.classList.remove('visible');
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
})();
