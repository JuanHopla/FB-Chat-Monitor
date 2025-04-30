/**
 * Module to handle message responses with human-like behavior
 */

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
function calculateTypingTime(message) {
  const baseTime = message.length * CONFIG.humanSimulation.baseTypingSpeed;
  const variation = Math.random() * CONFIG.humanSimulation.typingVariation * message.length;
  return Math.max(CONFIG.humanSimulation.minResponseDelay, baseTime + variation);
}

/**
 * Get a random delay for human-like responses
 * @returns {number} Delay in milliseconds
 */
function getRandomResponseDelay() {
  return Math.floor(
    Math.random() *
    (CONFIG.humanSimulation.maxResponseDelay - CONFIG.humanSimulation.minResponseDelay) +
    CONFIG.humanSimulation.minResponseDelay
  );
}

/**
 * Detect language from text to provide appropriate fallback
 * @param {string} text - Text to analyze
 * @returns {string} Language code (en, es, etc.)
 */
function detectLanguage(text) {
  // Spanish detection
  if (/[áéíóúñ¿¡]/i.test(text) ||
      /\b(hola|gracias|buenos días|buenas tardes|disponible)\b/i.test(text)) {
    return 'es';
  }

  // Portuguese detection
  if (/[ãõçâêôáéíóú]/i.test(text) ||
      /\b(obrigado|bom dia|boa tarde|disponível)\b/i.test(text)) {
    return 'pt';
  }

  // French detection
  if (/[àââçéèêëîïôœùûüÿ]/i.test(text) ||
      /\b(bonjour|merci|bonne journée|disponible)\b/i.test(text)) {
    return 'fr';
  }

  // Default to English
  return 'en';
}

/**
 * Get default response based on detected language
 * @param {string} lastMessage - Last message for language detection
 * @returns {string} Appropriate fallback message
 */
function getDefaultResponse(lastMessage) {
  const lang = detectLanguage(typeof lastMessage === 'string' ? lastMessage : lastMessage?.text || '');

  const responses = {
    en: "Hello! Thank you for your message. I'll get back to you as soon as possible.",
    es: "¡Hola! Gracias por tu mensaje. Te responderé lo antes posible.",
    pt: "Olá! Obrigado pela sua mensagem. Responderei o mais rápido possível.",
    fr: "Bonjour! Merci pour votre message. Je vous répondrai dès que possible."
  };

  return responses[lang] || responses.en;
}

// ------ Typing Indicator Functions ------

/**
 * Start the typing indicator simulation
 * @param {string} chatId - ID of the current chat
 * @returns {Promise<boolean>} Success status
 */
async function startTypingIndicator(chatId = null) {
  try {
    // Find input field to activate typing indicator
    const inputField = document.querySelector(CONFIG.selectors.activeChat.messageInput);
    if (!inputField) {
      logger.debug('Input field not found for typing indicator');
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

    logger.debug('Typing indicator activated');
    return true;
  } catch (error) {
    logger.debug(`Error activating typing indicator: ${error.message}`);
    return false;
  }
}

/**
 * Stop the typing indicator simulation
 * @returns {Promise<boolean>} Success status
 */
async function stopTypingIndicator() {
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

    logger.debug('Typing indicator deactivated');
    return true;
  } catch (error) {
    logger.debug(`Error deactivating typing indicator: ${error.message}`);
    return false;
  }
}

/**
 * Send a message by simulating Enter key press
 * @param {HTMLElement} inputField - The input field element
 * @returns {Promise<boolean>} Success status
 */
async function sendViaEnter(inputField) {
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
    logger.debug(`Error sending via Enter: ${error.message}`);
    return false;
  }
}

// ------ Main Response Handler Functions ------

/**
 * Generate and insert a message with human-like typing behavior
 * @param {Array} messages
 * @param {Object} context
 * @param {string} mode
 * @param {Function} callback
 */
async function generateAndHandleResponse(messages, context, mode, callback) {
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
      case 'training':
        await handleTrainingMode(messages, context, callback);
        break;
      default:
        logger.debug(`Unknown operation mode: ${mode}`);
        if (typeof callback === 'function') {
          callback({ success: false, error: 'Unknown operation mode' });
        }
    }
  } catch (error) {
    logger.debug(`Error handling response: ${error.message}`);
    await stopTypingIndicator();

    if (typeof callback === 'function') {
      callback({ success: false, error: error.message });
    }
  }
}

// ─── add these free functions ─────────────────────────────────────────────────

/**
 * Delegate to ChatManager.auto mode
 */
async function handleAutoMode(messages, context, callback) {
  try {
    await window.chatManager.handleAutoMode(context);
    if (typeof callback === 'function') callback({ success: true });
  } catch (err) {
    if (typeof callback === 'function') callback({ success: false, error: err.message });
  }
}

/**
 * Delegate to ChatManager.manual mode
 */
async function handleManualMode(messages, context, callback) {
  try {
    await window.chatManager.handleManualMode(context);
    if (typeof callback === 'function') callback({ success: true });
  } catch (err) {
    if (typeof callback === 'function') callback({ success: false, error: err.message });
  }
}

/**
 * Delegate to ChatManager.generate mode
 */
async function handleGenerateMode(messages, context, callback) {
  try {
    await window.chatManager.handleGenerateMode(context);
    if (typeof callback === 'function') callback({ success: true });
  } catch (err) {
    if (typeof callback === 'function') callback({ success: false, error: err.message });
  }
}

/**
 * Delegate to ChatManager.training mode
 */
async function handleTrainingMode(messages, context, callback) {
  try {
    await window.chatManager.handleTrainingMode(context);
    if (typeof callback === 'function') callback({ success: true });
  } catch (err) {
    if (typeof callback === 'function') callback({ success: false, error: err.message });
  }
}

// ─── Conversation history utility functions ──────────────────────────────────────

function getConversationHistory() {
  // returns stored conversation logs or empty array
  return window.storageUtils.get('RESPONSE_LOGS', []);
}

function clearConversationHistory() {
  // removes all stored conversation logs
  window.storageUtils.remove('RESPONSE_LOGS');
}

function exportConversationHistory() {
  // export stored history as JSON file
  const history = getConversationHistory();
  const payload = {
    timestamp: new Date().toISOString(),
    history
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `fb-chat-monitor-history-${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ─── export ───────────────────────────────────────────────────────────────────

const responseManager = {
  typingState,
  calculateTypingTime,
  getRandomResponseDelay,
  detectLanguage,
  getDefaultResponse,
  startTypingIndicator,
  stopTypingIndicator,
  sendViaEnter,
  generateAndHandleResponse,
  handleAutoMode,
  handleManualMode,
  handleGenerateMode,
  handleTrainingMode,
  getConversationHistory,
  clearConversationHistory,
  exportConversationHistory
};

window.responseManager = responseManager;
