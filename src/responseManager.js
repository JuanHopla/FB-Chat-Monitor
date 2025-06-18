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

        // Different behavior based on mode - simplified to just auto and manual
        switch (mode) {
          case 'auto':
            await handleAutoMode(messages, context, callback);
            break;
          case 'manual':
            await handleManualMode(messages, context, callback);
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
        logger.debug('Processing auto mode response');

        // Add human-like delay before responding
        const responseDelay = getRandomResponseDelay();
        await delay(responseDelay);

        // Start typing indicator
        await startTypingIndicator(context.chatId);

        // Generate response with OpenAI
        let responseText;
        try {
          responseText = await openAIManager.generateResponse(context);
          logger.debug(`AI response generated: "${responseText.substring(0, 30)}..."`);
        } catch {
          responseText = getDefaultResponse(messages.at(-1)?.content || '');
        }

        // Calculate typing time
        const typingTime = calculateTypingTime(responseText);
        logger.debug(`Simulating typing for ${Math.round(typingTime/1000)} seconds`);
        await delay(typingTime);

        // Stop typing indicator
        await stopTypingIndicator();

        // Call chatManager to insert, send, and mark as read
        await window.chatManager.handleResponse(context);

        logger.log('Auto response processing completed');

        // Save to history
        const history = getConversationHistory();
        history.unshift({
          timestamp: new Date().toISOString(),
          mode: 'auto',
          context: {
            chatId: context.chatId,
            role: context.role,
            productDetails: context.productDetails ? {
              id: context.productDetails.id,
              title: context.productDetails.title
            } : null,
            lastMessage: messages[messages.length - 1]?.content || null
          },
          response: responseText,
          sent: true
        });
        storageUtils.set('RESPONSE_LOGS', history);

        if (callback) callback(responseText);

        return responseText;
            } catch (err) {
        logger.error(`Auto mode error: ${err.message}`);
        await stopTypingIndicator();
        if (callback) callback(null);
        throw err;
            }
          }

          /**
           * Delegate to ChatManager.manual mode
           */
          async function handleManualMode(messages, context, callback) {
            try {
        logger.debug('Processing manual mode response');

        // Start typing indicator to show we're thinking
        await startTypingIndicator(context.chatId);

        // Generate response with OpenAI
        let responseText;
        try {
          responseText = await openAIManager.generateResponse(context);
          logger.debug(`AI response generated in manual mode: "${responseText.substring(0, 30)}..."`);
        } catch {
          responseText = getDefaultResponse(messages.at(-1)?.content || '');
        }

        // Stop typing indicator
        await stopTypingIndicator();

        // Only insert, do not send
        await window.chatManager.handleResponse(context);

        logger.log('Manual response processed and inserted');

        // Save to history
        const history = getConversationHistory();
        history.unshift({
          timestamp: new Date().toISOString(),
          mode: 'manual',
          context: {
            chatId: context.chatId,
            role: context.role,
            productDetails: context.productDetails ? {
              id: context.productDetails.id,
              title: context.productDetails.title
            } : null,
            lastMessage: messages[messages.length - 1]?.content || null
          },
          response: responseText,
          sent: false
        });
        storageUtils.set('RESPONSE_LOGS', history);

        if (callback) callback(responseText);

        return responseText;
      } catch (err) {
        logger.error(`Manual mode error: ${err.message}`);
        await stopTypingIndicator();
        if (callback) callback(null);
        throw err;
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
      getConversationHistory,
      clearConversationHistory,
      exportConversationHistory
    };

    window.responseManager = responseManager;

    /**
   * Automatic and manual response handler
   */
  class ResponseManager {
    constructor() {
    this.isAutomodeEnabled = false;
    this.lastChatId = null;
    this.lastResponseTime = 0;
    this.cooldownPeriod = 30000; // 30 seconds cooldown between responses
    this.processingChat = false;
    
    // Update to use operationMode instead of mode/isAutomodeEnabled
    this.initialize();
    }

    initialize() {
    // Use operationMode instead of mode
    // This maintains compatibility with existing modes and properties
    this.isAutomodeEnabled = window.CONFIG?.operationMode === 'auto';
    logger.debug(`ResponseManager initialized with automode: ${this.isAutomodeEnabled} (operationMode: ${window.CONFIG?.operationMode})`);
    
    // Subscribe to configuration changes
    document.addEventListener('configUpdated', (event) => {
      this.isAutomodeEnabled = window.CONFIG?.operationMode === 'auto';
      logger.debug(`ResponseManager detected mode change: Auto=${this.isAutomodeEnabled} (operationMode: ${window.CONFIG?.operationMode})`);
    });
    }

    /**
     * Activates or deactivates automatic mode
     * @param {boolean} enabled - Whether it should be activated or not
     */
    setAutoMode(enabled) {
    this.isAutomodeEnabled = enabled;
    logger.log(`Automatic mode ${enabled ? 'activated' : 'deactivated'}`);
    
    // If it is being activated, verify that openAI is available
    if (enabled) {
      this.verifyOpenAIAvailability();
    }
    }

    /**
     * Verifies that openAI is available for automatic responses
     * @returns {boolean} Whether it is available or not
     */
    verifyOpenAIAvailability() {
    if (!window.openaiManager) {
      logger.error('OpenAI Manager is not available. Automatic mode will not work.');
      showSimpleAlert('OpenAI Manager is not available. Automatic mode will not work.', 'error');
      return false;
    }

    // Verify if it is ready to use using isReady() or the presence of apiKey as fallback
    const isReady = typeof window.openaiManager.isReady === 'function' ? 
      window.openaiManager.isReady() : !!window.openaiManager.apiKey;
    
    if (!isReady) {
      logger.error('OpenAI Manager does not have an API key configured. Automatic mode will not work correctly.');
      showSimpleAlert('OpenAI does not have an API key configured. Configure it in the options.', 'error');
      return false;
    }
    
    // Correct inconsistent state if necessary
    if (isReady && !window.openaiManager.isInitialized) {
      window.openaiManager.isInitialized = true;
      logger.debug('isInitialized=true has been corrected since the API key is present');
    }
    
    logger.log('OpenAI Manager is ready for automatic responses.');
    return true;
    }

    /**
     * Processes a chat to generate an automatic response if necessary
     * @param {string} chatId - ID of the chat to process
     * @param {Object} chatData - Data extracted from the chat
     */
    async processAutoResponse(chatId, chatData) {
    // Avoid processing the same chat multiple times or if we are already processing one
    if (this.processingChat || chatId === this.lastChatId) {
      logger.debug(`Skipping chat ${chatId} - already processed or in process`);
      return false;
    }

    try {
      this.processingChat = true;
      logger.debug(`Processing chat ${chatId} for automatic response`);

      // We no longer verify automatic mode here because that is done in ChatManager
      // and this method is only called if automatic mode is active

      // Verify if there are unresponded messages
      if (!this.checkForUnrespondedMessages(chatData.messages)) {
      logger.debug(`No unresponded messages in chat ${chatId}`);
      return false;
      }

      // Generate response
      let response;
      if (typeof this.handleAutoMode === 'function') {
      logger.debug('Using handleAutoMode to generate automatic response');
      response = await this.handleAutoMode(chatData.messages, chatData);
      } else {
      logger.debug('Generating response with OpenAI Manager directly');
      response = await window.openaiManager.generateResponse(chatData);
      }
      
      if (!response || (!response.text && typeof response !== 'string')) {
      throw new Error('A valid response was not received');
      }

      const responseText = response.text || response;
      
      // Insert into input field for automatic sending
      if (window.chatManager && typeof window.chatManager.insertResponseInInputField === 'function') {
      window.chatManager.insertResponseInInputField(responseText);
      } else {
      logger.debug('chatManager.insertResponseInInputField not available, using alternative method');
      const inputField = document.querySelector(CONFIG.selectors.activeChat.messageInput);
      if (inputField) {
        domUtils.insertTextIntoField(inputField, responseText);
      } else {
        throw new Error('Could not find the input field to insert the response');
      }
      }
      
      // Wait a moment and send
      await this.simulateTypingAndSend();
      
      this.lastChatId = chatId;
      this.lastResponseTime = Date.now();
      
      logger.log(`Automatic response sent successfully to chat ${chatId}`);
      return true;
    } catch (error) {
      logger.error(`Error in processAutoResponse for chat ${chatId}: ${error.message}`, { chatId }, error);
      return false;
    } finally {
      this.processingChat = false;
    }
    }

    /**
     * Verifies if there are unresponded messages in the conversation
     * @param {Array} messages - Messages from the conversation
     * @returns {boolean} If there are unresponded messages
     */
    checkForUnrespondedMessages(messages) {
    if (!messages || messages.length === 0) return false;
    
    // Get last N messages (5-10 is a good number)
    const recentMessages = messages.slice(-10);
    
    // Count consecutive messages from the "other" at the end of the conversation
    let consecutiveOtherMessages = 0;
    
    for (let i = recentMessages.length - 1; i >= 0; i--) {
      const msg = recentMessages[i];
      
      if (!msg.sentByUs) {
      consecutiveOtherMessages++;
      } else {
      break; // We found our message, end counting
      }
    }
    
    // If there is at least one consecutive message from the other user, there is something to respond to
    return consecutiveOtherMessages > 0;
    }

    /**
     * Simulates human typing and sends the message
     * @returns {Promise<void>}
     */
    async simulateTypingAndSend() {
    try {
      // Find send button
      const sendButton = document.querySelector('div[aria-label="Press Enter to send"] button, button[data-testid="send-button"]');
      
      if (!sendButton) {
      logger.warn('Send button not found');
      return;
      }
      
      // Simulate a delay to allow time to review/cancel
      const delayTime = window.CONFIG?.humanSimulation?.autoSendDelay || 2000;
      logger.debug(`Sending automatic message in ${delayTime/1000} seconds...`);
      
      await new Promise(resolve => setTimeout(resolve, delayTime));
      
      // Click on the send button
      sendButton.click();
      
      logger.log('Automatic message sent');
    } catch (error) {
      logger.error(`Error sending automatic message: ${error.message}`, {}, error);
    }
    }
  }

  // Create global instance
  window.responseManager = new ResponseManager();