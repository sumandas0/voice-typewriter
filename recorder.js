// Voice Typewriter - Audio Recorder Module

/**
 * A class to handle audio recording with configurable quality settings
 */
export class AudioRecorder {
  constructor(options = {}) {
    this.options = {
      quality: options.quality || 'medium'
    };
    
    // Sample rate based on quality
    this.sampleRate = this._qualityToSampleRate(this.options.quality);
    
    // Media recorder and stream
    this.mediaRecorder = null;
    this.stream = null;
    this.chunks = [];
    
    // Event callbacks
    this.onStartCallback = null;
    this.onStopCallback = null;
    this.onErrorCallback = null;
  }
  
  // Set callback for when recording starts
  onStart(callback) {
    this.onStartCallback = callback;
    return this;
  }
  
  // Set callback for when recording stops
  onStop(callback) {
    this.onStopCallback = callback;
    return this;
  }
  
  // Set callback for errors
  onError(callback) {
    this.onErrorCallback = callback;
    return this;
  }
  
  // Convert quality setting to sample rate
  _qualityToSampleRate(quality) {
    switch (quality) {
      case 'low': return 8000;
      case 'high': return 24000;
      case 'medium':
      default: return 16000;
    }
  }
  
  // Start recording
  async start() {
    try {
      // Request microphone access
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: this.sampleRate,
          channelCount: 1, // Mono
          echoCancellation: true,
          noiseSuppression: true
        }
      });
      
      // Initialize MediaRecorder
      this.mediaRecorder = new MediaRecorder(this.stream);
      this.chunks = [];
      
      // Set up data handler
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.chunks.push(event.data);
        }
      };
      
      // Set up stop handler
      this.mediaRecorder.onstop = async () => {
        // Create a blob from all chunks
        const blob = new Blob(this.chunks, { type: 'audio/webm' });
        
        // Clean up
        this._cleanUp();
        
        // Trigger callback with the blob
        if (this.onStopCallback) {
          this.onStopCallback(blob);
        }
      };
      
      // Start recording
      this.mediaRecorder.start(100); // Collect data every 100ms
      
      // Trigger start callback
      if (this.onStartCallback) {
        this.onStartCallback();
      }
    } catch (error) {
      this._handleError(error);
    }
  }
  
  // Stop recording
  stop() {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      try {
        this.mediaRecorder.stop();
      } catch (error) {
        this._handleError(error);
      }
    }
  }
  
  // Check if recording is active
  isActive() {
    return this.mediaRecorder && this.mediaRecorder.state === 'recording';
  }
  
  // Handle errors
  _handleError(error) {
    console.error('AudioRecorder error:', error);
    
    // Clean up resources
    this._cleanUp();
    
    // Trigger error callback
    if (this.onErrorCallback) {
      this.onErrorCallback(error);
    }
  }
  
  // Clean up resources
  _cleanUp() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    
    this.mediaRecorder = null;
    this.chunks = [];
  }
  
  // Static method to convert blob to base64
  static async blobToBase64(blob) {
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
  
  // Static method to convert blob to File object
  static blobToFile(blob, filename = 'recording.webm') {
    return new File([blob], filename, { type: blob.type });
  }
} 