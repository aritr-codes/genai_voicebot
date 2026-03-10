/**
 * history.js — Renders the #screen-history view.
 * Draws a Canvas sparkline (score trend) + stats strip + session cards.
 */

import { getHistory } from './session.js';

const TOPIC_LABELS = {
    backend_engineering:    'Backend Eng.',
    frontend_engineering:   'Frontend Eng.',
    full_stack:             'Full Stack',
    mobile:                 'Mobile',
    machine_learning:       'ML / AI',
    data_engineering:       'Data Eng.',
    system_design:          'System Design',
    product_management:     'Product Mgmt',
    devops_cloud:           'DevOps / Cloud',
    digital_marketing:      'Digital Marketing',
    seo_content:            'SEO / Content',
    performance_marketing:  'Perf. Marketing',
    behavioral:             'Behavioral',
    general:                'General',
};

function topicLabel(t) {
    return TOPIC_LABELS[t] ?? t.replace(/_/g, ' ');
}

function capitalize(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

function formatDate(isoStr) {
    const d = new Date(isoStr);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function scoreColor(score) {
    if (score >= 8) return '#22c55e';
    if (score >= 6) return '#f59e0b';
    return '#ef4444';
}

// ---------------------------------------------------------------------------
// Sparkline
// ---------------------------------------------------------------------------

function drawSparkline(canvas, scores) {
    const ctx = canvas.getContext('2d');
    const W = canvas.offsetWidth || canvas.width || 320;
    const H = canvas.offsetHeight || canvas.height || 80;
    canvas.width  = W;
    canvas.height = H;

    ctx.clearRect(0, 0, W, H);

    if (scores.length < 2) {
        ctx.fillStyle = 'var(--text-secondary, #9ca3af)';
        ctx.font = '13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Need at least 2 sessions to show trend', W / 2, H / 2 + 5);
        return;
    }

    const pad = { top: 10, right: 16, bottom: 20, left: 28 };
    const plotW = W - pad.left - pad.right;
    const plotH = H - pad.top - pad.bottom;

    const minScore = Math.max(0, Math.min(...scores) - 1);
    const maxScore = Math.min(10, Math.max(...scores) + 1);
    const range    = maxScore - minScore || 1;

    const xOf = (i) => pad.left + (i / (scores.length - 1)) * plotW;
    const yOf = (v) => pad.top  + (1 - (v - minScore) / range) * plotH;

    // Gradient fill under line
    const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
    grad.addColorStop(0,   'rgba(102, 126, 234, 0.35)');
    grad.addColorStop(1,   'rgba(102, 126, 234, 0)');
    ctx.beginPath();
    ctx.moveTo(xOf(0), yOf(scores[0]));
    for (let i = 1; i < scores.length; i++) ctx.lineTo(xOf(i), yOf(scores[i]));
    ctx.lineTo(xOf(scores.length - 1), pad.top + plotH);
    ctx.lineTo(xOf(0), pad.top + plotH);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Line
    ctx.beginPath();
    ctx.strokeStyle = '#667eea';
    ctx.lineWidth   = 2.5;
    ctx.lineJoin    = 'round';
    ctx.moveTo(xOf(0), yOf(scores[0]));
    for (let i = 1; i < scores.length; i++) ctx.lineTo(xOf(i), yOf(scores[i]));
    ctx.stroke();

    // Dots
    scores.forEach((v, i) => {
        ctx.beginPath();
        ctx.arc(xOf(i), yOf(v), 4, 0, Math.PI * 2);
        ctx.fillStyle   = scoreColor(v);
        ctx.strokeStyle = 'var(--bg-primary, #fff)';
        ctx.lineWidth   = 1.5;
        ctx.fill();
        ctx.stroke();
    });

    // Y axis ticks (just min and max)
    ctx.fillStyle  = 'var(--text-secondary, #9ca3af)';
    ctx.font       = '11px sans-serif';
    ctx.textAlign  = 'right';
    ctx.fillText(maxScore.toFixed(0), pad.left - 4, pad.top + 5);
    ctx.fillText(minScore.toFixed(0), pad.left - 4, pad.top + plotH + 1);
}

// ---------------------------------------------------------------------------
// Stats strip
// ---------------------------------------------------------------------------

function computeStats(history) {
    if (!history.length) return null;
    const scores    = history.map(e => e.overall_score);
    const avgScore  = scores.reduce((a, b) => a + b, 0) / scores.length;

    // Best topic by avg score (min 2 sessions)
    const byTopic = {};
    history.forEach(e => {
        if (!byTopic[e.topic]) byTopic[e.topic] = [];
        byTopic[e.topic].push(e.overall_score);
    });
    let bestTopic = null;
    let bestTopicScore = -1;
    Object.entries(byTopic).forEach(([t, arr]) => {
        if (arr.length >= 2) {
            const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
            if (avg > bestTopicScore) { bestTopicScore = avg; bestTopic = t; }
        }
    });
    if (!bestTopic) {
        // Fall back to any topic with highest avg
        Object.entries(byTopic).forEach(([t, arr]) => {
            const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
            if (avg > bestTopicScore) { bestTopicScore = avg; bestTopic = t; }
        });
    }

    // Streak: consecutive calendar days with at least one session (most recent streak)
    const days = new Set(
        history.map(e => new Date(e.date).toDateString())
    );
    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 365; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        if (days.has(d.toDateString())) {
            streak++;
        } else if (i > 0) {
            break; // gap — streak ends
        }
    }

    return {
        total:      history.length,
        avgScore:   avgScore.toFixed(1),
        bestTopic,
        streak,
    };
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

export function renderHistoryScreen({
    sparklineCanvas,
    topicFilterEl,
    statsStripEl,
    cardsEl,
    emptyMsgEl,
}) {
    const history = getHistory().slice().reverse(); // newest first for cards

    // Populate topic filter
    const topics = [...new Set(getHistory().map(e => e.topic))].sort();
    topicFilterEl.innerHTML = '<option value="">All Topics</option>' +
        topics.map(t => `<option value="${t}">${topicLabel(t)}</option>`).join('');

    const activeTopic = topicFilterEl.value;
    const filtered    = activeTopic ? history.filter(e => e.topic === activeTopic) : history;

    // Stats strip (always over full history, not filtered)
    const stats = computeStats(getHistory());
    if (stats) {
        statsStripEl.innerHTML = `
            <div class="stat-item"><span class="stat-value">${stats.total}</span><span class="stat-label">Sessions</span></div>
            <div class="stat-item"><span class="stat-value">${stats.avgScore}</span><span class="stat-label">Avg Score</span></div>
            <div class="stat-item"><span class="stat-value">${topicLabel(stats.bestTopic ?? '')}</span><span class="stat-label">Best Topic</span></div>
            <div class="stat-item"><span class="stat-value">${stats.streak}<span class="stat-streak-unit"> day${stats.streak !== 1 ? 's' : ''}</span></span><span class="stat-label">Streak 🔥</span></div>
        `;
    } else {
        statsStripEl.innerHTML = '<p class="history-empty-hint">Complete your first interview to see stats.</p>';
    }

    // Sparkline — last 10 sessions for the selected topic (chronological)
    const sparkData = (activeTopic ? filtered : getHistory())
        .slice(-10)
        .map(e => e.overall_score);
    drawSparkline(sparklineCanvas, sparkData);

    // Session cards
    if (filtered.length === 0) {
        emptyMsgEl.style.display = '';
        cardsEl.innerHTML = '';
        return;
    }
    emptyMsgEl.style.display = 'none';
    cardsEl.innerHTML = filtered.map(e => {
        const color = scoreColor(e.overall_score);
        const dateStr = formatDate(e.date);
        return `
            <div class="hist-card">
                <div class="hist-card__header">
                    <span class="hist-card__topic">${topicLabel(e.topic)}</span>
                    <span class="hist-card__score" style="color:${color}">${(e.overall_score).toFixed(1)}</span>
                </div>
                <div class="hist-card__meta">
                    <span class="hist-card__badge hist-card__badge--diff">${capitalize(e.difficulty)}</span>
                    <span class="hist-card__badge">${e.question_count} Q</span>
                    ${e.filler_word_count > 0 ? `<span class="hist-card__badge">${e.filler_word_count} fillers</span>` : ''}
                    <span class="hist-card__date">${dateStr}</span>
                </div>
            </div>
        `;
    }).join('');
}
