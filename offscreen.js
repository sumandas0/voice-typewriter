// Voice Typewriter - Offscreen Document for Speech Recognition

let recognition = null;
let isRecognizing = false;
let mediaRecorder = null;
let recordingStream = null;
let audioChunks = [];
let recordingStartTime = null;
let recordingTimerId = null;

// Initialize when the document loads
document.addEventListener('DOMContentLoaded', async () => {
  console.log('Offscreen document loaded');
  
  // Set up permission change listener to update stored state
  try {
    const micPermission = await navigator.permissions.query({ name: 'microphone' });
    micPermission.addEventListener('change', () => {
      console.log('Microphone permission state changed:', micPermission.state);
      
      // Send message to background script to update permission state
      // since offscreen document might not have storage access
      chrome.runtime.sendMessage({
        action: 'updateMicrophonePermission',
        state: micPermission.state
      }).catch(err => console.error('Error sending permission update:', err));
    });
    
    // Send initial permission state to background
    chrome.runtime.sendMessage({
      action: 'updateMicrophonePermission',
      state: micPermission.state
    }).catch(err => console.error('Error sending initial permission state:', err));
  } catch (error) {
    console.error('Failed to set up permission monitoring:', error);
  }
  
  // Listen for messages from the service worker
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.target !== 'offscreen') return;
    
    if (message.action === 'startRecognition') {
      startRecognition(message.language || 'en-US');
      sendResponse({ success: true });
    } else if (message.action === 'stopRecognition') {
      stopRecognition();
      sendResponse({ success: true });
    } else if (message.action === 'requestMicrophonePermission') {
      requestMicrophonePermission().then(result => {
        sendResponse({ success: true, result });
      }).catch(error => {
        sendResponse({ success: false, error: error.message });
      });
      return true; // Keep the message channel open for async response
    } else if (message.action === 'startRecording') {
      startRecording(message.options || {}).then(result => {
        sendResponse({ success: true, result });
      }).catch(error => {
        sendResponse({ success: false, error: error.message });
      });
      return true; // Keep the message channel open for async response
    } else if (message.action === 'stopRecording') {
      stopRecording().then(result => {
        sendResponse({ success: true, ...result });
      }).catch(error => {
        sendResponse({ success: false, error: error.message });
      });
      return true; // Keep the message channel open for async response
    } else if (message.action === 'cancelRecording') {
      cancelRecording();
      sendResponse({ success: true });
    }
    return true; // Keep the message channel open for async responses
  });
  
  // Initial permission request on document load
  await requestMicrophonePermission();
  
  // Add global keyboard listener for ESC key
  document.addEventListener('keydown', handleKeyDown);
});

// Handle keydown events
function handleKeyDown(event) {
  // Check if ESC key is pressed
  if (event.key === 'Escape') {
    // Send cancel message to background script
    chrome.runtime.sendMessage({
      action: "cancelDictation"
    });
  }
}

// Explicitly request microphone permission
async function requestMicrophonePermission() {
  try {
    // Check if we already have permission before requesting it
    const permission = await navigator.permissions.query({ name: 'microphone' });
    
    // If permission status is already granted, return success immediately
    if (permission.state === 'granted') {
      console.log('Microphone permission already granted');
      updateStatus('Microphone permission granted');
      
      // Notify background script about permission
      chrome.runtime.sendMessage({
        action: 'updateMicrophonePermission',
        state: 'granted'
      }).catch(err => console.error('Error sending permission state:', err));
      
      return { granted: true };
    }
    
    // If permission is denied by the user, don't try to request it again
    if (permission.state === 'denied') {
      console.error('Microphone permission previously denied by user');
      const message = 'Microphone access denied. Use the "Open Chrome Settings" button in the extension and then:\n' +
                      '1. Find "Microphone" in the site settings\n' +
                      '2. Change it to "Allow"\n' +
                      '3. Reload the extension';
      
      updateStatus('Microphone access denied');
      
      // Notify background script about permission
      chrome.runtime.sendMessage({
        action: 'updateMicrophonePermission',
        state: 'denied'
      }).catch(err => console.error('Error sending permission state:', err));
      
      return { granted: false, error: message };
    }
    
    // Try to get user media to trigger permission prompt if the state is 'prompt'
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // If successful, we have permission - clean up the stream
      stream.getTracks().forEach(track => track.stop());
      
      console.log('Microphone permission granted');
      updateStatus('Microphone permission granted');
      
      // Notify background script about permission
      chrome.runtime.sendMessage({
        action: 'updateMicrophonePermission',
        state: 'granted'
      }).catch(err => console.error('Error sending permission state:', err));
      
      return { granted: true };
    } catch (mediaError) {
      console.error('getUserMedia error:', mediaError.name, mediaError.message);
      
      // Handle different getUserMedia errors
      if (mediaError.name === 'NotAllowedError' || mediaError.name === 'PermissionDeniedError') {
        // Check if it was denied or dismissed
        const currentPermission = await navigator.permissions.query({ name: 'microphone' });
        
        if (currentPermission.state === 'denied') {
          // User explicitly denied permission
          const message = 'Microphone access denied. Use the "Open Chrome Settings" button in the extension and then:\n' +
                        '1. Find "Microphone" in the site settings\n' +
                        '2. Change it to "Allow"\n' +
                        '3. Reload the extension';
          
          // Notify background script about denied permission
          chrome.runtime.sendMessage({
            action: 'updateMicrophonePermission',
            state: 'denied'
          }).catch(err => console.error('Error sending permission state:', err));
          
          updateStatus('Microphone access denied');
          return { granted: false, error: message };
        } else {
          // User dismissed the prompt
          // Notify background script about prompt dismissal
          chrome.runtime.sendMessage({
            action: 'updateMicrophonePermission',
            state: 'prompt'
          }).catch(err => console.error('Error sending permission state:', err));
          
          updateStatus('Waiting for microphone permission');
          return { granted: false, error: '' };
        }
      } else if (mediaError.name === 'NotFoundError') {
        return { granted: false, error: 'No microphone found. Please connect a microphone and try again.' };
      } else {
        return { granted: false, error: `Microphone error: ${mediaError.message}` };
      }
    }
  } catch (error) {
    console.error('Microphone permission error:', error.message);
    return { granted: false, error: `Failed to access microphone: ${error.message}` };
  }
}

// Start speech recognition
function startRecognition(language) {
  if (isRecognizing) {
    stopRecognition();
  }
  
  try {
    // Check if the browser supports the Web Speech API
    if (!window.webkitSpeechRecognition && !window.SpeechRecognition) {
      sendError('Speech recognition not supported in this browser');
      return;
    }
    
    // Create a new SpeechRecognition instance
    const SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition;
    recognition = new SpeechRecognition();
    
    // Configure recognition
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = language;
    recognition.maxAlternatives = 1;
    
    // Set up event handlers
    recognition.onstart = () => {
      isRecognizing = true;
      console.log('Speech recognition started');
      updateStatus('Listening...');
    };
    
    recognition.onresult = handleRecognitionResult;
    recognition.onerror = handleRecognitionError;
    recognition.onend = handleRecognitionEnd;
    
    // First request microphone permission
    requestMicrophonePermission().then(result => {
      if (result.granted) {
        // Start recognition if permission is granted
        recognition.start();
      } else {
        sendError(result.error || 'Microphone access denied. Please allow microphone access in your browser settings and try again.');
      }
    });
  } catch (error) {
    sendError(error.message);
  }
}

// Handle recognition results
function handleRecognitionResult(event) {
  const result = event.results[event.results.length - 1];
  const transcript = result[0].transcript;
  
  if (result.isFinal) {
    console.log("Final transcript:", transcript);
    chrome.runtime.sendMessage({
      action: "transcriptionResult",
      text: transcript
    });
  }
}

// Handle recognition errors
function handleRecognitionError(event) {
  console.error("Recognition error:", event.error);
  
  let errorMessage = "An error occurred during speech recognition.";
  
  switch (event.error) {
    case 'no-speech':
      errorMessage = "No speech was detected.";
      break;
    case 'aborted':
      errorMessage = "Speech recognition was aborted.";
      break;
    case 'audio-capture':
      errorMessage = "Microphone not found or not working.";
      break;
    case 'not-allowed':
      errorMessage = "Microphone access denied.";
      break;
    case 'service-not-allowed':
      errorMessage = "Speech recognition service not allowed.";
      break;
    case 'bad-grammar':
      errorMessage = "Grammar error in speech recognition.";
      break;
    case 'language-not-supported':
      errorMessage = "The language is not supported.";
      break;
  }
  
  chrome.runtime.sendMessage({
    action: "transcriptionError",
    error: errorMessage
  });
  
  isRecognizing = false;
}

// Handle recognition end event
function handleRecognitionEnd() {
  console.log("Speech recognition ended");
  isRecognizing = false;
  
  // Only restart if we're still actively recognizing
  // This prevents endless restarts if there was an error
  if (recognition && isRecognizing) {
    console.log("Restarting speech recognition");
    recognition.start();
  }
}

// Stop speech recognition
function stopRecognition() {
  if (recognition && isRecognizing) {
    try {
      recognition.stop();
    } catch (error) {
      console.error('Error stopping recognition:', error);
    }
  }
  
  isRecognizing = false;
}

// Start recording audio for Groq ASR
async function startRecording(options = {}) {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    await stopRecording();
  }
  
  try {
    // Request microphone permission
    const permissionResult = await requestMicrophonePermission();
    if (!permissionResult.granted) {
      return { success: false, error: permissionResult.error };
    }
    
    // Get sample rate from options
    const sampleRate = getSampleRateFromQuality(options.quality || 'medium');
    
    // Request microphone with appropriate settings
    recordingStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: sampleRate,
        channelCount: 1, // Mono
        echoCancellation: true,
        noiseSuppression: true
      }
    });
    
    // Create a MediaRecorder instance
    mediaRecorder = new MediaRecorder(recordingStream);
    audioChunks = [];
    
    // Configure audio quality
    const mimeType = 'audio/webm';
    let bitRate = 128000; // Default medium quality
    
    if (options.quality === 'low') {
      bitRate = 64000;
    } else if (options.quality === 'high') {
      bitRate = 256000;
    }
    
    // Set up event listeners
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };
    
    // Start recording
    mediaRecorder.start(100); // Collect data every 100ms
    recordingStartTime = Date.now();
    
    // Start a timer to track recording duration and emit updates
    startRecordingTimer();
    
    console.log("Recording started with quality:", options.quality);
    return { success: true };
  } catch (error) {
    console.error('Error starting recording:', error);
    return { success: false, error: error.message };
  }
}

// Start a timer to track recording duration
function startRecordingTimer() {
  // Clear any existing timer
  if (recordingTimerId) {
    clearInterval(recordingTimerId);
  }
  
  // Start a new timer that fires every 100ms
  recordingTimerId = setInterval(() => {
    if (recordingStartTime) {
      const elapsed = Date.now() - recordingStartTime;
      
      // Send time update message to popup
      chrome.runtime.sendMessage({
        action: "recordingTimeUpdate",
        time: elapsed
      }).catch(() => {
        // Popup might not be open, ignore error
      });
    }
  }, 100);
}

// Stop recording and return audio data
async function stopRecording() {
  return new Promise((resolve, reject) => {
    if (!mediaRecorder) {
      reject(new Error('No active recording'));
      return;
    }
    
    // Stop the recording timer
    if (recordingTimerId) {
      clearInterval(recordingTimerId);
      recordingTimerId = null;
    }
    
    // Define what happens when recording stops
    mediaRecorder.onstop = async () => {
      // Create the final audio blob
      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      
      // Clean up
      if (recordingStream) {
        recordingStream.getTracks().forEach(track => track.stop());
        recordingStream = null;
      }
      
      // Convert the blob to base64 for transmission
      const base64data = await blobToBase64(audioBlob);
      
      resolve({
        success: true,
        audioData: base64data,
        mimeType: 'audio/webm',
        duration: Date.now() - recordingStartTime
      });
    };
    
    // Add error handler
    mediaRecorder.onerror = (event) => {
      reject(new Error(`Recording error: ${event.error}`));
    };
    
    // Stop recording
    try {
      mediaRecorder.stop();
      updateStatus('Processing recording...');
    } catch (error) {
      reject(error);
    }
  });
}

// Convert quality setting to sample rate
function getSampleRateFromQuality(quality) {
  switch (quality) {
    case 'low': return 8000;
    case 'high': return 24000;
    case 'medium':
    default: return 16000;
  }
}

// Convert blob to base64
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      // Get the base64 string (remove the data URL prefix)
      const base64String = reader.result.split(',')[1];
      resolve(base64String);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Update the status in the DOM
function updateStatus(message) {
  const statusElement = document.getElementById('status');
  if (statusElement) {
    statusElement.textContent = message;
  }
}

// Send error to the service worker
function sendError(errorMessage) {
  console.error('Speech recognition error:', errorMessage);
  updateStatus(`Error: ${errorMessage}`);
  
  chrome.runtime.sendMessage({
    action: 'transcriptionError',
    error: errorMessage
  });
}

// Implement Voice Activity Detection (VAD) - Basic version
// For a more sophisticated VAD, WebRTC's VAD would need to be implemented
// This is a simple version that uses the audio API to detect voice activity
function setupVAD() {
  // This would be a more complex implementation using WebRTC
  // For now, we rely on the built-in VAD of Web Speech API
  console.log('Using built-in VAD from Web Speech API');
}

// Cancel recording without processing
function cancelRecording() {
  console.log("Cancelling recording");
  
  // Stop the recording timer
  if (recordingTimerId) {
    clearInterval(recordingTimerId);
    recordingTimerId = null;
  }
  
  // Stop media recorder if active
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    try {
      mediaRecorder.stop();
    } catch (error) {
      console.error('Error stopping recorder:', error);
    }
  }
  
  // Clean up
  if (recordingStream) {
    recordingStream.getTracks().forEach(track => track.stop());
    recordingStream = null;
  }
  
  // Reset audio chunks
  audioChunks = [];
  mediaRecorder = null;
  recordingStartTime = null;
  
  updateStatus('Recording cancelled');
}

// Function to cancel dictation (from ESC key)
function cancelDictation() {
  console.log("Cancelling dictation from offscreen document");
  
  // Cancel speech recognition if active
  if (isRecognizing && recognition) {
    try {
      recognition.abort();
      isRecognizing = false;
    } catch (error) {
      console.error('Error canceling recognition:', error);
    }
  }
  
  // Cancel recording if active
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    cancelRecording();
  }
  
  // Update status
  updateStatus('Dictation cancelled');
  
  // Notify the background script
  chrome.runtime.sendMessage({
    action: 'dictationCanceled'
  });
} 