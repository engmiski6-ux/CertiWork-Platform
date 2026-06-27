/**
 * CertiWork Platform — Employee Exam Engine
 */
(function () {
    'use strict';

    const API_BASE = 'api';
    const EXAM_DURATION = 2700; // 45 minutes in seconds
    const PASS_THRESHOLD = 75;

    const SPECIALTY_TRACK_MAP = {
        'Web Developer': 'Web Dev',
        'Web Designer': 'Design',
        'UI/UX Designer': 'UI/UX',
    };

    const state = {
        userId: null,
        fullName: '',
        specialty: '',
        track: '',
        questions: [],
        answers: {},
        currentIndex: 0,
        timerSeconds: EXAM_DURATION,
        timerInterval: null,
        violationCount: 0,
        examLocked: false,
        examActive: false,
        disqualified: false,
        submitted: false,
        resultData: null,
    };

    // DOM Elements
    const views = {
        onboarding: document.getElementById('onboarding-view'),
        exam: document.getElementById('exam-view'),
        disqualified: document.getElementById('disqualified-view'),
        results: document.getElementById('results-view'),
    };

    const onboardingForm = document.getElementById('onboarding-form');
    const specialtySelect = document.getElementById('specialty');
    const otherSpecialtyGroup = document.getElementById('other-specialty-group');
    const otherSpecialtyInput = document.getElementById('other-specialty');
    const onboardingError = document.getElementById('onboarding-error');

    const examTimer = document.getElementById('exam-timer');
    const examCounter = document.getElementById('exam-counter');
    const progressFill = document.getElementById('progress-fill');
    const questionNumber = document.getElementById('question-number');
    const questionText = document.getElementById('question-text');
    const optionsList = document.getElementById('options-list');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const submitBtn = document.getElementById('submit-btn');
    const examBody = document.getElementById('exam-body');

    const securityModal = document.getElementById('security-modal');
    const securityAckBtn = document.getElementById('security-ack-btn');

    const downloadCertBtn = document.getElementById('download-cert-btn');
    const retryBtn = document.getElementById('retry-btn');

    // --- View Management ---

    function showView(viewName) {
        Object.values(views).forEach(v => v.classList.remove('active'));
        if (views[viewName]) {
            views[viewName].classList.add('active');
        }
    }

    // --- Specialty Toggle ---

    specialtySelect.addEventListener('change', function () {
        const isOthers = this.value === 'Others';
        otherSpecialtyGroup.classList.toggle('hidden', !isOthers);
        otherSpecialtyInput.required = isOthers;
        if (!isOthers) {
            otherSpecialtyInput.value = '';
        }
    });

    // --- Onboarding ---

    onboardingForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        hideError(onboardingError);

        const fullName = document.getElementById('full-name').value.trim();
        const email = document.getElementById('email').value.trim();
        let specialty = specialtySelect.value;

        if (!fullName || !email || !specialty) {
            showError(onboardingError, 'Please fill in all required fields.');
            return;
        }

        if (specialty === 'Others') {
            const otherRole = otherSpecialtyInput.value.trim();
            if (!otherRole) {
                showError(onboardingError, 'Please specify your role.');
                return;
            }
            specialty = otherRole;
        }

        const btn = document.getElementById('start-exam-btn');
        btn.disabled = true;
        btn.textContent = 'Loading...';

        try {
            const regRes = await apiPost('register.php', {
                full_name: fullName,
                email: email,
                specialty: specialty,
            });

            state.userId = regRes.userId;
            state.fullName = regRes.fullName;
            state.specialty = regRes.specialty;
            state.track = regRes.track;

            const qRes = await apiGet(`questions.php?track=${encodeURIComponent(state.track)}`);

            if (!qRes.questions || qRes.questions.length === 0) {
                showError(onboardingError, 'No questions available for your track. Contact your administrator.');
                return;
            }

            state.questions = qRes.questions;
            state.answers = {};
            state.currentIndex = 0;
            state.timerSeconds = EXAM_DURATION;
            state.violationCount = 0;
            state.examLocked = false;
            state.examActive = true;
            state.disqualified = false;
            state.submitted = false;
            state.resultData = null;

            showView('exam');
            renderQuestion();
            startTimer();
            attachExamSecurity();
        } catch (err) {
            showError(onboardingError, err.message || 'Failed to start exam.');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Begin Certification Exam';
        }
    });

    // --- Timer ---

    function startTimer() {
        clearInterval(state.timerInterval);
        updateTimerDisplay();

        state.timerInterval = setInterval(function () {
            if (state.examLocked) return;

            state.timerSeconds--;
            updateTimerDisplay();

            if (state.timerSeconds <= 300) {
                examTimer.classList.add('warning');
            }

            if (state.timerSeconds <= 0) {
                lockExam('timeout');
                submitExam(true);
            }
        }, 1000);
    }

    function updateTimerDisplay() {
        const mins = Math.floor(state.timerSeconds / 60);
        const secs = state.timerSeconds % 60;
        examTimer.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    function stopTimer() {
        clearInterval(state.timerInterval);
        state.timerInterval = null;
    }

    // --- Question Rendering ---

    function renderQuestion() {
        const q = state.questions[state.currentIndex];
        const total = state.questions.length;
        const idx = state.currentIndex;

        examCounter.textContent = `Question ${idx + 1} of ${total}`;
        questionNumber.textContent = `Question ${idx + 1}`;
        questionText.textContent = q.question_text;

        progressFill.style.width = `${((idx + 1) / total) * 100}%`;

        const options = [
            { key: 'A', text: q.option_a },
            { key: 'B', text: q.option_b },
            { key: 'C', text: q.option_c },
            { key: 'D', text: q.option_d },
        ];

        optionsList.innerHTML = options.map(function (opt) {
            const checked = state.answers[q.id] === opt.key ? 'checked' : '';
            const disabled = state.examLocked ? 'disabled' : '';
            return `
                <li class="option-item">
                    <input type="radio" name="answer" id="opt-${opt.key}" value="${opt.key}" ${checked} ${disabled}>
                    <label class="option-label" for="opt-${opt.key}">
                        <span class="option-key">${opt.key}</span>
                        <span class="option-text">${escapeHtml(opt.text)}</span>
                    </label>
                </li>`;
        }).join('');

        optionsList.querySelectorAll('input[type="radio"]').forEach(function (radio) {
            radio.addEventListener('change', function () {
                if (state.examLocked) return;
                state.answers[q.id] = this.value;
            });
        });

        prevBtn.disabled = idx === 0 || state.examLocked;
        nextBtn.classList.toggle('hidden', idx === total - 1);
        submitBtn.classList.toggle('hidden', idx !== total - 1);
    }

    prevBtn.addEventListener('click', function () {
        if (state.currentIndex > 0 && !state.examLocked) {
            saveCurrentAnswer();
            state.currentIndex--;
            renderQuestion();
        }
    });

    nextBtn.addEventListener('click', function () {
        if (state.currentIndex < state.questions.length - 1 && !state.examLocked) {
            saveCurrentAnswer();
            state.currentIndex++;
            renderQuestion();
        }
    });

    submitBtn.addEventListener('click', function () {
        if (state.examLocked || state.submitted) return;
        saveCurrentAnswer();
        if (confirm('Are you sure you want to submit your exam?')) {
            submitExam(false);
        }
    });

    function saveCurrentAnswer() {
        const q = state.questions[state.currentIndex];
        const selected = optionsList.querySelector('input[type="radio"]:checked');
        if (selected) {
            state.answers[q.id] = selected.value;
        }
    }

    // --- Exam Lock & Submit ---

    function lockExam(reason) {
        if (state.examLocked) return;
        state.examLocked = true;
        state.examActive = false;
        stopTimer();

        views.exam.classList.add('exam-locked');
        examBody.classList.add('exam-locked');

        if (reason === 'cheat') {
            state.disqualified = true;
        }
    }

    async function submitExam(forced) {
        if (state.submitted) return;
        state.submitted = true;
        lockExam(state.disqualified ? 'cheat' : 'submit');
        securityModal.classList.remove('active');

        const answerPayload = state.questions.map(function (q) {
            return {
                question_id: q.id,
                selected_option: state.answers[q.id] || null,
            };
        });

        try {
            const result = await apiPost('submit_exam.php', {
                userId: state.userId,
                answers: answerPayload,
                disqualified: state.disqualified,
            });

            state.resultData = result;

            if (state.disqualified) {
                showDisqualifiedView(result);
            } else {
                showResultsView(result);
            }
        } catch (err) {
            alert('Submission failed: ' + (err.message || 'Unknown error'));
            state.submitted = false;
            state.examLocked = false;
        }
    }

    // --- Anti-Cheat ---

    function attachExamSecurity() {
        document.addEventListener('visibilitychange', handleVisibilityChange);
        views.exam.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    }

    function handleVisibilityChange() {
        if (!state.examActive || state.examLocked || state.submitted) return;

        if (document.hidden) {
            state.violationCount++;

            if (state.violationCount === 1) {
                securityModal.classList.add('active');
            } else if (state.violationCount >= 2) {
                securityModal.classList.remove('active');
                lockExam('cheat');
                submitExam(true);
            }
        }
    }

    securityAckBtn.addEventListener('click', function () {
        securityModal.classList.remove('active');
    });

    // --- Results ---

    function showDisqualifiedView(result) {
        document.getElementById('disqualified-score').textContent =
            `Final Score: ${result.total_score}/${result.total_questions} (${result.percentage}%)`;
        showView('disqualified');
    }

    function showResultsView(result) {
        const passed = result.passing_status === 'Passed' && result.percentage >= PASS_THRESHOLD;

        document.getElementById('results-icon').className = 'results-icon ' + (passed ? 'pass' : 'fail');
        document.getElementById('results-icon').textContent = passed ? '✓' : '✕';
        document.getElementById('results-title').textContent = passed ? 'Congratulations!' : 'Exam Not Passed';
        document.getElementById('results-subtitle').textContent = passed
            ? 'You have successfully completed the certification exam.'
            : 'You did not meet the minimum passing score of 75%. Review your knowledge and try again.';
        document.getElementById('score-display').textContent = `${result.percentage}%`;
        document.getElementById('score-label').textContent =
            `${result.total_score} of ${result.total_questions} questions correct`;

        downloadCertBtn.classList.toggle('hidden', !passed);
        retryBtn.classList.toggle('hidden', passed);

        showView('results');
    }

    downloadCertBtn.addEventListener('click', function () {
        if (!state.resultData || !state.resultData.certificate_uuid) return;
        generateCertificate();
    });

    retryBtn.addEventListener('click', function () {
        resetState();
        showView('onboarding');
        onboardingForm.reset();
        otherSpecialtyGroup.classList.add('hidden');
    });

    function resetState() {
        stopTimer();
        state.userId = null;
        state.questions = [];
        state.answers = {};
        state.currentIndex = 0;
        state.timerSeconds = EXAM_DURATION;
        state.violationCount = 0;
        state.examLocked = false;
        state.examActive = false;
        state.disqualified = false;
        state.submitted = false;
        state.resultData = null;
        views.exam.classList.remove('exam-locked');
        examBody.classList.remove('exam-locked');
        examTimer.classList.remove('warning');
        examTimer.textContent = '45:00';
        progressFill.style.width = '0%';
    }

    // --- Certificate PDF ---

    function generateCertificate() {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

        const pageW = 297;
        const pageH = 210;
        const navy = [11, 19, 43];
        const orange = [255, 90, 20];
        const white = [255, 255, 255];
        const slate = [148, 163, 184];

        doc.setFillColor(...navy);
        doc.rect(0, 0, pageW, pageH, 'F');

        doc.setDrawColor(...orange);
        doc.setLineWidth(2);
        doc.rect(10, 10, pageW - 20, pageH - 20, 'S');

        doc.setDrawColor(...white);
        doc.setLineWidth(0.5);
        doc.rect(14, 14, pageW - 28, pageH - 28, 'S');

        doc.setTextColor(...white);
        doc.setFontSize(14);
        doc.text('CERTIWORK PLATFORM', pageW / 2, 35, { align: 'center' });

        doc.setFontSize(32);
        doc.setFont(undefined, 'bold');
        doc.text('Certificate of Achievement', pageW / 2, 55, { align: 'center' });

        doc.setFontSize(12);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(...slate);
        doc.text('This certifies that', pageW / 2, 75, { align: 'center' });

        doc.setTextColor(...orange);
        doc.setFontSize(28);
        doc.setFont(undefined, 'bold');
        doc.text(state.fullName, pageW / 2, 92, { align: 'center' });

        doc.setTextColor(...white);
        doc.setFontSize(14);
        doc.setFont(undefined, 'normal');
        doc.text(`Specialty: ${state.specialty}`, pageW / 2, 108, { align: 'center' });

        const score = state.resultData.percentage;
        doc.text(`Exam Score: ${score}%`, pageW / 2, 120, { align: 'center' });

        const examDate = new Date().toLocaleDateString('en-US', {
            year: 'numeric', month: 'long', day: 'numeric',
        });
        doc.setTextColor(...slate);
        doc.setFontSize(11);
        doc.text(`Date of Completion: ${examDate}`, pageW / 2, 135, { align: 'center' });

        doc.setDrawColor(...orange);
        doc.setLineWidth(0.5);
        doc.line(80, 145, pageW - 80, 145);

        doc.setFontSize(10);
        doc.text(`Verification ID: ${state.resultData.certificate_uuid}`, pageW / 2, 155, { align: 'center' });
        doc.text('CertiWork Platform — Corporate Certification System', pageW / 2, 165, { align: 'center' });

        doc.save(`CertiWork_Certificate_${state.fullName.replace(/\s+/g, '_')}.pdf`);
    }

    // --- API Helpers ---

    async function apiGet(endpoint) {
        const res = await fetch(`${API_BASE}/${endpoint}`, { credentials: 'same-origin' });
        return handleResponse(res);
    }

    async function apiPost(endpoint, body) {
        const res = await fetch(`${API_BASE}/${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify(body),
        });
        return handleResponse(res);
    }

    async function handleResponse(res) {
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
