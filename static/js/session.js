/**
 * session.js — Interview session state management and screen transitions.
 */

const DEFAULTS = {
    sessionId: null,
    resumeText: null,
    jobDescription: null,
    difficulty: 'intermediate',
    durationMinutes: 30,
    topic: 'backend_engineering',
    persona: 'neutral',
    sessionMode: 'time',       // 'time' | 'questions'
    questionCount: 10,         // used when sessionMode === 'questions'
    currentQuestion: 0,
    conversationHistory: [],
    evaluation: null,
};

const session = { ...DEFAULTS, conversationHistory: [] };

// ---------------------------------------------------------------------------
// Screen management
// ---------------------------------------------------------------------------

export function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach((el) => {
        el.classList.remove('screen--active');
    });
    const target = document.getElementById(screenId);
    if (target) {
        target.classList.add('screen--active');
    }
}

// ---------------------------------------------------------------------------
// Session state accessors
// ---------------------------------------------------------------------------

export function getSession() {
    return session;
}

export function resetSession() {
    Object.assign(session, { ...DEFAULTS, conversationHistory: [], evaluation: null });
}

export function setDifficulty(level) {
    session.difficulty = level;
}

export function setDuration(minutes) {
    session.durationMinutes = minutes;
}

export function setTopic(topic) {
    session.topic = topic;
}

export function setResumeText(text) {
    session.resumeText = text;
}

export function setJobDescription(text) {
    session.jobDescription = text;
}

export function setPersona(persona) {
    session.persona = persona;
}

export function setSessionMode(mode) {
    session.sessionMode = mode;
}

export function setQuestionCount(count) {
    session.questionCount = count;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

async function apiFetch(path, options) {
    const res = await fetch(path, options);
    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || `Request failed (${res.status})`);
    }
    return res.json();
}

export async function startSession() {
    session.currentQuestion = 0;
    session.conversationHistory = [];
    session.evaluation = null;

    const byQuestions = session.sessionMode === 'questions';
    const body = {
        resume_text: session.resumeText || null,
        job_description: session.jobDescription || null,
        difficulty: session.difficulty,
        duration_minutes: byQuestions ? 60 : session.durationMinutes,  // sentinel value for by-questions mode
        topic: session.topic,
        persona: session.persona,
        question_count: byQuestions ? session.questionCount : null,
    };

    const data = await apiFetch('/start_session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

    session.sessionId = data.session_id;
    return data; // { session_id, question_text, question_audio_base64 }
}

export async function submitAnswer(audioBlob) {
    const formData = new FormData();
    formData.append('session_id', session.sessionId);
    formData.append('audio', audioBlob, 'recording.wav');

    const data = await apiFetch('/process_turn', { method: 'POST', body: formData });
    session.currentQuestion = data.question_number;
    return data; // { transcript, ai_response, audio_base64, question_number }
}

export async function endSession() {
    const data = await apiFetch('/end_session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: session.sessionId }),
    });
    session.evaluation = data;
    return data; // { overall_score, summary, strengths, weaknesses, suggestions, per_question }
}

// ---------------------------------------------------------------------------
// History (localStorage)
// ---------------------------------------------------------------------------

const HISTORY_KEY = 'interview_history';
const HISTORY_MAX = 50;

export function saveSessionToHistory(evaluation, speakingMetrics) {
    const pq = evaluation.per_question ?? [];
    const dims = { technical: 0, communication: 0, completeness: 0, confidence: 0 };
    if (pq.length > 0) {
        pq.forEach(q => {
            const d = q.dimensions ?? {};
            dims.technical    += d.technical_accuracy ?? 0;
            dims.communication += d.communication ?? 0;
            dims.completeness  += d.completeness ?? 0;
            dims.confidence    += d.confidence ?? 0;
        });
        const n = pq.length;
        dims.technical    = Math.round((dims.technical    / n) * 10) / 10;
        dims.communication = Math.round((dims.communication / n) * 10) / 10;
        dims.completeness  = Math.round((dims.completeness  / n) * 10) / 10;
        dims.confidence    = Math.round((dims.confidence    / n) * 10) / 10;
    }

    const entry = {
        id: Date.now().toString(36),
        date: new Date().toISOString(),
        topic: session.topic,
        difficulty: session.difficulty,
        duration_minutes: session.sessionMode === 'time' ? session.durationMinutes : null,
        session_mode: session.sessionMode,
        overall_score: evaluation.overall_score ?? 0,
        avg_dimension_scores: dims,
        question_count: pq.length,
        filler_word_count: speakingMetrics?.filler_word_count ?? 0,
    };

    const history = getHistory();
    history.push(entry);
    // FIFO eviction
    if (history.length > HISTORY_MAX) history.splice(0, history.length - HISTORY_MAX);
    try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch (_) { /* storage full — silently ignore */ }
    return entry;
}

export function getHistory() {
    try {
        return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]');
    } catch (_) {
        return [];
    }
}
