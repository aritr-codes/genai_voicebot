/**
 * session.js — Interview session state management and screen transitions.
 */

const DEFAULTS = {
    sessionId: null,
    resumeText: null,
    difficulty: 'intermediate',
    durationMinutes: 30,
    topic: 'general',
    currentQuestion: 0,
    totalQuestions: null,
    conversationHistory: [],
    evaluation: null,
};

const session = { ...DEFAULTS, totalQuestions: null, conversationHistory: [] };

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
    Object.assign(session, {
        ...DEFAULTS,
        totalQuestions: null,
        conversationHistory: [],
        evaluation: null,
    });
}

export function setDifficulty(level) {
    session.difficulty = level;
}

export function setDuration(minutes) {
    session.durationMinutes = minutes;
    session.totalQuestions = Math.floor(minutes / 3);
}

export function setTopic(topic) {
    session.topic = topic;
}

export function setResumeText(text) {
    session.resumeText = text;
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
    session.totalQuestions = Math.floor(session.durationMinutes / 3);
    session.conversationHistory = [];
    session.evaluation = null;

    const data = await apiFetch('/start_session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            resume_text: session.resumeText || null,
            difficulty: session.difficulty,
            duration_minutes: session.durationMinutes,
            topic: session.topic,
        }),
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
