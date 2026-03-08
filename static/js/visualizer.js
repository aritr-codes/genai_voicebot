/**
 * Draw real-time frequency bars on the visualizer canvas during recording.
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
        let barHeight;
        let x = 0;

        for (let i = 0; i < dataArray.length; i++) {
            barHeight = (dataArray[i] / 255) * canvas.height * 0.8;

            const gradient = canvasCtx.createLinearGradient(0, canvas.height - barHeight, 0, canvas.height);
            gradient.addColorStop(0, '#667eea');
            gradient.addColorStop(0.5, '#764ba2');
            gradient.addColorStop(1, '#f093fb');

            canvasCtx.fillStyle = gradient;
            canvasCtx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);

            x += barWidth + 1;
        }

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
