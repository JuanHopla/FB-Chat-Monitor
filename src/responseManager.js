/**
 * Module to handle message responses with human-like behavior
 * @module responseManager
 */
import { CONFIG } from './config.js';
import { delay, logDebug, insertTextDirectly, showSimpleAlert } from './utils.js';
import { generateAIResponse, getDefaultResponse } from './aiService.js';

/**
 * State to track the typing simulation
 */
const typingState = {
  isTyping: false,
  intervalId: null,
  chatId: null
};

/**
 * Calculate typing time based on message length and human simulation settings
 * @param {string} message - The message text
 * @returns {number} Milliseconds for typing simulation
 */
export function calculateTypingTime(message) {
  const baseTime = message.length * CONFIG.humanSimulation.baseTypingSpeed;
  const variation = Math.random() * CONFIG.humanSimulation.typingVariation * message.length;
  return Math.max(CONFIG.humanSimulation.minResponseDelay, baseTime + variation);
}

/**
 * Get a random delay for human-like responses
 * @returns {number} Delay in milliseconds
 */
export function getRandomResponseDelay() {
  return Math.floor(
    Math.random() * 
    (CONFIG.humanSimulation.maxResponseDelay - CONFIG.humanSimulation.minResponseDelay) + 
    CONFIG.humanSimulation.minResponseDelay
  );
}

/**
 * Start the typing indicator simulation
 * @param {string} chatId - ID of the current chat
 * @returns {Promise<boolean>} Success status
 */
export async function startTypingIndicator(chatId = null) {
  try {
    // Find input field to activate typing indicator
    const inputField = document.querySelector(CONFIG.selectors.activeChat.messageInput);
    if (!inputField) {
      logDebug('Input field not found for typing indicator');
      return false;
    }
    
    // Focus the field to start the typing session
    inputField.focus();
    
    // Send keyboard events to activate the "typing..." indicator
    typingState.isTyping = true;
    typingState.chatId = chatId;
    
    // Maintain a "typing..." indicator by simulating periodic activity
    typingState.intervalId = setInterval(() => {
      if (inputField && typingState.isTyping) {
        // Simulate key presses to keep the indicator active
        const keyEvent = new KeyboardEvent('keypress', {
          bubbles: true,
          cancelable: true,
          key: ' ',
          code: 'Space'
        });
        inputField.dispatchEvent(keyEvent);
        
        // Alternate between adding and removing a space to keep the indicator
        if (inputField.innerText.endsWith(' ')) {
          inputField.innerText = inputField.innerText.slice(0, -1);
        } else {
          inputField.innerText += ' ';
        }
        
        // Trigger input event for FB to detect activity
        inputField.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, 2000);
    
    logDebug('Typing indicator activated');
    return true;
  } catch (error) {
    logDebug(`Error activating typing indicator: ${error.message}`);
    return false;
  }
}

/**
 * Stop the typing indicator simulation
 * @returns {Promise<boolean>} Success status
 */
export async function stopTypingIndicator() {
  try {
    // Stop the typing simulation interval
    if (typingState.intervalId) {
      clearInterval(typingState.intervalId);
      typingState.intervalId = null;
    }
    
    typingState.isTyping = false;
    
    // Clear text field if necessary
    try {
      const inputField = document.querySelector(CONFIG.selectors.activeChat.messageInput);
      if (inputField && inputField.innerText) {
        inputField.innerText = '';
        inputField.dispatchEvent(new Event('input', { bubbles: true }));
      }
      // Remove focus to completely stop the indicator
      inputField.blur();
    } catch (e) {
      // If we don't find the field, ignore the error
    }
    
    logDebug('Typing indicator deactivated');
    return true;
  } catch (error) {
    logDebug(`Error deactivating typing indicator: ${error.message}`);
    return false;
  }
}

/**
 * Send a message by simulating Enter key press
 * @param {HTMLElement} inputField - The input field element
 * @returns {Promise<boolean>} Success status
 */
export async function sendViaEnter(inputField) {
  try {
    inputField.focus();
    
    // Simulate Enter key press events
    ['keydown','keypress','keyup'].forEach(type => {
      inputField.dispatchEvent(new KeyboardEvent(type, {
        key: 'Enter', 
        code: 'Enter', 
        bubbles: true
      }));
    });
    
    return true;
  } catch (error) {
    logDebug(`Error sending via Enter: ${error.message}`);
    return false;
  }
}

/**
 * Generate and insert a message with human-like typing behavior
 * @param {Array} messages - Previous messages
 * @param {Object} context - Context information
 * @param {string} mode - Operation mode ('auto', 'manual', 'generate')
 * @param {Function} callback - Callback after completion
 */
export async function generateAndHandleResponse(messages, context, mode, callback) {
  try {
    // Don't respond if latest message is ours
    if (messages.length > 0 && messages[messages.length-1].sentByUs) {
      return;
    }

    // Different behavior based on mode
    switch (mode) {
      case 'auto':
        await handleAutoMode(messages, context, callback);
        break;
      case 'manual':
        await handleManualMode(messages, context, callback);
        break;
      case 'generate':
        await handleGenerateMode(messages, context, callback);
        break;
    }
  } catch (error) {
    logDebug(`Error handling response: ${error.message}`);
    await stopTypingIndicator();
    
    if (typeof callback === 'function') {
      callback({ success: false, error: error.message });
    }
  }
}

/**
 * Handle automated response generation and sending
 * @param {Array} messages - Conversation history
 * @param {Object} context - Conversation context
 * @param {Function} callback - Callback function
 */
async function handleAutoMode(messages, context, callback) {
  try {
    await startTypingIndicator();
    let responseText;
    
    try {
      responseText = await generateAIResponse(messages, context);
    } catch (error) {
      responseText = getDefaultResponse(messages[messages.length - 1].content);
    }
    
    // Simulate realistic typing time
    const typingTime = calculateTypingTime(responseText);
    await delay(typingTime);
    await stopTypingIndicator();

    // Insert text and send
    const inputField = document.querySelector(CONFIG.selectors.activeChat.messageInput);
    if (!inputField) throw new Error('Message input not found');
    
    insertTextDirectly(inputField, responseText);
    await delay(200);
    await sendViaEnter(inputField);
    
    if (typeof callback === 'function') {
      callback({ 
        success: true, 
        message: responseText, 
        mode: 'auto' 
      });
    }
  } catch (error) {
    logDebug(`Error in auto mode: ${error.message}`);
    await stopTypingIndicator();
    if (typeof callback === 'function') {
      callback({ success: false, error: error.message });
    }
  }
}

/**
 * Handle manual response generation
 * @param {Array} messages - Conversation history
 * @param {Object} context - Conversation context
 * @param {Function} callback - Callback function
 */
async function handleManualMode(messages, context, callback) {
  let manualTimeoutId = null;
  let alertElement = null;
  
  try {
    await startTypingIndicator();
    let responseText;
    
    try {
      responseText = await generateAIResponse(messages, context);
    } catch (error) {
      responseText = getDefaultResponse(messages[messages.length - 1].content);
    }
    
    await stopTypingIndicator();

    // Insert text into input field but don't send
    const inputField = document.querySelector(CONFIG.selectors.activeChat.messageInput);
    if (!inputField) throw new Error('Message input not found');
    
    // Highlight input field
    inputField.style.border = '2px solid #4267B2';
    inputField.style.boxShadow = '0 0 8px rgba(66,103,178,0.6)';
    
    // Insert the text
    inputField.click(); 
    inputField.focus(); 
    await delay(300);
    insertTextDirectly(inputField, responseText);
    
    // Show alert
    alertElement = showSimpleAlert(
      'Response generated and ready to send. Press Send or edit.', 
      'info'
    );
    
    // Find send button to attach listener
    const sendButton = document.querySelector(CONFIG.selectors.activeChat.sendButton);
    
    // Set up handlers for timeout and send button
    const onSendClick = () => {
      clearTimeout(manualTimeoutId);
      inputField.style.border = '';
      inputField.style.boxShadow = '';
      const finalText = inputField.innerText || inputField.textContent || responseText;
      
      if (typeof callback === 'function') {
        callback({
          success: true,
          message: finalText,
          mode: 'manual'
        });
      }
      
      alertElement?.remove();
      sendButton?.removeEventListener('click', onSendClick);
    };
    
    const onInputClick = () => {
      clearTimeout(manualTimeoutId);
      inputField.style.border = '';
      inputField.style.boxShadow = '';
      alertElement?.remove();
      inputField.removeEventListener('click', onInputClick);
    };
    
    // Add event listeners
    if (sendButton) {
      sendButton.addEventListener('click', onSendClick);
      inputField.addEventListener('click', onInputClick);
    }
    
    // Start manual mode timeout
    manualTimeoutId = setTimeout(() => {
      alertElement?.remove();
      inputField.style.border = '';
      inputField.style.boxShadow = '';
      
      if (typeof callback === 'function') {
        callback({
          success: false,
          error: 'Manual mode timeout reached',
          mode: 'manual'
        });
      }
      
      sendButton?.removeEventListener('click', onSendClick);
      inputField.removeEventListener('click', onInputClick);
    }, CONFIG.manualModeTimeout);
    
  } catch (error) {
    logDebug(`Error in manual mode: ${error.message}`);
    await stopTypingIndicator();
    alertElement?.remove();
    
    if (typeof callback === 'function') {
      callback({ success: false, error: error.message });
    }
  }
}

/**
 * Handle generate-only mode (no sending)
 * @param {Array} messages - Conversation history
 * @param {Object} context - Conversation context
 * @param {Function} callback - Callback function
 */
async function handleGenerateMode(messages, context, callback) {
  try {
    // Generate response with AI
    let responseText;
    try {
      responseText = await generateAIResponse(messages, context);
    } catch (error) {
      responseText = getDefaultResponse(messages[messages.length - 1].content);
    }

    // Insert directly into the field
    const inputField = document.querySelector(CONFIG.selectors.activeChat.messageInput);
    if (!inputField) throw new Error('Message input not found');
    
    inputField.click(); 
    inputField.focus();
    insertTextDirectly(inputField, responseText);
    
    if (typeof callback === 'function') {
      callback({
        success: true,
        message: responseText,
        mode: 'generate'
      });
    }
  } catch (error) {
    logDebug(`Error in generate mode: ${error.message}`);
    
    if (typeof callback === 'function') {
      callback({ success: false, error: error.message });
    }
  }
}
