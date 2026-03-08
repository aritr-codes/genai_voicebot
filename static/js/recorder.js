import { convertToWav } from './wav-encoder.js';

const MAX_RECORD_SECONDS = 30;

/**
 * Manages audio recording via MediaRecorder and Web Audio API.
 */
export class AudioRecorder {
    constructor() {
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.audioBlob = null;
        this.isRecording = false;
        this.audioContext = null;
        this.analyser = null;
        this.dataArray = null;
        this.source = null;
        this.recordingStartTime = null;

        // Callbacks set by the consumer
        this.onRecordingComplete = null;
        this.onError = null;
    }

    async start() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
            });

            // Setup audio context for visualization
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            this.source = this.audioContext.createMediaStreamSource(stream);
            this.source.connect(this.analyser);

            this.analyser.fftSize = 256;
            const bufferLength = this.analyser.frequencyBinCount;
            this.dataArray = new Uint8Array(bufferLength);

            const mimeType = MediaRecorder.isTypeSupported('audio/wav;codecs=pcm')
                ? 'audio/wav;codecs=pcm'
                : 'audio/webm';
            this.mediaRecorder = new MediaRecorder(stream, { mimeType });
            this.audioChunks = [];

            this.mediaRecorder.ondataavailable = (event) => {
                this.audioChunks.push(event.data);
            };

            this.mediaRecorder.onstop = async () => {
                let blob = new Blob(this.audioChunks, { type: 'audio/wav' });
                if (mimeType.includes('webm')) {
                    try {
                        blob = await convertToWav(blob);
                    } catch (err) {
                        console.error('Conversion to WAV failed:', err);
                        if (this.onError) this.onError('Failed to convert audio to WAV format.');
                        return;
                    }
                }
                this.audioBlob = blob;
                stream.getTracks().forEach((track) => track.stop());
                if (this.onRecordingComplete) this.onRecordingComplete(blob);
            };

            this.mediaRecorder.start();
            this.isRecording = true;
            this.recordingStartTime = Date.now();

            // Auto-stop after max duration
            setTimeout(() => {
                if (this.isRecording) this.stop();
            }, MAX_RECORD_SECONDS * 1000);
        } catch (err) {
            console.error('Error accessing microphone:', err);
            if (this.onError) this.onError('Failed to access microphone. Please check permissions.');
        }
    }

    stop() {
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        }
        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close();
        }
        this.isRecording = false;
    }

    getBlob() {
        return this.audioBlob;
    }

    clear() {
        this.audioChunks = [];
        this.audioBlob = null;
    }
}
