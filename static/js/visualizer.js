/**
 * Draw real-time frequency bars on the visualizer canvas during recording.
 * Bars have rounded tops and a subtle glow effect.
 */
export function visualize(canvas, canvasCtx, analyser, dataArray, isRecordingFn) {
    function draw() {
        if (!isRecordingFn() || !analyser) return;

        if (canvas.width === 0 || canvas.height === 0) {
            canvas.width = canvas.offsetWidth || 400;
            canvas.height = canvas.offsetHeight || 120;
        }

        analyser.getByteFrequencyData(dataArray);

        canvasCtx.fillStyle = '#000000';
        canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

        const barWidth = (canvas.width / dataArray.length) * 2.5;
        const radius = barWidth / 2;
        let x = 0;

        canvasCtx.shadowBlur = 8;
        canvasCtx.shadowColor = '#764ba2';

        for (let i = 0; i < dataArray.length; i++) {
            const barHeight = Math.max((dataArray[i] / 255) * canvas.height * 0.8, 1);
            const top = canvas.height - barHeight;

            const gradient = canvasCtx.createLinearGradient(0, top, 0, canvas.height);
            gradient.addColorStop(0, '#667eea');
            gradient.addColorStop(0.5, '#764ba2');
            gradient.addColorStop(1, '#f093fb');

            canvasCtx.fillStyle = gradient;

            // Bar body
            canvasCtx.fillRect(x, top + radius, barWidth, Math.max(barHeight - radius, 0));
            // Rounded top cap
            canvasCtx.beginPath();
            canvasCtx.arc(x + radius, top + radius, radius, Math.PI, 0);
            canvasCtx.fill();

            x += barWidth + 1;
        }

        canvasCtx.shadowBlur = 0;
        requestAnimationFrame(draw);
    }

    draw();
}

/**
 * Draw a gentle idle pulsing sine wave when not recording.
 * Stops automatically when isIdleFn() returns false.
 */
export function idleVisualize(canvas, canvasCtx, isIdleFn) {
    let t = 0;

    function draw() {
        if (!isIdleFn()) return;

        if (canvas.width === 0 || canvas.height === 0) {
            canvas.width = canvas.offsetWidth || 400;
            canvas.height = canvas.offsetHeight || 120;
        }

        canvasCtx.fillStyle = '#000000';
        canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

        const amplitude = 10 * (0.6 + 0.4 * Math.sin(t * 0.7));

        canvasCtx.beginPath();
        canvasCtx.strokeStyle = '#667eea';
        canvasCtx.lineWidth = 2;
        canvasCtx.shadowBlur = 6;
        canvasCtx.shadowColor = '#667eea';

        for (let x = 0; x < canvas.width; x++) {
            const y = canvas.height / 2 + Math.sin((x / canvas.width) * Math.PI * 4 + t) * amplitude;
            if (x === 0) canvasCtx.moveTo(x, y);
            else canvasCtx.lineTo(x, y);
        }

        canvasCtx.stroke();
        canvasCtx.shadowBlur = 0;
        t += 0.04;

        requestAnimationFrame(draw);
    }

    draw();
}

/**
 * Draw a static waveform of recorded audio on a canvas.
 */
export function drawWaveform(audioUrl, waveformCanvas, waveCtx, waveformContainer) {
    const audio = new Audio(audioUrl);
    audio.addEventListener('loadedmetadata', async () => {
        try {
            const response = await fetch(audioUrl);
            const arrayBuffer = await response.arrayBuffer();
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

            const channelData = audioBuffer.getChannelData(0);
            waveformCanvas.width = waveformCanvas.offsetWidth;
            waveformCanvas.height = waveformCanvas.offsetHeight;

            waveCtx.fillStyle = '#1a1a1a';
            waveCtx.fillRect(0, 0, waveformCanvas.width, waveformCanvas.height);

            waveCtx.strokeStyle = '#667eea';
            waveCtx.lineWidth = 2;
            waveCtx.beginPath();

            const sliceWidth = waveformCanvas.width / channelData.length;
            let x = 0;

            for (let i = 0; i < channelData.length; i++) {
                const v = channelData[i] * 0.5;
                const y = (v * waveformCanvas.height / 2) + (waveformCanvas.height / 2);

                if (i === 0) {
                    waveCtx.moveTo(x, y);
                } else {
                    waveCtx.lineTo(x, y);
                }

                x += sliceWidth;
            }

            waveCtx.stroke();
            waveformContainer.classList.add('active');
        } catch (error) {
            console.error('Error drawing waveform:', error);
        }
    });
}
