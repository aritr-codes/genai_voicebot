import { AudioRecorder } from './recorder.js';
import { visualize, drawWaveform } from './visualizer.js';

// DOM elements
const recordBtn = document.getElementById('record-btn');
const stopBtn = document.getElementById('stop-btn');
const generateBtn = document.getElementById('generate-btn');
const clearBtn = document.getElementById('clear-btn');
const statusElem = document.getElementById('status');
const recordingStatus = document.getElementById('recording-status');
const previewAudio = document.getElementById('preview-audio');
const responsePanel = document.getElementById('response-panel');
const aiAudio = document.getElementById('ai-audio');
const aiText = document.getElementById('ai-text');
const transcriptElem = document.getElementById('transcript');
const visualizerContainer = document.getElementById('visualizer-container');
const visualizerCanvas = document.getElementById('visualizer');
const waveformContainer = document.getElementById('waveform');
const waveformCanvas = document.getElementById('waveform-canvas');
const recordingPanel = document.getElementById('recording-panel');
const progressBar = document.getElementById('recording-progress');
const progressFill = document.getElementById('progress-fill');

const canvasCtx = visualizerCanvas.getContext('2d');
const waveCtx = waveformCanvas.getContext('2d');

// Recorder instance
const recorder = new AudioRecorder();
let progressInterval = null;

recorder.onRecordingComplete = (blob) => {
    const audioUrl = URL.createObjectURL(blob);
    previewAudio.src = audioUrl;
    previewAudio.style.display = 'block';
    generateBtn.disabled = false;

    drawWaveform(audioUrl, waveformCanvas, waveCtx, waveformContainer);
    updateStatus('success', 'Recording complete! Preview and waveform available.');

    visualizerContainer.classList.remove('active');
    recordingPanel.classList.remove('active');
    progressBar.classList.remove('active');
};

recorder.onError = (message) => {
    updateStatus('error', message);
};

async function startRecording() {
    await recorder.start();
    if (!recorder.isRecording) return;

    recordBtn.style.display = 'none';
    stopBtn.style.display = 'inline-block';
    recordingStatus.textContent = 'Recording... (Max 30 seconds)';
    recordingPanel.classList.add('active');
    progressBar.classList.add('active');
    updateStatus('processing', 'Recording in progress...');

    // Setup visualizer canvas
    visualizerCanvas.width = visualizerCanvas.offsetWidth;
    visualizerCanvas.height = visualizerCanvas.offsetHeight;
    visualizerContainer.classList.add('active');

    visualize(
        visualizerCanvas,
        canvasCtx,
        recorder.analyser,
        recorder.dataArray,
        () => recorder.isRecording
    );

    // Progress bar animation
    let progress = 0;
    progressInterval = setInterval(() => {
        progress += 100 / 300; // 30 seconds = 300 intervals of 100ms
        progressFill.style.width = Math.min(progress, 100) + '%';
        if (progress >= 100 || !recorder.isRecording) {
            clearInterval(progressInterval);
        }
    }, 100);
}

function stopRecording() {
    recorder.stop();
    recordBtn.style.display = 'inline-block';
    stopBtn.style.display = 'none';
    recordingStatus.textContent = '';
    if (progressInterval) clearInterval(progressInterval);
}

async function generateResponse() {
    const audioBlob = recorder.getBlob();
    if (!audioBlob) {
        updateStatus('error', 'No recording available. Please record first.');
        return;
    }

    generateBtn.disabled = true;
    updateStatus('processing', 'Processing your audio... This may take 15-30 seconds.');

    try {
        const formData = new FormData();
        formData.append('audio', audioBlob, 'recording.wav');

        const response = await fetch('/process_audio', {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Processing failed');
        }

        const data = await response.json();

        transcriptElem.value = data.transcript;
        aiText.value = data.ai_response;

        const audioBytes = atob(data.audio_base64);
        const audioArray = new Uint8Array(audioBytes.length);
        for (let i = 0; i < audioBytes.length; i++) {
            audioArray[i] = audioBytes.charCodeAt(i);
        }
        const audioBlobResponse = new Blob([audioArray], { type: 'audio/wav' });
        const audioUrl = URL.createObjectURL(audioBlobResponse);
        aiAudio.src = audioUrl;

        responsePanel.style.display = 'block';
        updateStatus('success', 'Response generated successfully!');
    } catch (err) {
        console.error('Error generating response:', err);
        updateStatus('error', `Processing failed: ${err.message}`);
    } finally {
        generateBtn.disabled = false;
    }
}

function clearAll() {
    recorder.clear();
    previewAudio.style.display = 'none';
    previewAudio.src = '';
    responsePanel.style.display = 'none';
    aiAudio.src = '';
    aiText.value = '';
    transcriptElem.value = '';
    generateBtn.disabled = true;
    visualizerContainer.classList.remove('active');
    waveformContainer.classList.remove('active');
    recordingPanel.classList.remove('active');
    progressBar.classList.remove('active');
    progressFill.style.width = '0%';
    updateStatus('', 'Ready to process your question');
}

function updateStatus(type, message) {
    statusElem.className = 'status';
    if (type) statusElem.classList.add(type);
    statusElem.textContent = message;
}

// Event listeners
recordBtn.addEventListener('click', startRecording);
stopBtn.addEventListener('click', stopRecording);
generateBtn.addEventListener('click', generateResponse);
clearBtn.addEventListener('click', clearAll);

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
