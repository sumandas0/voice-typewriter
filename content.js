// Voice Typewriter - Content Script

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "insertText") {
    insertTextAtCursor(message.text);
    sendResponse({ success: true });
  }
  return true; // Keep the message channel open for async responses
});

// Insert text at cursor position in the active element
function insertTextAtCursor(text) {
  if (!text) return;

  // Get the active element
  const activeElement = document.activeElement;
  
  if (!activeElement) {
    console.error("No active element found");
    return;
  }

  try {
    // Check what type of element we're dealing with
    if (isStandardInputElement(activeElement)) {
      // For standard input elements (input, textarea)
      insertIntoStandardInput(activeElement, text);
    } else if (activeElement.isContentEditable) {
      // For contentEditable elements (rich text editors)
      insertIntoContentEditable(activeElement, text);
    } else {
      console.warn("Unsupported active element for text insertion:", activeElement.tagName);
    }
  } catch (error) {
    console.error("Error inserting text:", error);
  }
}

// Check if the element is a standard input element
function isStandardInputElement(element) {
  const tagName = element.tagName.toLowerCase();
  return (
    tagName === "input" && 
    (element.type === "text" || element.type === "search" || element.type === "url" || element.type === "email") ||
    tagName === "textarea"
  );
}

// Insert text into standard input elements (input, textarea)
function insertIntoStandardInput(element, text) {
  const start = element.selectionStart || 0;
  const end = element.selectionEnd || 0;
  const beforeText = element.value.substring(0, start);
  const afterText = element.value.substring(end);
  
  // Set the new value with the inserted text
  element.value = beforeText + text + afterText;
  
  // Move the cursor to the end of the inserted text
  const newPosition = start + text.length;
  element.setSelectionRange(newPosition, newPosition);
  
  // Trigger input event to notify the page of the change
  triggerInputEvent(element);
}

// Insert text into contentEditable elements
function insertIntoContentEditable(element, text) {
  const selection = window.getSelection();
  
  if (!selection.rangeCount) {
    console.warn("No selection range found");
    return;
  }
  
  const range = selection.getRangeAt(0);
  range.deleteContents();
  
  // Create a text node with the text to insert
  const textNode = document.createTextNode(text);
  range.insertNode(textNode);
  
  // Move the cursor to the end of the inserted text
  range.setStartAfter(textNode);
  range.setEndAfter(textNode);
  selection.removeAllRanges();
  selection.addRange(range);
  
  // Trigger input event to notify the page of the change
  triggerInputEvent(element);
}

// Trigger input event to notify the page of the change
function triggerInputEvent(element) {
  const inputEvent = new Event('input', { bubbles: true });
  element.dispatchEvent(inputEvent);
  
  // Also trigger change event for good measure
  const changeEvent = new Event('change', { bubbles: true });
  element.dispatchEvent(changeEvent);
} 