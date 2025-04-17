// Voice Typewriter - Groq API Service

export class GroqService {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.groq.com/openai/v1';
  }
  
  // Update API key
  setApiKey(apiKey) {
    this.apiKey = apiKey;
  }
  
  // Get API key
  getApiKey() {
    return this.apiKey;
  }
  
  // Transcribe audio using Groq ASR API
  async transcribeAudio(audioBlob, options = {}) {
    if (!this.apiKey) {
      throw new Error('Groq API key is required for transcription');
    }
    
    try {
      // Create a FormData object to send the file
      const formData = new FormData();
      
      // Add the audio file - converting blob to File
      const file = new File([audioBlob], 'recording.webm', { type: audioBlob.type });
      formData.append('file', file);
      
      // Add model parameter (required)
      formData.append('model', options.model || 'whisper-large-v3-turbo');
      
      // Add optional parameters if provided
      if (options.language) {
        formData.append('language', options.language);
      }
      
      if (options.prompt) {
        formData.append('prompt', options.prompt);
      }
      
      // Default to verbose_json for timestamps
      formData.append('response_format', options.responseFormat || 'verbose_json');
      
      // Default to 0 for temperature (more deterministic output)
      formData.append('temperature', options.temperature || 0);
      
      // Set timestamp granularities to both word and segment if verbose_json
      if (options.responseFormat === 'verbose_json') {
        formData.append('timestamp_granularities[]', 'segment');
        formData.append('timestamp_granularities[]', 'word');
      }
      
      // Make the API request
      const response = await fetch(`${this.baseUrl}/audio/transcriptions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: formData
      });
      
      if (!response.ok) {
        // Log status for debugging
        console.error(`Groq API Error Status: ${response.status} ${response.statusText}`);
        
        // Try to parse the error response body
        let errorData = {};
        let errorMessage = `Transcription failed: ${response.statusText}`;
        try {
          errorData = await response.json();
          errorMessage = errorData.error?.message || errorMessage;
        } catch (e) {
          console.error("Could not parse error response JSON:", e);
        }
        
        // Check for specific auth errors
        if (response.status === 401 || response.status === 403) {
          console.error("Authentication/Authorization error detected.");
          errorMessage = `Access denied (Status ${response.status}). Please check your Groq API key in the extension options.`;
        }
        
        throw new Error(errorMessage);
      }
      
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Groq ASR processing error details:', error);
      // Check if it's the auth error we threw above
      if (error.message.includes('Access denied') && error.message.includes('API key')) {
        throw error; // Re-throw the specific API key error
      }
      // Handle network errors
      if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
         console.error('Network error suspected. Check connectivity and permissions for:', `${this.baseUrl}/audio/transcriptions`);
         throw new Error('Network error: Could not reach Groq API. Check connection and permissions.');
      } 
      // Rethrow other errors or provide a generic message
      throw new Error(`Groq ASR request failed: ${error.message || 'Unknown error'}`);
    }
  }
  
  // Enhance text using Groq LLM API
  async enhanceText(text, options = {}) {
    if (!this.apiKey) {
      throw new Error('Groq API key is required for text enhancement');
    }
    
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: options.model || 'llama3-70b-8192',
          messages: [
            {
              role: 'system',
              content: 'Improve the following text for grammar, clarity, and readability while preserving the original meaning and intent. Do not add extra information or change the core message. Output ONLY the corrected text, with no additional explanation, preamble, or formatting. Dont add any other text or comments.'
            },
            {
              role: 'user',
              content: text
            }
          ],
          temperature: options.temperature || 0.3,
          max_tokens: options.maxTokens || 1024
        })
      });

      if (!response.ok) {
        // Log status for debugging
        console.error(`Groq LLM API Error Status: ${response.status} ${response.statusText}`);
        
        let errorData = {};
        let errorMessage = `Text enhancement failed: ${response.statusText}`;
        try {
          errorData = await response.json();
          errorMessage = errorData.error?.message || errorMessage;
        } catch (e) {
          console.error("Could not parse LLM error response JSON:", e);
        }
        
        // Check for specific auth errors
        if (response.status === 401 || response.status === 403) {
          console.error("Authentication/Authorization error detected.");
          errorMessage = `Access denied (Status ${response.status}). Please check your Groq API key in the extension options.`;
        }
        
        throw new Error(errorMessage);
      }

      const data = await response.json();
      return data.choices[0].message.content.trim();
    } catch (error) {
      console.error("Groq LLM processing error details:", error);
      // Check if it's the auth error we threw above
      if (error.message.includes('Access denied') && error.message.includes('API key')) {
        throw error; // Re-throw the specific API key error
      }
      // Handle network errors
      if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
         console.error('Network error suspected. Check connectivity and permissions for:', `${this.baseUrl}/chat/completions`);
         throw new Error('Network error: Could not reach Groq API. Check connection and permissions.');
      } 
      // Rethrow other errors
      throw new Error(`Groq LLM request failed: ${error.message || 'Unknown error'}`);
    }
  }
} 