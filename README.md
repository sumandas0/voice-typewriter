# Voice Typewriter Chrome Extension

A Chrome extension that enables voice-to-text input directly in your browser, with optional Groq LLM-powered text enhancement.

## Features

- **Voice-to-Text Input**: Dictate text using your microphone within the browser
- **Real-time Transcription**: Convert spoken audio into text with the Web Speech API
- **Groq LLM Enhancement**: Optionally refine the transcribed text for grammar and clarity using Groq's high-speed LLM API
- **Seamless Text Insertion**: Insert text into the active input field at your cursor position
- **User Configuration**: Customize language settings and Groq API integration

## Setup Instructions

1. **Install the Extension**:
   - Download the extension files
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (toggle in the top-right corner)
   - Click "Load unpacked" and select the extension directory

2. **Configure Settings**:
   - Click the extension's icon in your browser toolbar
   - Select "Options" from the popup menu
   - Set your preferred language for speech recognition
   - To enable Groq LLM enhancement:
     - Get a Groq API key from [console.groq.com/keys](https://console.groq.com/keys)
     - Enter your API key in the options page
     - Toggle on the Groq enhancement feature

## Usage

1. Click the Voice Typewriter icon in your toolbar or use the keyboard shortcut (Ctrl+Shift+V or ⌘+Shift+V on Mac)
2. Start speaking when the "Listening..." status appears
3. Click "Stop Dictation" or wait for a natural pause in speech
4. The text will be processed (and optionally enhanced by Groq) and inserted at your cursor position

## Requirements

- Google Chrome browser (latest version recommended)
- Microphone access
- Internet connection
- Groq API key (only if using the enhancement feature)

## Privacy & Security

- Audio is processed locally using the Groq ASR API
- Transcribed text is only sent to Groq if the enhancement feature is enabled and a valid API key is provided
- Your Groq API key is stored securely in Chrome's storage and is only used to communicate with the Groq API
- No voice data or transcribed text is stored persistently by the extension

## Development

This extension uses the Chrome Extension Manifest V3 format. Key files:

- `manifest.json`: Extension configuration
- `background.js`: Service worker for core logic
- `offscreen.html` & `offscreen.js`: Handles Web Speech API (requires offscreen document)
- `content.js`: Handles text insertion into web pages
- `popup.html` & `popup.js`: User interface
- `options.html` & `options.js`: Settings configuration

## License

MIT License 