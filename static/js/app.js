import { AudioRecorder } from './recorder.js';
import { visualize, drawWaveform, idleVisualize } from './visualizer.js';
import { Timer } from './timer.js';
import {
    showScreen, getSession, resetSession,
    setDifficulty, setDuration, setTopic, setResumeText, setJobDescription,
    setPersona, setSessionMode, setQuestionCount,
    startSession, submitAnswer, endSession,
    saveSessionToHistory,
} from './session.js';
import { renderHistoryScreen } from './history.js';

// ============================================================
// DOM refs — Setup screen
// ============================================================
const difficultyBtns    = document.querySelectorAll('#difficulty-control .seg-btn');
const modeBtns          = document.querySelectorAll('#mode-toggle .mode-btn');
const durationGroup     = document.getElementById('duration-group');
const questionsGroup    = document.getElementById('questions-group');
const durationBtns      = document.querySelectorAll('#duration-control .pill-btn');
const durationHint      = document.getElementById('duration-hint');
const qcountBtns        = document.querySelectorAll('#question-count-control .pill-btn');
const customQCountInput = document.getElementById('custom-question-count');
const questionsHint     = document.getElementById('questions-hint');
const personaBtns       = document.querySelectorAll('#persona-control .pill-btn');
const topicSelect       = document.getElementById('topic-select');
const startBtn          = document.getElementById('start-interview-btn');
const dropZone       = document.getElementById('drop-zone');
const resumeInput    = document.getElementById('resume-input');
const browseBtn      = document.getElementById('browse-btn');
const dropPrompt     = document.getElementById('drop-prompt');
const dropInfo       = document.getElementById('drop-info');
const resumeFilename = document.getElementById('resume-filename');
const removeResumeBtn    = document.getElementById('remove-resume-btn');
const jdInput            = document.getElementById('jd-input');
const jdCharCount        = document.getElementById('jd-char-count');
const autorecordBanner   = document.getElementById('autorecord-countdown');
const countdownSecsEl    = document.getElementById('countdown-secs');
const cancelAutorecordBtn= document.getElementById('cancel-autorecord-btn');

// ============================================================
// DOM refs — Interview screen
// ============================================================
const questionBadge   = document.getElementById('question-badge');
const timerDisplay    = document.getElementById('timer-display');
const endInterviewBtn = document.getElementById('end-interview-btn');
const questionText    = document.getElementById('question-text');
const questionAudio   = document.getElementById('question-audio');
const recordBtn       = document.getElementById('record-btn');
const stopBtn         = document.getElementById('stop-btn');
const recordingStatus = document.getElementById('recording-status');
const previewAudio    = document.getElementById('preview-audio');
const responsePanel   = document.getElementById('response-panel');
const aiAudio         = document.getElementById('ai-audio');
const aiText          = document.getElementById('ai-text');
const transcriptElem  = document.getElementById('transcript');
const visualizerContainer = document.getElementById('visualizer-container');
const visualizerCanvas    = document.getElementById('visualizer');
const waveformContainer   = document.getElementById('waveform');
const waveformCanvas      = document.getElementById('waveform-canvas');
const recordingPanel      = document.getElementById('recording-panel');
const progressBar         = document.getElementById('recording-progress');
const progressFill        = document.getElementById('progress-fill');
const submitAnswerBtn     = document.getElementById('submit-answer-btn');
const nextQuestionBtn     = document.getElementById('next-question-btn');
const skipQuestionBtn     = document.getElementById('skip-question-btn');
const statusElem          = document.getElementById('status');
const historyList         = document.getElementById('history-list');

// ============================================================
// DOM refs — Results screen
// ============================================================
const scoreCircle       = document.getElementById('score-circle');
const scoreValue        = document.getElementById('score-value');
const scoreSummary      = document.getElementById('score-summary');
const resultsDifficulty = document.getElementById('results-difficulty-badge');
const strengthsList     = document.getElementById('strengths-list');
const weaknessesList    = document.getElementById('weaknesses-list');
const suggestionsList   = document.getElementById('suggestions-list');
const perQuestionDiv      = document.getElementById('per-question-breakdown');
const noBreakdownMsg      = document.getElementById('no-breakdown-msg');
const speakingMetricsCard = document.getElementById('speaking-metrics-card');
const speakingMetricsGrid = document.getElementById('speaking-metrics-grid');
const practiceAgainBtn    = document.getElementById('practice-again-btn');
const trySameBtn          = document.getElementById('try-same-btn');

// ============================================================
// DOM refs — Header + misc
// ============================================================
const themeToggle    = document.getElementById('theme-toggle');
const historyNavBtn  = document.getElementById('history-nav-btn');
const audioContainer = document.querySelector('.audio-container');

// ============================================================
// DOM refs — History screen
// ============================================================
const sparklineCanvas  = document.getElementById('sparkline-canvas');
const topicFilterEl    = document.getElementById('topic-filter');
const statsStripEl     = document.getElementById('stats-strip');
const historyCardsEl   = document.getElementById('history-cards');
const historyEmptyMsg  = document.getElementById('history-empty-msg');
const historyBackBtn   = document.getElementById('history-back-btn');
const viewHistoryBtn   = document.getElementById('view-history-btn');

// ============================================================
// Audio recorder + timer
// ============================================================
const canvasCtx = visualizerCanvas.getContext('2d');
const waveCtx   = waveformCanvas.getContext('2d');
const recorder  = new AudioRecorder();
const timer     = new Timer();
let progressInterval = null;

// ============================================================
// T5 — Theme toggle
// ============================================================

(function initTheme() {
    if (localStorage.getItem('theme') === 'dark') {
        document.body.setAttribute('data-theme', 'dark');
        themeToggle.textContent = '☀️';
    }
})();

themeToggle.addEventListener('click', () => {
    const isDark = document.body.getAttribute('data-theme') === 'dark';
    if (isDark) {
        document.body.removeAttribute('data-theme');
        themeToggle.textContent = '🌙';
        localStorage.setItem('theme', 'light');
    } else {
        document.body.setAttribute('data-theme', 'dark');
        themeToggle.textContent = '☀️';
        localStorage.setItem('theme', 'dark');
    }
});

// ============================================================
// T2 — History navigation
// ============================================================

let _historyPreviousScreen = 'screen-setup';

function openHistory() {
    _historyPreviousScreen = document.querySelector('.screen--active')?.id ?? 'screen-setup';
    renderHistoryScreen({
        sparklineCanvas,
        topicFilterEl,
        statsStripEl,
        cardsEl:      historyCardsEl,
        emptyMsgEl:   historyEmptyMsg,
    });
    showScreen('screen-history');
}

historyNavBtn.addEventListener('click', openHistory);
historyBackBtn.addEventListener('click', () => showScreen(_historyPreviousScreen));
viewHistoryBtn.addEventListener('click', openHistory);

// Re-render when topic filter changes
topicFilterEl.addEventListener('change', () => {
    renderHistoryScreen({
        sparklineCanvas,
        topicFilterEl,
        statsStripEl,
        cardsEl:    historyCardsEl,
        emptyMsgEl: historyEmptyMsg,
    });
});

// Idle visualizer state flag
let _isIdle = false;

// Collect transcripts for client-side speaking metrics
let _sessionTranscripts = [];

const FILLER_WORDS = ['um', 'uh', 'like', 'you know', 'basically', 'literally',
    'actually', 'so', 'right', 'okay', 'well', 'hmm', 'er', 'ah'];

function countFillerWords(text) {
    const lower = text.toLowerCase();
    return FILLER_WORDS.reduce((count, word) => {
        const re = new RegExp(`\\b${word}\\b`, 'g');
        return count + (lower.match(re) ?? []).length;
    }, 0);
}

function computeSpeakingMetrics(transcripts) {
    if (!transcripts.length) return null;
    const wordCounts = transcripts.map(t => t.split(/\s+/).filter(Boolean).length);
    const fillerCounts = transcripts.map(countFillerWords);
    return {
        filler_word_count: fillerCounts.reduce((a, b) => a + b, 0),
        avg_response_words: Math.round(wordCounts.reduce((a, b) => a + b, 0) / wordCounts.length),
        longest_answer: wordCounts.indexOf(Math.max(...wordCounts)) + 1,
        shortest_answer: wordCounts.indexOf(Math.min(...wordCounts)) + 1,
    };
}

// ============================================================
// Setup screen logic
// ============================================================

// Difficulty
difficultyBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        difficultyBtns.forEach(b => b.classList.remove('seg-btn--active'));
        btn.classList.add('seg-btn--active');
        setDifficulty(btn.dataset.value);
    });
});

// Session Mode toggle
modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        modeBtns.forEach(b => b.classList.remove('mode-btn--active'));
        btn.classList.add('mode-btn--active');
        const mode = btn.dataset.mode;
        setSessionMode(mode);
        if (mode === 'time') {
            durationGroup.style.display = '';
            questionsGroup.style.display = 'none';
        } else {
            durationGroup.style.display = 'none';
            questionsGroup.style.display = '';
            updateQuestionsHint();
        }
    });
});

// Duration
durationBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        durationBtns.forEach(b => b.classList.remove('pill-btn--active'));
        btn.classList.add('pill-btn--active');
        setDuration(parseInt(btn.dataset.value, 10));
    });
});

// Question count
qcountBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        qcountBtns.forEach(b => b.classList.remove('pill-btn--active'));
        btn.classList.add('pill-btn--active');
        if (btn.dataset.value === 'custom') {
            customQCountInput.style.display = '';
            customQCountInput.focus();
        } else {
            customQCountInput.style.display = 'none';
            setQuestionCount(parseInt(btn.dataset.value, 10));
            updateQuestionsHint();
        }
    });
});
customQCountInput.addEventListener('input', () => {
    const val = parseInt(customQCountInput.value, 10);
    if (val > 0) { setQuestionCount(val); updateQuestionsHint(); }
});

function updateQuestionsHint() {
    const s = getSession();
    const minsPerQ = { beginner: 3, intermediate: 4, advanced: 6 };
    const avg = minsPerQ[s.difficulty] ?? 4;
    const lo = s.questionCount * (avg - 1);
    const hi = s.questionCount * (avg + 1);
    questionsHint.textContent = `~${lo}–${hi} min estimated at ${s.difficulty} level`;
}

// Persona
personaBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        personaBtns.forEach(b => b.classList.remove('pill-btn--active'));
        btn.classList.add('pill-btn--active');
        setPersona(btn.dataset.value);
    });
});

// Topic
topicSelect.addEventListener('change', () => setTopic(topicSelect.value));

// Resume upload
browseBtn.addEventListener('click', () => resumeInput.click());
resumeInput.addEventListener('change', () => {
    if (resumeInput.files[0]) handleResumeFile(resumeInput.files[0]);
});

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) handleResumeFile(file);
});

removeResumeBtn.addEventListener('click', () => {
    setResumeText(null);
    resumeInput.value = '';
    dropPrompt.style.display = '';
    dropInfo.style.display = 'none';
});

jdInput.addEventListener('input', () => {
    const text = jdInput.value.trim();
    setJobDescription(text || null);
    jdCharCount.textContent = `${jdInput.value.length} / 4000 characters`;
});

async function handleResumeFile(file) {
    if (file.size > 2 * 1024 * 1024) {
        alert('File too large. Please upload a file under 2 MB.');
        return;
    }

    resumeFilename.textContent = `${file.name} (parsing…)`;
    dropPrompt.style.display = 'none';
    dropInfo.style.display = '';

    try {
        let text;
        if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
            text = await extractPdfText(file);
        } else {
            text = await file.text();
        }
        setResumeText(text);
        resumeFilename.textContent = `${file.name} (${Math.round(text.length / 1000)}k chars)`;
    } catch (err) {
        console.error('Resume parse error:', err);
        resumeFilename.textContent = `${file.name} (parse failed — questions will be generic)`;
        setResumeText(null);
    }
}

async function extractPdfText(file) {
    if (typeof pdfjsLib === 'undefined') {
        throw new Error('pdf.js not loaded');
    }
    pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        pages.push(content.items.map(item => item.str).join(' '));
    }
    return pages.join('\n');
}

// Start Interview
startBtn.addEventListener('click', async () => {
    startBtn.disabled = true;
    startBtn.innerHTML = '<span class="emoji">⏳</span> Starting…';
    try {
        const data = await startSession();
        const s = getSession();

        const modeLabel = s.sessionMode === 'questions'
            ? `${s.questionCount} questions`
            : `${s.durationMinutes} min`;
        document.getElementById('header-subtitle').textContent =
            `${capitalize(s.difficulty)} · ${modeLabel} · ${formatTopic(s.topic)}`;

        showQuestionInInterviewScreen(data.question_text, data.question_audio_base64);
        showScreen('screen-interview');

        if (s.sessionMode === 'questions') {
            startElapsedTimer();
        } else {
            startCountdownTimer(s.durationMinutes * 60);
        }
    } catch (err) {
        console.error('Start session error:', err);
        alert(`Failed to start interview: ${err.message}\n\nCheck that your API keys are configured and the server is running.`);
    } finally {
        startBtn.disabled = false;
        startBtn.innerHTML = '<span class="emoji">🚀</span> Start Interview';
    }
});

// ============================================================
// Interview screen logic
// ============================================================

function showQuestionInInterviewScreen(text, audioBase64) {
    const session = getSession();
    questionText.textContent = text;
    updateQuestionBadge();

    if (audioBase64) {
        const wav = base64ToBlob(audioBase64, 'audio/wav');
        questionAudio.src = URL.createObjectURL(wav);
        questionAudio.style.display = 'block';
        questionAudio.onended = () => scheduleAutoRecord(3);
        questionAudio.play().catch(() => {});
    } else {
        questionAudio.style.display = 'none';
        // Fallback: browser speech synthesis when ElevenLabs audio is unavailable
        if (text && 'speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = 0.9;
            utterance.onend = () => scheduleAutoRecord(3);
            window.speechSynthesis.speak(utterance);
        }
    }

    // Reset recording area for new question
    clearRecordingArea();
    responsePanel.style.display = 'none';
    submitAnswerBtn.style.display = '';
    submitAnswerBtn.disabled = true;
    nextQuestionBtn.style.display = 'none';
    updateStatus('', 'Listen to the question, then record your answer.');

    // Start idle visualization in visualizer canvas
    _isIdle = true;
    visualizerCanvas.width = visualizerCanvas.offsetWidth || 400;
    visualizerCanvas.height = visualizerCanvas.offsetHeight || 120;
    visualizerContainer.classList.add('active');
    idleVisualize(visualizerCanvas, canvasCtx, () => _isIdle && !recorder.isRecording);
    audioContainer.classList.add('idle-pulse');
}

function updateQuestionBadge() {
    const s = getSession();
    if (s.sessionMode === 'questions') {
        questionBadge.textContent = `Q ${s.currentQuestion + 1} / ${s.questionCount}`;
    } else {
        questionBadge.textContent = `Q ${s.currentQuestion + 1}`;
    }
}

// Timer — countdown (by-time mode)
function startCountdownTimer(totalSeconds) {
    timer.onTick(({ remaining, percent }) => {
        const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
        const ss = String(remaining % 60).padStart(2, '0');
        timerDisplay.textContent = `${mm}:${ss}`;
        timerDisplay.classList.remove('timer-display--warning', 'timer-display--danger');
        if (percent < 20) timerDisplay.classList.add('timer-display--danger');
        else if (percent < 50) timerDisplay.classList.add('timer-display--warning');
    });
    timer.onExpire(async () => {
        updateStatus('processing', 'Time\'s up! Generating your feedback…');
        await finishInterview();
    });
    timer.start(totalSeconds);
}

// Timer — elapsed (by-questions mode)
let _elapsedSeconds = 0;
let _elapsedInterval = null;
function startElapsedTimer() {
    _elapsedSeconds = 0;
    timerDisplay.textContent = '00:00';
    timerDisplay.classList.remove('timer-display--warning', 'timer-display--danger');
    _elapsedInterval = setInterval(() => {
        _elapsedSeconds++;
        const mm = String(Math.floor(_elapsedSeconds / 60)).padStart(2, '0');
        const ss = String(_elapsedSeconds % 60).padStart(2, '0');
        timerDisplay.textContent = `${mm}:${ss}`;
    }, 1000);
}
function stopElapsedTimer() {
    if (_elapsedInterval) { clearInterval(_elapsedInterval); _elapsedInterval = null; }
}

// Recording
recorder.onRecordingComplete = (blob) => {
    stopBtn.classList.remove('btn-recording-pulse');
    const audioUrl = URL.createObjectURL(blob);
    previewAudio.src = audioUrl;
    previewAudio.style.display = 'block';
    submitAnswerBtn.disabled = false;

    drawWaveform(audioUrl, waveformCanvas, waveCtx, waveformContainer);
    updateStatus('success', 'Recording complete. Submit your answer when ready.');

    visualizerContainer.classList.remove('active');
    recordingPanel.classList.remove('active');
    progressBar.classList.remove('active');
};

recorder.onError = (msg) => updateStatus('error', msg);

// ============================================================
// Auto-record countdown (triggered after TTS question audio ends)
// ============================================================
let _autoRecordTimer = null;

function scheduleAutoRecord(seconds = 3) {
    let remaining = seconds;
    autorecordBanner.style.display = 'flex';
    countdownSecsEl.textContent = remaining;
    _autoRecordTimer = setInterval(async () => {
        remaining--;
        countdownSecsEl.textContent = remaining;
        if (remaining <= 0) {
            cancelAutoRecord();
            await startRecording();
        }
    }, 1000);
}

function cancelAutoRecord() {
    clearInterval(_autoRecordTimer);
    _autoRecordTimer = null;
    autorecordBanner.style.display = 'none';
}

cancelAutorecordBtn.addEventListener('click', async () => {
    cancelAutoRecord();
    await startRecording();
});

async function startRecording() {
    cancelAutoRecord(); // dismiss any pending countdown if manually triggered
    await recorder.start();
    if (!recorder.isRecording) return;

    _isIdle = false;
    audioContainer.classList.remove('idle-pulse');
    recordBtn.style.display = 'none';
    stopBtn.style.display = 'inline-block';
    stopBtn.classList.add('btn-recording-pulse');
    recordingStatus.textContent = 'Recording… (Max 30 seconds)';
    recordingPanel.classList.add('active');
    progressBar.classList.add('active');
    updateStatus('processing', 'Recording in progress…');

    visualizerCanvas.width = visualizerCanvas.offsetWidth;
    visualizerCanvas.height = visualizerCanvas.offsetHeight;
    visualizerContainer.classList.add('active');

    visualize(visualizerCanvas, canvasCtx, recorder.analyser, recorder.dataArray, () => recorder.isRecording);

    let progress = 0;
    progressInterval = setInterval(() => {
        progress += 100 / 300;
        progressFill.style.width = Math.min(progress, 100) + '%';
        if (progress >= 100 || !recorder.isRecording) clearInterval(progressInterval);
    }, 100);
}

function stopRecording() {
    recorder.stop();
    recordBtn.style.display = 'inline-block';
    stopBtn.style.display = 'none';
    stopBtn.classList.remove('btn-recording-pulse');
    recordingStatus.textContent = '';
    if (progressInterval) clearInterval(progressInterval);
}

// Submit answer
submitAnswerBtn.addEventListener('click', async () => {
    const blob = recorder.getBlob();
    if (!blob) { updateStatus('error', 'No recording. Please record your answer first.'); return; }

    timer.pause();
    submitAnswerBtn.disabled = true;
    skipQuestionBtn.disabled = true;
    updateStatus('processing', 'Processing your answer… This may take 15–30 seconds.');

    try {
        const data = await submitAnswer(blob);

        // Collect transcript for speaking metrics
        if (data.transcript) _sessionTranscripts.push(data.transcript);

        // Show transcript + AI response
        transcriptElem.value = data.transcript;
        aiText.value = data.ai_response;

        if (data.audio_base64) {
            const wav = base64ToBlob(data.audio_base64, 'audio/wav');
            aiAudio.src = URL.createObjectURL(wav);
            aiAudio.onended = () => {
                if (!data.session_complete) nextQuestionBtn.classList.add('next-question-pulse');
            };
            aiAudio.play().catch(() => {});
        }
        responsePanel.style.display = 'block';

        // Add to conversation history UI
        appendHistory('user', data.transcript);
        appendHistory('assistant', data.ai_response);

        submitAnswerBtn.style.display = 'none';
        if (data.session_complete) {
            nextQuestionBtn.style.display = 'none';
            updateStatus('success', 'All questions complete! Generating your report…');
            await finishInterview();
        } else {
            nextQuestionBtn.style.display = '';
            updateStatus('success', 'Answer submitted! Review the response, then continue.');
        }
    } catch (err) {
        if (err.message.includes('Session not found') || err.message.includes('already ended')) {
            updateStatus('error', 'Session expired. Please start a new interview.');
            timer.stop();
        } else {
            updateStatus('error', `Submission failed: ${err.message}`);
            submitAnswerBtn.disabled = false;
        }
    } finally {
        skipQuestionBtn.disabled = false;
        timer.resume();
    }
});

// Next question — the AI's last response already contains the next question
nextQuestionBtn.addEventListener('click', () => {
    nextQuestionBtn.classList.remove('next-question-pulse');
    const nextQ = aiText.value || 'Tell me about a challenge you overcame.';
    showQuestionInInterviewScreen(nextQ, null);
});

// Skip question
skipQuestionBtn.addEventListener('click', async () => {
    const s = getSession();
    s.currentQuestion += 1;
    updateQuestionBadge();
    if (s.sessionMode === 'questions' && s.currentQuestion >= s.questionCount) {
        await finishInterview();
        return;
    }
    showQuestionInInterviewScreen('Tell me about a time you had to learn something quickly.', null);
});

// End interview manually
endInterviewBtn.addEventListener('click', async () => {
    if (confirm('End the interview now and see your results?')) {
        timer.stop();
        await finishInterview();
    }
});

async function finishInterview() {
    timer.stop();
    stopElapsedTimer();
    updateStatus('processing', 'Generating your performance report…');
    try {
        const evaluation = await endSession();
        const metrics = computeSpeakingMetrics(_sessionTranscripts);
        saveSessionToHistory(evaluation, metrics);
        renderResults(evaluation);
        showScreen('screen-results');
    } catch (err) {
        updateStatus('error', `Could not generate report: ${err.message}`);
    }
}

function clearRecordingArea() {
    _isIdle = false;
    recorder.clear();
    previewAudio.style.display = 'none';
    previewAudio.src = '';
    aiAudio.src = '';
    aiText.value = '';
    transcriptElem.value = '';
    visualizerContainer.classList.remove('active');
    waveformContainer.classList.remove('active');
    recordingPanel.classList.remove('active');
    progressBar.classList.remove('active');
    progressFill.style.width = '0%';
    recordBtn.style.display = 'inline-block';
    stopBtn.style.display = 'none';
    stopBtn.classList.remove('btn-recording-pulse');
    audioContainer.classList.remove('idle-pulse');
    recordingStatus.textContent = '';
}

function appendHistory(role, content) {
    const item = document.createElement('div');
    item.className = 'history-item';
    item.innerHTML = `
        <div class="history-item__role history-item__role--${role}">${role === 'user' ? 'You' : 'Interviewer'}</div>
        <div class="history-item__content">${escapeHtml(content)}</div>
    `;
    historyList.appendChild(item);
}

recordBtn.addEventListener('click', startRecording);
stopBtn.addEventListener('click', stopRecording);

// Space bar shortcut: start/stop recording while on the interview screen
document.addEventListener('keydown', (e) => {
    if (e.code !== 'Space') return;
    if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(document.activeElement.tagName)) return;
    if (!document.getElementById('screen-interview').classList.contains('screen--active')) return;
    e.preventDefault();
    if (recorder.isRecording) stopRecording(); else startRecording();
});

// ============================================================
// Results screen logic
// ============================================================

function animateScore(targetPercent) {
    const duration = 1000;
    const start = performance.now();
    scoreCircle.style.setProperty('--score-percent', 0);
    function step(now) {
        const t = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - t, 3);
        scoreCircle.style.setProperty('--score-percent', targetPercent * eased);
        if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}

function renderResults(evaluation) {
    const s = getSession();
    const score = evaluation.overall_score ?? 0;
    const percent = (score / 10) * 100;

    animateScore(percent);
    scoreValue.textContent = score.toFixed(1);
    scoreSummary.textContent = evaluation.summary ?? '';
    resultsDifficulty.textContent = capitalize(s.difficulty);

    renderList(strengthsList, evaluation.strengths ?? []);
    renderList(weaknessesList, evaluation.weaknesses ?? []);
    renderOrderedList(suggestionsList, evaluation.suggestions ?? []);

    // Speaking metrics (computed client-side from collected transcripts)
    const metrics = computeSpeakingMetrics(_sessionTranscripts);
    if (metrics && _sessionTranscripts.length > 0) {
        speakingMetricsCard.style.display = '';
        speakingMetricsGrid.innerHTML = `
            <div class="sm-stat"><span class="sm-stat__value">${metrics.filler_word_count}</span><span class="sm-stat__label">Filler Words</span></div>
            <div class="sm-stat"><span class="sm-stat__value">${metrics.avg_response_words}</span><span class="sm-stat__label">Avg Words/Answer</span></div>
            <div class="sm-stat"><span class="sm-stat__value">Q${metrics.longest_answer}</span><span class="sm-stat__label">Longest Answer</span></div>
            <div class="sm-stat"><span class="sm-stat__value">Q${metrics.shortest_answer}</span><span class="sm-stat__label">Shortest Answer</span></div>
        `;
    } else {
        speakingMetricsCard.style.display = 'none';
    }

    // Per-question breakdown with dimensions, hints, resume alignment
    const pq = evaluation.per_question ?? [];
    if (pq.length > 0) {
        noBreakdownMsg.style.display = 'none';
        perQuestionDiv.innerHTML = '';
        pq.forEach((item, i) => {
            const details = document.createElement('details');
            details.className = 'pq-item';
            details.style.animationDelay = `${i * 80}ms`;

            const dims = item.dimensions ?? {};
            const dimNames = { technical_accuracy: 'Technical', communication: 'Communication',
                               completeness: 'Completeness', confidence: 'Confidence' };
            const dimHtml = Object.entries(dimNames).map(([key, label]) => {
                const val = dims[key] ?? 0;
                const pct = (val / 5) * 100;
                return `<div class="dim-row">
                    <span class="dim-label">${label}</span>
                    <div class="dim-bar"><div class="dim-bar__fill" style="width:${pct}%"></div></div>
                    <span class="dim-val">${val}/5</span>
                </div>`;
            }).join('');

            const hints = item.ideal_answer_hints ?? [];
            const hintsHtml = hints.length
                ? `<div class="pq-hints"><strong>Ideal answer includes:</strong><ul>${hints.map(h => `<li>${escapeHtml(h)}</li>`).join('')}</ul></div>`
                : '';

            const alignment = item.resume_alignment;
            const alignBadge = (alignment && alignment !== 'N/A')
                ? `<span class="align-badge align-badge--${alignment.toLowerCase()}">${alignment}</span>`
                : '';

            details.innerHTML = `
                <summary>
                    <span>Q${i + 1}: ${escapeHtml(item.question ?? '')}</span>
                    <span class="pq-item__score">${item.score ?? '—'} / 10</span>
                </summary>
                <div class="pq-item__body">
                    <p><strong>Your answer:</strong> ${escapeHtml(item.answer_summary ?? '')} ${alignBadge}</p>
                    <p><strong>Feedback:</strong> ${escapeHtml(item.feedback ?? '')}</p>
                    <div class="dim-grid">${dimHtml}</div>
                    ${hintsHtml}
                </div>
            `;
            perQuestionDiv.appendChild(details);
        });
    } else {
        noBreakdownMsg.style.display = '';
        perQuestionDiv.innerHTML = '';
    }
}

function renderList(ul, items) {
    ul.innerHTML = items.map(i => `<li>${escapeHtml(i)}</li>`).join('');
}

function renderOrderedList(ol, items) {
    ol.innerHTML = items.map(i => `<li>${escapeHtml(i)}</li>`).join('');
}

practiceAgainBtn.addEventListener('click', () => {
    resetSession();
    _sessionTranscripts = [];
    historyList.innerHTML = '';
    timerDisplay.textContent = '00:00';
    timerDisplay.className = 'timer-display';
    document.getElementById('header-subtitle').textContent = 'Set up your practice interview';
    showScreen('screen-setup');
});

trySameBtn.addEventListener('click', () => {
    const s = getSession();
    const prevDifficulty = s.difficulty;
    const prevDuration = s.durationMinutes;
    const prevTopic = s.topic;
    const prevPersona = s.persona;
    const prevMode = s.sessionMode;
    const prevQCount = s.questionCount;

    resetSession();
    _sessionTranscripts = [];
    setDifficulty(prevDifficulty);
    setDuration(prevDuration);
    setTopic(prevTopic);
    setPersona(prevPersona);
    setSessionMode(prevMode);
    setQuestionCount(prevQCount);

    // Restore UI selections
    difficultyBtns.forEach(b => {
        b.classList.toggle('seg-btn--active', b.dataset.value === prevDifficulty);
    });
    durationBtns.forEach(b => {
        b.classList.toggle('pill-btn--active', parseInt(b.dataset.value, 10) === prevDuration);
    });
    personaBtns.forEach(b => {
        b.classList.toggle('pill-btn--active', b.dataset.value === prevPersona);
    });
    modeBtns.forEach(b => {
        b.classList.toggle('mode-btn--active', b.dataset.mode === prevMode);
    });
    topicSelect.value = prevTopic;

    historyList.innerHTML = '';
    timerDisplay.textContent = '00:00';
    timerDisplay.className = 'timer-display';
    document.getElementById('header-subtitle').textContent = 'Set up your practice interview';
    showScreen('screen-setup');
});

// ============================================================
// Utilities
// ============================================================

function updateStatus(type, message) {
    statusElem.className = 'status';
    if (type) statusElem.classList.add(type);
    statusElem.textContent = message;
}

function base64ToBlob(b64, mime) {
    const bytes = atob(b64);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    return new Blob([arr], { type: mime });
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function capitalize(str) {
    return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

function formatTopic(topic) {
    const map = {
        backend_engineering: 'Backend Eng.',
        frontend_engineering: 'Frontend Eng.',
        full_stack: 'Full Stack',
        mobile: 'Mobile',
        machine_learning: 'ML / AI',
        data_engineering: 'Data Eng.',
        system_design: 'System Design',
        product_management: 'Product Mgmt',
        devops_cloud: 'DevOps / Cloud',
        digital_marketing: 'Digital Marketing',
        seo_content: 'SEO / Content',
        performance_marketing: 'Perf. Marketing',
        behavioral: 'Behavioral',
        general: 'General',
        backend_development: 'Backend Dev.',
    };
    return map[topic] ?? topic.replace(/_/g, ' ');
}

window.addEventListener('resize', () => {
    if (visualizerCanvas.offsetWidth > 0) {
        visualizerCanvas.width = visualizerCanvas.offsetWidth;
        visualizerCanvas.height = visualizerCanvas.offsetHeight;
    }
    if (waveformCanvas.offsetWidth > 0) {
        waveformCanvas.width = waveformCanvas.offsetWidth;
        waveformCanvas.height = waveformCanvas.offsetHeight;
    }
});