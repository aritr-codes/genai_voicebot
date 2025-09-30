# AI Interview Assistant

A voice-based AI interview practice application that helps users prepare for technical interviews. Speak your questions and receive intelligent, conversational responses from an AI persona simulating an early-career ML/Data Engineering professional.

## Features

- **Voice Recording**: Record interview questions directly in your browser (up to 30 seconds)
- **Real-time Audio Visualization**: Visual feedback during recording with waveform display
- **Speech-to-Text**: Automatic transcription using AssemblyAI
- **AI Response Generation**: Context-aware responses powered by OpenAI GPT models
- **Text-to-Speech**: Natural voice responses using ElevenLabs TTS
- **Performance Optimization**: In-memory caching for faster repeat queries
- **Modern UI**: Responsive, gradient-based interface with smooth animations

## Demo

[Watch Demo Video](./demo.mp4)

## Tech Stack

**Backend:**
- FastAPI (Python web framework)
- OpenAI API (LLM responses)
- AssemblyAI API (Speech transcription)
- ElevenLabs API (Text-to-speech)
- NumPy, SciPy (Audio processing)
- soundfile, pydub (Audio format handling)

**Frontend:**
- Vanilla JavaScript
- Web Audio API (Visualization & processing)
- Canvas API (Audio visualization)
- Modern CSS (Gradients, animations, responsive design)

## Prerequisites

- Python 3.11+
- API Keys for:
  - OpenAI
  - AssemblyAI
  - ElevenLabs

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/ai-interview-assistant.git
cd ai-interview-assistant
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Create a `.env` file in the root directory:
```env
OPENAI_API_KEY=your_openai_api_key
ASSEMBLYAI_API_KEY=your_assemblyai_api_key
ELEVENLABS_API_KEY=your_elevenlabs_api_key
OPENAI_MODEL=gpt-3.5-turbo
```

## Usage

1. Start the server:
```bash
python app.py
```

2. Open your browser and navigate to:
```
http://localhost:7860
```

3. Click "Start Recording" and speak your interview question
4. Click "Stop Recording" when finished
5. Click "Generate AI Response" to get your answer
6. Listen to the AI's voice response and review the transcript

## Configuration

You can modify these settings in `app.py`:

- `MAX_RECORD_SECONDS`: Maximum recording duration (default: 30s)
- `MAX_FILE_MB`: Maximum audio file size (default: 5MB)
- `REQUEST_TIMEOUT_SECONDS`: API timeout (default: 45s)
- `CACHE_TTL_HOURS`: Cache lifetime (default: 24 hours)
- `TTS_SAMPLE_RATE`: Audio sample rate (default: 22050 Hz)

## API Endpoints

### `GET /`
Serves the main HTML interface

### `GET /health`
Returns server health status and performance metrics

### `POST /process_audio`
Processes audio recording and returns AI response
- **Input**: Audio file (WAV format)
- **Output**: JSON with transcript, AI response text, and TTS audio (base64)

## Performance Features

- **In-memory caching**: Reduces API calls for repeated queries
- **Audio optimization**: Automatic downsampling, normalization, and silence trimming
- **Concurrent request limiting**: Prevents server overload
- **Performance monitoring**: Tracks average response times

## Browser Support

- Chrome/Edge (recommended)
- Firefox
- Safari (with limited audio format support)

Requires browser support for:
- MediaRecorder API
- Web Audio API
- Canvas API

## Limitations

- Maximum recording length: 30 seconds
- Maximum file size: 5MB
- Requires stable internet connection for API calls
- LocalStorage/SessionStorage not used (in-memory only)

## Project Structure

```
.
├── app.py              # FastAPI backend server
├── index.html          # Frontend interface
├── requirements.txt    # Python dependencies
├── .env               # API keys (create this)
├── demo.mp4           # Demo video
└── README.md          # This file
```

## License

MIT License - feel free to use this project for learning and development.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Acknowledgments

- OpenAI for GPT models
- AssemblyAI for speech recognition
- ElevenLabs for text-to-speech
- FastAPI for the excellent web framework
