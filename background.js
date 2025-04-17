// Voice Typewriter - Background Service Worker

// Import external services
import { AudioRecorder } from './recorder.js';
import { GroqService } from './groq-service.js';

// State variables
let activeTab = null;
let isListening = false;
let lastTranscribedText = '';
let offscreenDocument = null;
let audioData = null;
let isTranscribing = false;
let recorder = null;
let isProcessing = false;
let lastCommandTime = 0;
let shortcutPressCount = 0;

// Extension states
const State = {
  IDLE: 'idle',
  LISTENING: 'listening',
  RECORDING: 'recording',
  PROCESSING_ASR: 'processing-asr',
  PROCESSING_GROQ: 'processing-groq',
  ERROR: 'error'
};

// Current state
let currentState = State.IDLE;
let offscreenLoaded = false;
let groqService = null;

// Initialize when the service worker loads
chrome.runtime.onInstalled.addListener(async () => {
  console.log("Voice Typewriter extension installed");
  await setDefaultOptions();
  await initializeGroqService();
  // Pre-create the offscreen document to avoid delay on first use
  await ensureOffscreenDocumentCreated();
});

// Handle messages from popup, content script, or offscreen document
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "startDictation") {
    startDictation();
    sendResponse({ success: true });
  } else if (message.action === "stopDictation") {
    stopDictation();
    sendResponse({ success: true });
  } else if (message.action === "getState") {
    sendResponse({ state: currentState });
  } else if (message.action === "transcriptionResult") {
    handleTranscriptionResult(message.text);
    sendResponse({ success: true });
  } else if (message.action === "transcriptionError") {
    handleError("ASR Error: " + message.error);
    sendResponse({ success: true });
  } else if (message.action === "ensureOffscreenDocumentCreated") {
    ensureOffscreenDocumentCreated().then(() => {
      sendResponse({ success: true });
    });
    return true; // Keep the message channel open for async response
  } else if (message.action === "startRecording") {
    startRecording();
    sendResponse({ success: true });
  } else if (message.action === "stopRecording") {
    stopRecording();
    sendResponse({ success: true });
  } else if (message.action === "dictationCanceled") {
    handleDictationCanceled();
    sendResponse({ success: true });
  } else if (message.action === "updateMicrophonePermission") {
    // Store microphone permission state received from offscreen document
    console.log('Received microphone permission update:', message.state);
    
    chrome.storage.local.set({ 
      microphonePermission: message.state 
    }).then(() => {
      console.log('Microphone permission state saved to storage');
      sendResponse({ success: true });
    }).catch(error => {
      console.error('Error saving microphone permission state:', error);
      sendResponse({ success: false, error: error.message });
    });
    
    return true; // Keep the message channel open for async response
  } else if (message.action === "apiKeyUpdated") {
    // Handle API key update notification from popup or options page
    console.log('Received API key update notification');
    
    // Reinitialize Groq service with the new API key
    initializeGroqService(message.apiKey).then(() => {
      sendResponse({ success: true });
    }).catch(error => {
      console.error('Error reinitializing Groq service:', error);
      sendResponse({ success: false, error: error.message });
    });
    
    return true; // Keep the message channel open for async response
  }
  return true; // Keep the message channel open for async responses
});

// Handle activation via shortcut
chrome.commands.onCommand.addListener((command) => {
  if (command === "_execute_action") {
    handleToggleShortcut();
  } else if (command === "cancel_dictation") {
    cancelDictation();
  }
});

// Handle the Command+Shift+V shortcut to start listening immediately
async function handleToggleShortcut() {
  // Prevent rapid shortcut pressing
  const now = Date.now();
  if (now - lastCommandTime < 500) {
    return;
  }
  lastCommandTime = now;
  
  try {
    // If we're already listening/recording, first stop and process it
    if (currentState === State.LISTENING || currentState === State.RECORDING) {
      stopDictation();
    } else {
      // If idle, start dictation immediately
      startDictation();
    }
  } catch (error) {
    handleError("Shortcut Error: " + error.message);
  }
}

// Cancel the current dictation (ESC key)
function cancelDictation() {
  if (currentState === State.LISTENING || currentState === State.RECORDING) {
    console.log("Cancelling dictation");
    
    // Stop any active recording/listening
    if (currentState === State.LISTENING) {
      chrome.runtime.sendMessage({
        target: "offscreen",
        action: "stopRecognition"
      });
    } else if (currentState === State.RECORDING) {
      chrome.runtime.sendMessage({
        target: "offscreen",
        action: "cancelRecording"
      });
    }
    
    // Reset to idle without processing
    currentState = State.IDLE;
    updateUI("Dictation cancelled");
    
    // Clear message after a brief delay
    setTimeout(() => {
      if (currentState === State.IDLE) {
        updateUI("");
      }
    }, 1500);
  }
}

// Set up default options if they don't exist
async function setDefaultOptions() {
  const options = await chrome.storage.sync.get({
    recognitionMethod: 'webSpeechApi',
    language: 'en-US',
    enhanceWithGroq: false,
    groqApiKey: '',
    groqAsrModel: 'whisper-large-v3-turbo',
    asrLanguage: 'en',
    recordingQuality: 'medium',
    showRecordingControls: false
  });
  
  // Only set if they don't exist
  if (options.groqApiKey === undefined) {
    await chrome.storage.sync.set({
      recognitionMethod: 'webSpeechApi',
      language: 'en-US',
      enhanceWithGroq: false,
      groqApiKey: '',
      groqAsrModel: 'whisper-large-v3-turbo',
      asrLanguage: 'en',
      recordingQuality: 'medium',
      showRecordingControls: false
    });
  }
}

// Initialize Groq service with API key
async function initializeGroqService(apiKey = null) {
  try {
    // If no API key is provided, get it from storage
    if (!apiKey) {
      const options = await chrome.storage.sync.get({
        groqApiKey: ''
      });
      apiKey = options.groqApiKey;
    }
    
    console.log('Initializing Groq service, API key exists:', !!apiKey);
    
    if (!groqService) {
      groqService = new GroqService(apiKey);
    } else {
      groqService.setApiKey(apiKey);
    }
  } catch (error) {
    console.error('Error initializing Groq service:', error);
  }
}

// Start dictation process
async function startDictation() {
  try {
    // Get recognition settings
    const options = await chrome.storage.sync.get({
      recognitionMethod: 'groqAsr',
      language: 'en-US',
      groqApiKey: '',
      groqAsrModel: 'whisper-large-v3-turbo',
      asrLanguage: 'en',
      recordingQuality: 'medium'
    });
    
    // Check if using Groq ASR and if API key is configured
    if (options.recognitionMethod === 'groqAsr' && !options.groqApiKey) {
      handleError("Groq API key is required. Please configure it in the options.");
      return;
    }
    
    // Update state immediately to show feedback to user
    currentState = State.LISTENING;
    updateUI();
    
    // Ensure offscreen document is created
    await ensureOffscreenDocumentCreated();
    
    // Check if we have microphone permission before proceeding
    const permissionState = await chrome.storage.local.get('microphonePermission');
    if (permissionState.microphonePermission === 'denied') {
      handleError("Microphone access denied. Please check your permission settings.");
      return;
    }
    
    if (options.recognitionMethod === 'webSpeechApi') {
      // Use Web Speech API - state is already set to LISTENING
      // Start recognition in offscreen document
      const langOptions = await chrome.storage.sync.get({
        language: 'en-US'
      });
      
      const response = await chrome.runtime.sendMessage({
        target: "offscreen",
        action: "startRecognition",
        language: langOptions.language
      });
      
      // Check if there was a permission error
      if (response && response.error && response.error.includes('denied')) {
        handleError("Microphone access denied. Please check your permission settings.");
        return;
      }
    } else if (options.recognitionMethod === 'groqAsr') {
      // Use Groq ASR (recording + API)
      await initializeGroqService();
      
      // Check if API key is set
      if (!groqService.getApiKey()) {
        handleError("Groq API key is not set. Please configure it in the options page.");
        return;
      }
      
      // Update state to recording for Groq ASR
      currentState = State.RECORDING;
      updateUI();
      
      // Start recording in offscreen document
      startRecording();
    }
  } catch (error) {
    handleError("Failed to start dictation: " + error.message);
  }
}

// Start audio recording for Groq ASR
async function startRecording() {
  try {
    // Get recording quality from options
    const options = await chrome.storage.sync.get({
      recordingQuality: 'medium'
    });
    
    // Update state
    currentState = State.RECORDING;
    updateUI();
    
    // Start recording in offscreen document
    const response = await chrome.runtime.sendMessage({
      target: "offscreen",
      action: "startRecording",
      options: {
        quality: options.recordingQuality
      }
    });
    
    if (!response.success) {
      throw new Error(response.error || "Failed to start recording");
    }
  } catch (error) {
    handleError("Failed to start recording: " + error.message);
  }
}

// Stop dictation process
function stopDictation() {
  if (currentState === State.LISTENING) {
    // Stop Web Speech API recognition
    chrome.runtime.sendMessage({
      target: "offscreen",
      action: "stopRecognition"
    });
    
    currentState = State.PROCESSING_ASR;
    updateUI();
  } else if (currentState === State.RECORDING) {
    // Stop recording for Groq ASR
    stopRecording();
  }
}

// Stop recording for Groq ASR
async function stopRecording() {
  try {
    currentState = State.PROCESSING_ASR;
    updateUI();
    
    // Stop recording in offscreen document
    const response = await chrome.runtime.sendMessage({
      target: "offscreen",
      action: "stopRecording"
    });
    
    if (!response.success) {
      throw new Error(response.error || "Failed to stop recording");
    }
    
    // Now send the audio data to Groq ASR
    const audioBlob = base64ToBlob(response.audioData, response.mimeType);
    const transcription = await processAudioWithGroq(audioBlob);
    handleTranscriptionResult(transcription.text);
  } catch (error) {
    handleError("Recording Error: " + error.message);
  }
}

// Convert base64 data to Blob
function base64ToBlob(base64, mimeType) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

// Process audio with Groq ASR API
async function processAudioWithGroq(audioBlob) {
  try {
    await initializeGroqService();
    
    // Get options for Groq ASR
    const options = await chrome.storage.sync.get({
      groqAsrModel: 'whisper-large-v3-turbo',
      asrLanguage: 'en'
    });
    
    // Update UI
    currentState = State.PROCESSING_ASR;
    updateUI();
    
    // Send to Groq ASR API
    const transcription = await groqService.transcribeAudio(audioBlob, {
      model: options.groqAsrModel,
      language: options.asrLanguage,
      responseFormat: 'verbose_json'
    });
    
    return transcription;
  } catch (error) {
    console.error("Groq ASR processing error:", error);
    throw error;
  }
}

// Handle transcription result from the Web Speech API or Groq ASR
async function handleTranscriptionResult(text) {
  if (!text || text.trim() === "") {
    currentState = State.IDLE;
    updateUI();
    return;
  }

  const options = await chrome.storage.sync.get({
    groqApiKey: '',
    enhanceWithGroq: false,
    groqLlmModel: 'llama3-70b-8192',
    enhancementTemperature: 0.3
  });

  // Check if we should enhance with Groq
  if (options.enhanceWithGroq && options.groqApiKey) {
    currentState = State.PROCESSING_GROQ;
    updateUI();
    
    try {
      await initializeGroqService();
      const enhancedText = await groqService.enhanceText(text, {
        model: options.groqLlmModel,
        temperature: options.enhancementTemperature
      });
      insertTextIntoActiveTab(enhancedText);
    } catch (error) {
      handleError("Groq Error: " + error.message);
      // Fall back to the raw transcription
      insertTextIntoActiveTab(text);
    }
  } else {
    // Use raw transcription
    insertTextIntoActiveTab(text);
  }
}

// Insert text into the active tab
async function insertTextIntoActiveTab(text) {
  try {
    // Get the active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab) {
      throw new Error("No active tab found");
    }

    // Execute content script to insert text
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    });

    // Send message to content script with the text to insert
    chrome.tabs.sendMessage(tab.id, { action: "insertText", text });
    
    // Reset state to idle
    currentState = State.IDLE;
    updateUI();
  } catch (error) {
    handleError("Insert Text Error: " + error.message);
  }
}

// Create or focus the offscreen document for audio processing
async function ensureOffscreenDocumentCreated() {
  if (offscreenLoaded) return;
  
  // Check if the offscreen document exists
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT']
  });

  if (existingContexts.length > 0) {
    offscreenLoaded = true;
    return;
  }

  // Create the offscreen document
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['USER_MEDIA'],
    justification: 'Speech recognition requires access to the microphone'
  });
  
  offscreenLoaded = true;
}

// Handle errors
function handleError(errorMessage) {
  console.error(errorMessage);
  currentState = State.ERROR;
  updateUI(errorMessage);
  
  // Reset to idle after a delay
  setTimeout(() => {
    if (currentState === State.ERROR) {
      currentState = State.IDLE;
      updateUI();
    }
  }, 3000);
}

// Update the extension badge based on current state
async function updateExtensionBadge() {
  try {
    // Set badge based on state
    switch (currentState) {
      case State.IDLE:
        chrome.action.setBadgeText({ text: "" });
        break;
      case State.LISTENING:
        chrome.action.setBadgeText({ text: "ON" });
        chrome.action.setBadgeBackgroundColor({ color: "#4285F4" }); // Blue
        break;
      case State.RECORDING:
        chrome.action.setBadgeText({ text: "REC" });
        chrome.action.setBadgeBackgroundColor({ color: "#EA4335" }); // Red
        break;
      case State.PROCESSING_ASR:
      case State.PROCESSING_GROQ:
        chrome.action.setBadgeText({ text: "..." });
        chrome.action.setBadgeBackgroundColor({ color: "#FBBC05" }); // Yellow
        break;
      case State.ERROR:
        chrome.action.setBadgeText({ text: "ERR" });
        chrome.action.setBadgeBackgroundColor({ color: "#EA4335" }); // Red
        break;
      default:
        chrome.action.setBadgeText({ text: "" });
    }
  } catch (error) {
    console.error("Error updating badge:", error);
  }
}

// Update the UI via the popup (if open)
function updateUI(errorMessage = "") {
  // Update badge first
  updateExtensionBadge();
  
  // Then try to update popup UI if it's open
  chrome.runtime.sendMessage({
    action: "updateState",
    state: currentState,
    error: errorMessage
  }).catch(() => {
    // Popup might not be open, ignore error
  });
}

async function handleDictationCanceled() {
  console.log('Dictation was canceled');
  
  // Reset state
  currentState = State.IDLE;
  lastTranscribedText = '';
  
  // Update the badge
  await updateExtensionBadge();
  
  // Close the popup if it's open
  const tabs = await chrome.tabs.query({});
  tabs.forEach(tab => {
    chrome.tabs.sendMessage(tab.id, { action: 'updatePopupState', state: 'idle' }).catch(() => {});
  });
} 