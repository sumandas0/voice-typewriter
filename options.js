// Voice Typewriter - Options Script

// DOM elements
// const languageSelect = document.getElementById('language'); // Removed Web Speech API
const enhanceWithGroqToggle = document.getElementById('enhanceWithGroq');
const groqApiKeyInput = document.getElementById('groqApiKey');
const saveButton = document.getElementById('saveButton');
const statusMessage = document.getElementById('statusMessage');
// const webSpeechApiRadio = document.getElementById('webSpeechApi'); // Removed Web Speech API
const groqAsrRadio = document.getElementById('groqAsr'); // Keep for reference if needed, though visually removed
// const webSpeechOptions = document.getElementById('webSpeechOptions'); // Removed Web Speech API
const groqAsrOptions = document.getElementById('groqAsrOptions');
const groqAsrModelSelect = document.getElementById('groqAsrModel');
const asrLanguageInput = document.getElementById('asrLanguage');
const recordingQualitySelect = document.getElementById('recordingQuality');
const showRecordingControlsToggle = document.getElementById('showRecordingControls');
const enhancementOptions = document.getElementById('enhancementOptions');
const groqLlmModelSelect = document.getElementById('groqLlmModel');
const enhancementTemperature = document.getElementById('enhancementTemperature');
const temperatureValue = document.getElementById('temperatureValue');

// Load saved options when the page loads
document.addEventListener('DOMContentLoaded', () => {
  loadOptions();
  checkMicrophoneAccess();
});

// Check microphone access
function checkMicrophoneAccess() {
  navigator.mediaDevices.getUserMedia({ audio: true })
    .then(stream => {
      // Access granted, clean up
      stream.getTracks().forEach(track => track.stop());
    })
    .catch(error => {
      // Microphone access denied or other error
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        const extensionId = chrome.runtime.id;
        const settingsUrl = `chrome://settings/content/siteDetails?site=chrome-extension%3A%2F%2F${extensionId}`;
        
        const errorMsg = `
          <div class="api-info" style="border-left: 4px solid #c5221f;">
            <strong>Microphone access denied!</strong> Since this extension uses Groq ASR, microphone access is required.
            <br><br>
            Please go to <a href="#" id="settings-link">${settingsUrl}</a> to enable microphone access.
            <br>
            (Copy the link and open in a new tab, as Chrome doesn't allow direct links to settings pages)
          </div>
        `;
        
        // Insert the error message at the top of the ASR section
        const asrSection = document.querySelector('.option-group h2');
        if (asrSection) {
          const errorDiv = document.createElement('div');
          errorDiv.innerHTML = errorMsg;
          asrSection.parentNode.insertBefore(errorDiv, asrSection.nextSibling);
          
          // Add click handler to copy the URL
          document.getElementById('settings-link').addEventListener('click', (e) => {
            e.preventDefault();
            navigator.clipboard.writeText(settingsUrl)
              .then(() => {
                showStatus('Settings URL copied to clipboard. Please paste in a new tab.', 'success');
              });
          });
        }
      }
    });
}

// Save options when the save button is clicked
saveButton.addEventListener('click', saveOptions);

// Toggle dependent options when recognition method changes
// webSpeechApiRadio.addEventListener('change', toggleOptions); // Removed Web Speech API
// groqAsrRadio.addEventListener('change', toggleOptions); // No longer needed to toggle ASR options
enhanceWithGroqToggle.addEventListener('change', toggleEnhancementOptions); // Renamed toggle function

// Update temperature display when slider changes
enhancementTemperature.addEventListener('input', () => {
  temperatureValue.textContent = enhancementTemperature.value;
});

// Load saved options from chrome.storage
function loadOptions() {
  chrome.storage.sync.get({
    // recognitionMethod: 'webSpeechApi', // Default to groqAsr
    // language: 'en-US', // Removed Web Speech API language
    enhanceWithGroq: false,
    groqApiKey: '',
    groqAsrModel: 'whisper-large-v3-turbo',
    asrLanguage: 'en',
    recordingQuality: 'medium',
    showRecordingControls: false,
    groqLlmModel: 'llama3-70b-8192',
    enhancementTemperature: 0.3
  }, (items) => {
    // Set recognition method - Now always groqAsr
    // if (items.recognitionMethod === 'webSpeechApi') { // Removed Web Speech API
    //   webSpeechApiRadio.checked = true;
    // } else if (items.recognitionMethod === 'groqAsr') {
    //   groqAsrRadio.checked = true; // Input visually removed, but might exist in HTML
    // }
    
    // Set other options
    // languageSelect.value = items.language; // Removed Web Speech API language
    enhanceWithGroqToggle.checked = items.enhanceWithGroq;
    groqApiKeyInput.value = items.groqApiKey;
    groqAsrModelSelect.value = items.groqAsrModel;
    asrLanguageInput.value = items.asrLanguage;
    recordingQualitySelect.value = items.recordingQuality;
    showRecordingControlsToggle.checked = items.showRecordingControls;
    groqLlmModelSelect.value = items.groqLlmModel;
    enhancementTemperature.value = items.enhancementTemperature;
    temperatureValue.textContent = items.enhancementTemperature;
    
    // Initialize dependent options visibility
    // toggleOptions(); // Split into specific toggles
    toggleEnhancementOptions(); // Call the specific toggle function
  });
}

// Toggle visibility of Groq enhancement options
function toggleEnhancementOptions() {
  if (enhanceWithGroqToggle.checked) {
    enhancementOptions.classList.remove('hidden');
  } else {
    enhancementOptions.classList.add('hidden');
  }
}

// Save options to chrome.storage
function saveOptions() {
  // Get selected recognition method - Now always groqAsr
  const recognitionMethod = 'groqAsr';
  
  // Get other options
  // const language = languageSelect.value; // Removed Web Speech API language
  const enhanceWithGroq = enhanceWithGroqToggle.checked;
  const groqApiKey = groqApiKeyInput.value.trim();
  const groqAsrModel = groqAsrModelSelect.value;
  const asrLanguage = asrLanguageInput.value.trim();
  const recordingQuality = recordingQualitySelect.value;
  const showRecordingControls = showRecordingControlsToggle.checked;
  const groqLlmModel = groqLlmModelSelect.value;
  const enhancementTemperatureValue = parseFloat(enhancementTemperature.value);
  
  // Validate the Groq API key if Groq features are enabled
  // Enhancement requires key, ASR always requires key now
  if (!groqApiKey) {
    showStatus('Please enter a valid Groq API key to use Groq ASR and enhancement features.', 'error');
    return;
  }
  
  // Save all options
  chrome.storage.sync.set({
    recognitionMethod, // Always 'groqAsr'
    // language, // Removed Web Speech API language
    enhanceWithGroq,
    groqApiKey,
    groqAsrModel,
    asrLanguage,
    recordingQuality,
    showRecordingControls,
    groqLlmModel,
    enhancementTemperature: enhancementTemperatureValue
  }, () => {
    showStatus('Options saved successfully!', 'success');
  });
}

// Display a status message
function showStatus(message, type) {
  statusMessage.textContent = message;
  statusMessage.className = 'status ' + type;
  
  // Clear the status after a few seconds
  setTimeout(() => {
    statusMessage.className = 'status';
  }, 3000);
} 