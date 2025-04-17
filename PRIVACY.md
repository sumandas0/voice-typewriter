# Privacy Policy for Voice Typewriter Chrome Extension

**Last Updated:** 18th April 2025

Thank you for using Voice Typewriter! This Privacy Policy explains how your data is handled when you use our Chrome extension. We are committed to protecting your privacy and ensuring transparency.

**1. Open Source and Transparency**

Voice Typewriter is an open-source project. You can review the entire codebase on [GitHub Voice Typewriter](https://github.com/sumandas0/voice-typewriter) to verify how the extension works and how your data is handled.

**2. Data We Do Not Collect or Process Ourselves**

We want to be clear: **We do not operate any servers for this extension, and we do not collect, store, or process your voice data or transcribed text on any servers we control.**

**3. Data Access and Usage**

*   **Microphone Access:** The core functionality of Voice Typewriter requires access to your computer's microphone.
    *   When you initiate dictation or recording, the extension requests permission to access your microphone.
    *   Audio is captured *only* when you actively start a dictation or recording session.
    *   Access is solely for the purpose of capturing audio for speech-to-text conversion or recording.
*   **Groq API Key:** If you choose to use the Groq ASR (Automatic Speech Recognition) or Groq LLM (Large Language Model) text enhancement features, you will need to provide your Groq API key.
    *   Your Groq API key is stored locally and securely on your computer using Chrome's built-in storage (`chrome.storage.sync` or `chrome.storage.local`).
    *   This key is **only** used to authenticate your requests directly with the Groq API. It is **never** sent to us or any other third party besides Groq.

**4. Data Processing by Third Parties (Groq)**

*   **Groq ASR:** When you use the Groq ASR feature:
    *   The audio captured from your microphone is sent directly from your browser to the Groq API for transcription.
    *   We do not intercept, store, or process this audio data ourselves.
*   **Groq LLM Text Enhancement:** If you enable text enhancement:
    *   The transcribed text (either from Groq ASR or the browser's Web Speech API) is sent directly from your browser to the Groq LLM API for refinement.
    *   We do not intercept, store, or process this text data ourselves.

We encourage you to review Groq's privacy policy to understand how they handle the data sent to their APIs: [Link to Groq's Privacy Policy - You'll need to find this]

**5. Text Insertion**

The final transcribed (and potentially enhanced) text is sent back to the content script running in your active browser tab to be inserted at your cursor's position. This text is not stored by the extension after insertion.

**6. Data Storage**

The only data the extension stores persistently are:
*   Your configuration settings (e.g., selected language, ASR method choice).
*   Your Groq API key (if provided).
This data is stored locally on your machine using `chrome.storage`.

**7. Security**

We take reasonable precautions to protect your locally stored data (like the API key). However, no method of electronic storage is 100% secure. The security of data transmitted to Groq is governed by their security practices.

**8. Changes to This Privacy Policy**

We will never update this policy.