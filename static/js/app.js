import { AudioRecorder } from './recorder.js';
import { visualize, drawWaveform } from './visualizer.js';
import { Timer } from './timer.js';
import {
    showScreen, getSession, resetSession,
    setDifficulty, setDuration, setTopic, setResumeText,
    startSession, submitAnswer, endSession,
} from './session.js';

// ============================================================
// DOM refs — Setup screen
// ============================================================
const difficultyBtns = document.querySelectorAll('#difficulty-control .seg-btn');
const durationBtns   = document.querySelectorAll('#duration-control .pill-btn');
const topicSelect    = document.getElementById('topic-select');
const startBtn       = document.getElementById('start-interview-btn');
const dropZone       = document.getElementById('drop-zone');
const resumeInput    = document.getElementById('resume-input');
const browseBtn      = document.getElementById('browse-btn');
const dropPrompt     = document.getElementById('drop-prompt');
const dropInfo       = document.getElementById('drop-info');
const resumeFilename = document.getElementById('resume-filename');
const removeResumeBtn= document.getElementById('remove-resume-btn');

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
const perQuestionDiv    = document.getElementById('per-question-breakdown');
const noBreakdownMsg    = document.getElementById('no-breakdown-msg');
const practiceAgainBtn  = document.getElementById('practice-again-btn');
const trySameBtn        = document.getElementById('try-same-btn');

// ============================================================
// Audio recorder + timer
// ============================================================
const canvasCtx = visualizerCanvas.getContext('2d');
const waveCtx   = waveformCanvas.getContext('2d');
const recorder  = new AudioRecorder();
const timer     = new Timer();
let progressInterval = null;

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

// Duration
durationBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        durationBtns.forEach(b => b.classList.remove('pill-btn--active'));
        btn.classList.add('pill-btn--active');
        setDuration(parseInt(btn.dataset.value, 10));
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
        const session = getSession();

        document.getElementById('header-subtitle').textContent =
            `${capitalize(session.difficulty)} · ${session.durationMinutes} min · ${formatTopic(session.topic)}`;

        showQuestionInInterviewScreen(data.question_text, data.question_audio_base64);
        showScreen('screen-interview');
        startInterviewTimer(session.durationMinutes * 60);
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
        questionAudio.play().catch(() => {});
    } else {
        questionAudio.style.display = 'none';
    }

    // Reset recording area for new question
    clearRecordingArea();
    responsePanel.style.display = 'none';
    submitAnswerBtn.style.display = '';
    submitAnswerBtn.disabled = true;
    nextQuestionBtn.style.display = 'none';
    updateStatus('', 'Listen to the question, then record your answer.');
}

function updateQuestionBadge() {
    const s = getSession();
    questionBadge.textContent = `Q ${s.currentQuestion + 1} / ~${s.totalQuestions}`;
}

// Timer
function startInterviewTimer(totalSeconds) {
    timer.onTick(({ remaining, total, percent }) => {
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

// Recording
recorder.onRecordingComplete = (blob) => {
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

async function startRecording() {
    await recorder.start();
    if (!recorder.isRecording) return;

    recordBtn.style.display = 'none';
    stopBtn.style.display = 'inline-block';
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

        // Show transcript + AI response
        transcriptElem.value = data.transcript;
        aiText.value = data.ai_response;

        if (data.audio_base64) {
            const wav = base64ToBlob(data.audio_base64, 'audio/wav');
            aiAudio.src = URL.createObjectURL(wav);
            aiAudio.play().catch(() => {});
        }
        responsePanel.style.display = 'block';

        // Add to conversation history UI
        appendHistory('user', data.transcript);
        appendHistory('assistant', data.ai_response);

        submitAnswerBtn.style.display = 'none';
        nextQuestionBtn.style.display = '';
        updateStatus('success', 'Answer submitted! Review the response, then continue.');
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
nextQuestionBtn.addEventListener('click', async () => {
    const session = getSession();
    if (session.currentQuestion >= session.totalQuestions) {
        await finishInterview();
        return;
    }
    // The LLM is prompted to acknowledge the answer then ask the next question,
    // so ai_text.value is the combined acknowledgement + next question text.
    const nextQ = aiText.value || 'Tell me about a challenge you overcame.';
    showQuestionInInterviewScreen(nextQ, null);
});

// Skip question
skipQuestionBtn.addEventListener('click', async () => {
    const session = getSession();
    session.currentQuestion += 1;
    updateQuestionBadge();
    if (session.currentQuestion >= session.totalQuestions) {
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
    updateStatus('processing', 'Generating your performance report…');
    try {
        const evaluation = await endSession();
        renderResults(evaluation);
        showScreen('screen-results');
    } catch (err) {
        updateStatus('error', `Could not generate report: ${err.message}`);
    }
}

function clearRecordingArea() {
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

// ============================================================
// Results screen logic
// ============================================================

function renderResults(evaluation) {
    const session = getSession();
    const score = evaluation.overall_score ?? 0;
    const percent = (score / 10) * 100;

    scoreCircle.style.setProperty('--score-percent', percent);
    scoreValue.textContent = score.toFixed(1);
    scoreSummary.textContent = evaluation.summary ?? '';
    resultsDifficulty.textContent = capitalize(session.difficulty);

    renderList(strengthsList, evaluation.strengths ?? []);
    renderList(weaknessesList, evaluation.weaknesses ?? []);
    renderOrderedList(suggestionsList, evaluation.suggestions ?? []);

    const pq = evaluation.per_question ?? [];
    if (pq.length > 0) {
        noBreakdownMsg.style.display = 'none';
        perQuestionDiv.innerHTML = '';
        pq.forEach((item, i) => {
            const details = document.createElement('details');
            details.className = 'pq-item';
            details.innerHTML = `
                <summary>
                    <span>Q${i + 1}: ${escapeHtml(item.question ?? '')}</span>
                    <span class="pq-item__score">${item.score ?? '—'} / 10</span>
                </summary>
                <div class="pq-item__body">
                    <p><strong>Your answer:</strong> ${escapeHtml(item.answer_summary ?? '')}</p>
                    <p><strong>Feedback:</strong> ${escapeHtml(item.feedback ?? '')}</p>
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
    historyList.innerHTML = '';
    timerDisplay.textContent = '00:00';
    timerDisplay.className = 'timer-display';
    document.getElementById('header-subtitle').textContent = 'Set up your practice interview';
    showScreen('screen-setup');
});

trySameBtn.addEventListener('click', () => {
    const session = getSession();
    const prevDifficulty = session.difficulty;
    const prevDuration = session.durationMinutes;
    const prevTopic = session.topic;

    resetSession();
    setDifficulty(prevDifficulty);
    setDuration(prevDuration);
    setTopic(prevTopic);

    // Restore UI selections
    difficultyBtns.forEach(b => {
        b.classList.toggle('seg-btn--active', b.dataset.value === prevDifficulty);
    });
    durationBtns.forEach(b => {
        b.classList.toggle('pill-btn--active', parseInt(b.dataset.value, 10) === prevDuration);
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
        general: 'General',
        machine_learning: 'Machine Learning',
        data_engineering: 'Data Engineering',
        backend_development: 'Backend Development',
        system_design: 'System Design',
    };
    return map[topic] ?? topic;
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