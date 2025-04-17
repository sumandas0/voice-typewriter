// Voice Typewriter - Popup Script

// DOM elements
const dictateButton = document.getElementById('dictateButton');
const statusText = document.getElementById('statusText');
const shortcutText = document.getElementById('shortcutText');
const permissionInstructions = document.getElementById('permissionInstructions');
// const permissionBtn = document.getElementById('permissionBtn');
const settingsBtn = document.getElementById('settingsBtn');
const recordControls = document.getElementById('recordControls');
const recordButton = document.getElementById('recordButton');
const stopButton = document.getElementById('stopButton');
const recordingTimer = document.getElementById('recordingTimer');
const asrMethod = document.getElementById('asrMethod');
const apiKeyPrompt = document.getElementById('apiKeyPrompt');
const apiKeyInput = document.getElementById('apiKeyInput');
const saveApiKeyBtn = document.getElementById('saveApiKeyBtn');
const apiKeyStatus = document.getElementById('apiKeyStatus');

// Extension states mapped to UI states
const State = {
  IDLE: 'idle',
  LISTENING: 'listening',
  RECORDING: 'recording',
  PROCESSING_ASR: 'processing-asr',
  PROCESSING_GROQ: 'processing-groq',
  ERROR: 'error'
};

// Recording timer variables
let recordingStartTime = 0;
let recordingTimerId = null;

// Initialize when the popup loads
document.addEventListener('DOMContentLoaded', async () => {
  // Get DOM elements
  const dictateButton = document.getElementById('dictateButton');
  const statusText = document.getElementById('statusText');
  // const errorText = document.getElementById('errorText');
  const permissionInstructions = document.getElementById('permissionInstructions');
  // const permissionBtn = document.getElementById('permissionBtn');
  const settingsBtn = document.getElementById('settingsBtn');
  const recordControls = document.getElementById('recordControls');
  const recordButton = document.getElementById('recordButton');
  const stopButton = document.getElementById('stopButton');
  const recordingTimer = document.getElementById('recordingTimer');
  const shortcutText = document.getElementById('shortcutText');
  const asrMethod = document.getElementById('asrMethod');
  const apiKeyPrompt = document.getElementById('apiKeyPrompt');
  const apiKeyInput = document.getElementById('apiKeyInput');
  const saveApiKeyBtn = document.getElementById('saveApiKeyBtn');
  const apiKeyStatus = document.getElementById('apiKeyStatus');
  
  // Set up event listeners
  dictateButton.addEventListener('click', toggleDictation);
  recordButton.addEventListener('click', startRecording);
  stopButton.addEventListener('click', stopRecording);
  /* permissionBtn.addEventListener('click', async () => {
    // Hide error text
    errorText.textContent = '';
    
    // Clear stored permission state to force a fresh request
    await chrome.storage.local.remove('microphonePermission');
    
    // Request permission again
    await requestMicrophonePermission();
  }); */
  
  // Add event listener for Chrome Settings button
  settingsBtn.addEventListener('click', () => {
    const extensionId = chrome.runtime.id;
    const settingsUrl = `chrome://settings/content/siteDetails?site=chrome-extension%3A%2F%2F${extensionId}`;
    
    // Try to open the settings page directly
    chrome.tabs.create({ url: settingsUrl }).catch(error => {
      // If direct opening fails, fall back to clipboard method
      navigator.clipboard.writeText(settingsUrl)
        .then(() => {
          statusText.textContent = 'Settings URL copied to clipboard. Paste in a new tab.';
          
          // Create temporary notification
          const notif = document.createElement('div');
          notif.style.position = 'fixed';
          notif.style.top = '10px';
          notif.style.left = '50%';
          notif.style.transform = 'translateX(-50%)';
          notif.style.backgroundColor = '#4285f4';
          notif.style.color = 'white';
          notif.style.padding = '8px 12px';
          notif.style.borderRadius = '4px';
          notif.style.zIndex = '1000';
          notif.textContent = 'URL copied! Paste in a new tab';
          document.body.appendChild(notif);
          
          // Remove notification after 3 seconds
          setTimeout(() => {
            document.body.removeChild(notif);
          }, 3000);
        })
        .catch(err => {
          console.error('Failed to copy settings URL:', err);
          statusText.textContent = 'Failed to open settings page';
        });
    });
  });
  
  // Set keyboard shortcut text based on platform
  const isMac = navigator.platform.includes('Mac');
  shortcutText.textContent = `Shortcut: ${isMac ? '⌘' : 'Ctrl'}+Shift+V`;
  
  // Add event listener for API key save button
  saveApiKeyBtn.addEventListener('click', async () => {
    await validateAndSaveApiKey();
  });
  
  // Also trigger on Enter key in the input field
  apiKeyInput.addEventListener('keyup', (event) => {
    if (event.key === 'Enter') {
      validateAndSaveApiKey();
    }
  });
  
  // Initialize in proper sequence
  await initializeExtension();
});

// Initialize extension in the correct sequence
async function initializeExtension() {
  try {
    // Step 1: First load ASR settings - this determines which ASR method we're using
    await loadAsrSettings();
    
    // Step 2: Check if the API key is configured (only relevant for Groq ASR)
    await checkGroqApiKey();
    
    // Step 3: Check for microphone permissions (using the correct settings)
    await checkMicrophonePermission();
    
    // Step 4: Check current recording state
    await checkInitialState();
    
  } catch (error) {
    console.error('Failed to initialize extension:', error);
    statusText.textContent = 'Failed to initialize extension';
  }
}

// Check initial state from background script
async function checkInitialState() {
  try {
    const response = await chrome.runtime.sendMessage({ action: "getState" });
    if (response && response.state) {
      await updateUI(response.state);
    }
  } catch (error) {
    console.error("Failed to get initial state:", error);
  }
}

// Check if microphone permission is available
async function checkMicrophonePermission() {
  try {
    // Get stored permission state and settings
    const [permissionState, options] = await Promise.all([
      chrome.storage.local.get('microphonePermission'),
      chrome.storage.sync.get({ recognitionMethod: 'groqAsr' })
    ]);
    
    const permissionInstructions = document.getElementById('permissionInstructions');
    
    // Only check/show microphone permissions for Groq ASR (Web Speech API handles its own permissions)
    if (options.recognitionMethod !== 'groqAsr') {
      permissionInstructions.classList.remove('show');
      return;
    }
    
    console.log('Microphone permission state:', permissionState.microphonePermission);
    
    // If permission is explicitly denied, show instructions
    if (permissionState.microphonePermission === 'denied') {
      permissionInstructions.classList.add('show');
    } 
    // If permission is in prompt state or undefined, we need to explicitly check
    else if (!permissionState.microphonePermission || permissionState.microphonePermission === 'prompt') {
      // Request permission check through offscreen document
      await requestMicrophonePermission();
    } else {
      // Permission is granted, hide instructions
      permissionInstructions.classList.remove('show');
    }
  } catch (error) {
    console.error("Failed to check microphone permission:", error);
  }
}

// Check if the Groq API key is configured
async function checkGroqApiKey() {
  try {
    // Get Groq API key from storage
    const options = await chrome.storage.sync.get({
      groqApiKey: '',
      recognitionMethod: 'groqAsr'
    });
    
    // Only show prompt if using Groq ASR and API key is not set
    if (options.recognitionMethod === 'groqAsr' && !options.groqApiKey) {
      // Show the API key prompt
      apiKeyPrompt.classList.add('show');
      
      // Disable dictate button until API key is configured
      dictateButton.disabled = true;
    } else {
      // Hide the API key prompt
      apiKeyPrompt.classList.remove('show');
      
      // Enable dictate button
      dictateButton.disabled = false;
    }
  } catch (error) {
    console.error('Failed to check Groq API key:', error);
  }
}

// Validate and save the Groq API key
async function validateAndSaveApiKey() {
  // Get the API key from the input
  const apiKey = apiKeyInput.value.trim();
  
  // Disable button while validating
  saveApiKeyBtn.disabled = true;
  apiKeyStatus.textContent = 'Validating...';
  apiKeyStatus.className = 'status';
  
  if (!apiKey) {
    apiKeyStatus.textContent = 'Please enter an API key';
    apiKeyStatus.className = 'status error';
    saveApiKeyBtn.disabled = false;
    return;
  }
  
  try {
    // Test the API key with a simple request to Groq API
    const response = await fetch('https://api.groq.com/openai/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.ok) {
      // Save ALL the relevant settings to ensure consistency
      await chrome.storage.sync.set({ 
        groqApiKey: apiKey,
        recognitionMethod: 'groqAsr' // Ensure we're using Groq ASR
      });
      
      // Show success message
      apiKeyStatus.textContent = 'API key saved successfully!';
      apiKeyStatus.className = 'status success';
      
      // Notify background script about the new API key
      try {
        await chrome.runtime.sendMessage({
          action: "apiKeyUpdated",
          apiKey: apiKey
        });
        console.log("Background script notified about new API key");
      } catch (err) {
        console.warn("Couldn't notify background script:", err);
      }
      
      // Update ASR method display immediately
      asrMethod.textContent = 'Using: Groq ASR';
      
      // Hide API key prompt
      apiKeyPrompt.classList.remove('show');
      dictateButton.disabled = false;
      
      // Force reload settings to ensure they're up to date
      await loadAsrSettings();
    } else {
      // API key is invalid
      const errorData = await response.json().catch(() => ({}));
      apiKeyStatus.textContent = errorData.error?.message || 'Invalid API key';
      apiKeyStatus.className = 'status error';
    }
  } catch (error) {
    console.error('Error validating API key:', error);
    apiKeyStatus.textContent = 'Error validating API key';
    apiKeyStatus.className = 'status error';
  }
  
  // Re-enable save button
  saveApiKeyBtn.disabled = false;
}

// Load ASR settings from storage
async function loadAsrSettings() {
  try {
    const options = await chrome.storage.sync.get({
      recognitionMethod: 'groqAsr', // Default to Groq ASR now
      showRecordingControls: false,
      groqApiKey: ''
    });
    
    console.log('Loaded ASR settings:', { 
      method: options.recognitionMethod,
      hasKey: !!options.groqApiKey,
      controls: options.showRecordingControls 
    });
    
    // Update ASR method display
    const asrMethod = document.getElementById('asrMethod');
    asrMethod.textContent = options.recognitionMethod === 'webSpeechApi' 
      ? 'Using: Web Speech API' 
      : 'Using: Groq ASR';
    
    // Show/hide recording controls based on settings
    const recordControls = document.getElementById('recordControls');
    if (options.showRecordingControls) {
      recordControls.classList.add('show');
    } else {
      recordControls.classList.remove('show');
    }
    
    return options;
  } catch (error) {
    console.error("Failed to load ASR settings:", error);
    throw error; // Re-throw to be caught by the initialization function
  }
}

// Request microphone permission via offscreen document
async function requestMicrophonePermission() {
  try {
    // First ensure the offscreen document is created
    await chrome.runtime.sendMessage({ action: "ensureOffscreenDocumentCreated" });
    
    // Request permission through offscreen document
    const response = await chrome.runtime.sendMessage({
      target: "offscreen",
      action: "requestMicrophonePermission"
    });
    
    // Get the DOM elements
    const permissionInstructions = document.getElementById('permissionInstructions');
    
    // Handle the response
    if (response.success) {
      if (response.result.granted) {
        // Permission is granted, hide instructions
        permissionInstructions.classList.remove('show');
        console.log('Microphone permission granted');
      } else {
        // Permission is denied or dismissed, show instructions
        permissionInstructions.classList.add('show');
        console.log('Microphone permission denied or dismissed:', response.result.error);
      }
    } else {
      // General error, show instructions
      permissionInstructions.classList.add('show');
      console.error('Failed to check microphone permission:', response.error);
    }
  } catch (error) {
    console.error("Failed to request microphone permission:", error);
    // Show instructions on error
    const permissionInstructions = document.getElementById('permissionInstructions');
    permissionInstructions.classList.add('show');
  }
}

// Toggle dictation on/off
async function toggleDictation() {
  try {
    // First check current state
    const response = await chrome.runtime.sendMessage({ action: "getState" });
    
    if (response.state === 'idle') {
      // Start dictation
      await startDictation();
    } else if (response.state === 'listening' || response.state === 'recording') {
      // Stop dictation
      await stopDictation();
    }
  } catch (error) {
    console.error("Failed to toggle dictation:", error);
  }
}

// Start dictation
async function startDictation() {
  try {
    // Get the settings first
    const options = await chrome.storage.sync.get({
      recognitionMethod: 'groqAsr',
      groqApiKey: ''
    });
    
    // For Groq ASR, check if we have an API key
    if (options.recognitionMethod === 'groqAsr' && !options.groqApiKey) {
      // Show API key prompt
      apiKeyPrompt.classList.add('show');
      return;
    }
    
    // Check if we have microphone permission (only relevant for Groq ASR)
    if (options.recognitionMethod === 'groqAsr') {
      const permissionState = await chrome.storage.local.get('microphonePermission');
      
      // If permission is not granted, show instructions and request it
      if (permissionState.microphonePermission !== 'granted') {
        await requestMicrophonePermission();
        
        // Recheck permission after request
        const newPermissionState = await chrome.storage.local.get('microphonePermission');
        if (newPermissionState.microphonePermission !== 'granted') {
          permissionInstructions.classList.add('show');
          return;
        }
      }
    }
    
    // Send start message to background script
    await chrome.runtime.sendMessage({ action: "startDictation" });
  } catch (error) {
    console.error("Failed to start dictation:", error);
    statusText.textContent = 'Failed to start dictation';
  }
}

// Stop dictation
async function stopDictation() {
  try {
    // Send stop message to background script
    await chrome.runtime.sendMessage({ action: "stopDictation" });
  } catch (error) {
    console.error("Failed to stop dictation:", error);
  }
}

// Start recording (when using manual controls)
async function startRecording() {
  try {
    // Send start recording message to background script
    await chrome.runtime.sendMessage({ action: "startRecording" });
  } catch (error) {
    console.error("Failed to start recording:", error);
  }
}

// Stop recording (when using manual controls)
async function stopRecording() {
  try {
    // Send stop recording message to background script
    await chrome.runtime.sendMessage({ action: "stopRecording" });
  } catch (error) {
    console.error("Failed to stop recording:", error);
  }
}

// Update UI based on state
async function updateUI(state, errorMsg = '') {
  // Get DOM elements
  const dictateButton = document.getElementById('dictateButton');
  const statusText = document.getElementById('statusText');
  
  // Set error message if provided
  if (errorMsg) {
    statusText.textContent = errorMsg;
    return; // Skip normal status updates if we're showing an error
  }
  
  // Update UI based on state
  switch (state) {
    case 'idle':
      dictateButton.textContent = 'Start Dictation';
      dictateButton.classList.remove('listening', 'recording', 'processing');
      statusText.textContent = 'Ready';
      break;
    case 'listening':
      dictateButton.textContent = 'Stop Dictation';
      dictateButton.classList.add('listening');
      dictateButton.classList.remove('recording', 'processing');
      statusText.textContent = 'Listening...';
      break;
    case 'recording':
      dictateButton.textContent = 'Stop Recording';
      dictateButton.classList.add('recording');
      dictateButton.classList.remove('listening', 'processing');
      statusText.textContent = 'Recording...';
      break;
    case 'processing-asr':
      dictateButton.textContent = 'Processing...';
      dictateButton.classList.add('processing');
      dictateButton.classList.remove('listening', 'recording');
      statusText.textContent = 'Processing speech...';
      dictateButton.disabled = true;
      break;
    case 'processing-groq':
      dictateButton.textContent = 'Processing...';
      dictateButton.classList.add('processing');
      dictateButton.classList.remove('listening', 'recording');
      statusText.textContent = 'Enhancing with Groq...';
      dictateButton.disabled = true;
      break;
    case 'error':
      dictateButton.textContent = 'Start Dictation';
      dictateButton.classList.remove('listening', 'recording', 'processing');
      dictateButton.disabled = false;
      statusText.textContent = 'Error occurred';
      break;
    default:
      dictateButton.textContent = 'Start Dictation';
      dictateButton.classList.remove('listening', 'recording', 'processing');
      statusText.textContent = 'Ready';
  }
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "updateState") {
    updateUI(message.state, message.error);
    sendResponse({ success: true });
  } else if (message.action === "recordingTimeUpdate") {
    updateRecordingTimer(message.time);
    sendResponse({ success: true });
  }
  return true; // Keep the message channel open for async responses
});

// Update recording timer display
function updateRecordingTimer(milliseconds) {
  const recordingTimer = document.getElementById('recordingTimer');
  
  // Convert to seconds and format
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  // Format as MM:SS
  recordingTimer.textContent = `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
} 