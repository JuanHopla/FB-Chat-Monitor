/**
 * ChatManager - Main system for managing Facebook Messenger Marketplace chats
 * 
 * Manages detection, monitoring and automatic response of conversations.
 * Includes capabilities to extract product data, chat histories,
 * and simulate human behavior in responses.
 */
class ChatManager {
  /**
   * Initializes the chat manager and configures observers
   */
  constructor() {
    //===================================================================
    // STATE VARIABLES AND INITIALIZATION
    //===================================================================

    this.pendingChats = []; // Queue of unread chats
    this.currentChatId = null; // Currently open chat ID
    this.chatHistory = new Map(); // Conversation history by ID
    this.isProcessing = false; // Indicates if we are processing messages
    this.conversationLogs = JSON.parse(localStorage.getItem('FB_CHAT_MONITOR_LOGS') || '[]');
    this.lastProcessedMessageCount = 0; // Counter of processed messages
    this.manualChatChangeDetected = false; // Indicator of manual changes
    this.activeChatObserver = null; // Observer for active chat content
    this.lastScrollHeight = 0; // To detect new messages by scrolling
    this.isProcessingChat = false; // Anti-concurrency flag
    this.respondedChats = new Set(); // Avoids duplicate responses in auto mode
    this.isResponding = false; // New anti-reentrancy flag

    // State to simulate human typing
    this.typingState = {
      isTyping: false,
      intervalId: null,
      chatId: null
    };

    // Configure URL monitoring for manual chat changes
    this._setupUrlChangeDetection();

    // Inicializa el sistema de asociación de audio (si está disponible)
    if (window.audioTranscriber && typeof window.audioTranscriber.init === 'function') {
      window.audioTranscriber.init();
    }
  }

  //===================================================================
  // INITIALIZATION AND CONFIGURATION
  //===================================================================

  /**
   * Sets up detection of manual chat changes from URL changes
   * @private
   */
  _setupUrlChangeDetection() {
    // Store last URL to detect changes
    this._lastUrl = window.location.href;

    // Periodically check URL changes that indicate manual chat changes
    setInterval(() => {
      const currentUrl = window.location.href;

      if (this._lastUrl !== currentUrl) {
        this._lastUrl = currentUrl;
        this._handleUrlChange(currentUrl);
      }
    }, 1000); // Check every second
  }

  /**
   * Handles URL changes to detect manually opened chats
   * @private
   * @param {string} url - The new URL
   */
  _handleUrlChange(url) {
    try {
      // Extract chat ID from messenger URL in marketplace
      // Format: https://www.messenger.com/marketplace/t/1234567890/
      const marketplaceMatch = url.match(/\/marketplace\/t\/(\d+)/);

      if (marketplaceMatch && marketplaceMatch[1]) {
        const chatId = marketplaceMatch[1];

        // Update only if different from current
        if (chatId !== this.currentChatId) {
          logger.debug(`Manual chat change detected to ID: ${chatId}`);
          this.currentChatId = chatId;

          logger.debug('Chat ID updated. The chat will be processed when Generate Response is clicked.');
        }
      }
    } catch (error) {
      logger.error('Error handling URL change', {}, error);
    }
  }

  //===================================================================
  // SCANNING AND LISTING CHATS
  //===================================================================

  /**
   * Scans the inbox for unread chats
   * @returns {Promise<number>} Number of unread chats found
   */
  async scanForUnreadChats() {
    logger.log('Scanning for unread chats...');

    try {
      // Get chat list container
      const chatContainer = domUtils.findElement(CONFIG.selectors.chatList.container);
      if (!chatContainer) {
        logger.error('Chat list container not found');
        return 0;
      }

      // Get all chat elements
      const chatItems = domUtils.findAllElements(CONFIG.selectors.chatList.chatItem, chatContainer);
      logger.log(`Found ${chatItems.length} chat elements`);

      // Clear the pending chat queue
      this.pendingChats = [];

      // Process each element to identify unread chats
      for (const chatItem of chatItems) {
        // Check if it's actually an unread chat with strict validation
        if (this.isUnreadChat(chatItem)) {
          // Extract relevant information
          const chatId = this.extractChatId(chatItem);
          const userName = this.extractChatUsername(chatItem);
          const messageTime = this.extractMessageTime(chatItem);

          // Validation: Use only chats with valid numeric IDs
          if (chatId && /^\d+$/.test(chatId)) {
            const minutesAgo = this.convertTimeToMinutes(messageTime);

            // Store reference to element for direct click
            this.pendingChats.push({
              chatId,
              userName,
              messageTime: minutesAgo,
              formattedTime: messageTime,
              element: chatItem
            });

            logger.debug(`Chat added to queue: ${userName} (${chatId}), time: ${messageTime}`);
          } else {
            logger.debug(`Chat ignored with non-numeric ID: ${chatId}`);
          }
        }
      }

      // Sort queue by time (oldest first)
      this.pendingChats.sort((a, b) => b.messageTime - a.messageTime);

      logger.log(`Total valid unread chats: ${this.pendingChats.length}`);

      // Show notification with results
      if (this.pendingChats.length > 0) {
        logger.notify(`${this.pendingChats.length} unread chats found`, 'success');
      } else {
        logger.notify('No unread chats found', 'info');
      }

      return this.pendingChats.length;
    } catch (error) {
      logger.error(`Error scanning chats: ${error.message}`);
      return 0;
    }
  }

  /**
   * Determines if a chat is unread using the optimized selector
   * @param {HTMLElement} chatElement - The chat element to evaluate
   * @returns {boolean} True if the chat is unread
   */
  isUnreadChat(chatElement) {
    try {
      // Use optimized selector to detect unread messages
      const unreadIndicator = chatElement.querySelector(CONFIG.selectors.chatList.unreadIndicator);
      if (unreadIndicator) {
        const text = unreadIndicator.textContent || "";
        // Exclude general Marketplace notifications
        if (!text.includes('Marketplace ·')) {
          logger.debug(`Unread chat detected with specific indicator`);
          return true;
        }
      }

      // If there's no specific indicator, check if name or message has unread format
      const userNameElements = Array.from(chatElement.querySelectorAll(CONFIG.selectors.chatList.chatUserName.selector.join(', ')));
      for (const element of userNameElements) {
        const style = window.getComputedStyle(element);
        if (style && parseInt(style.fontWeight) >= 600) {
          logger.debug(`Unread chat detected by bold font style`);
          return true;
        }
      }

      // If we get here, consider the chat as read
      return false;
    } catch (error) {
      logger.error(`Error evaluating unread chat: ${error.message}`);
      return false;
    }
  }

  /**
   * Extracts the chat ID from the element
   * @param {HTMLElement} chatElement - Chat DOM element
   * @returns {string} Extracted or generated chat ID
   */
  extractChatId(chatElement) {
    // PRIORITY 1: Get direct numeric ID from href (most reliable)
    const href = chatElement.getAttribute('href');
    if (href && href.includes('/marketplace/t/')) {
      const match = href.match(/\/marketplace\/t\/(\d+)\//);
      if (match && match[1]) {
        logger.debug(`ID extracted from href: ${match[1]}`);
        return match[1];
      }
    }

    // PRIORITY 2: Look for secondary links that may contain the ID
    const childLinks = chatElement.querySelectorAll('a[href*="/marketplace/t/"]');
    for (const link of childLinks) {
      const childHref = link.getAttribute('href');
      const match = childHref.match(/\/marketplace\/t\/(\d+)\//);
      if (match && match[1]) {
        logger.debug(`ID extracted from secondary link: ${match[1]}`);
        return match[1];
      }
    }

    // PRIORITY 3: testid or element id data
    const testId = chatElement.getAttribute('data-testid');
    if (testId && /^\d+$/.test(testId)) {
      logger.debug(`ID extracted from data-testid: ${testId}`);
      return testId;
    }

    // FALLBACK: Generate ID based on name (less reliable)
    const userName = this.extractChatUsername(chatElement);
    const fallbackId = `chat_${userName.replace(/\s+/g, '_').toLowerCase()}`;
    logger.debug(`ID generated as fallback: ${fallbackId}`);
    return fallbackId;
  }

  /**
   * Extracts the username from the chat using selectors with filters
   * @param {HTMLElement} chatElement - Chat DOM element
   * @returns {string} Extracted username or "Unknown User"
   */
  extractChatUsername(chatElement) {
    try {
      // If we have an object with selector and filter, use both
      if (Array.isArray(CONFIG.selectors.chatList.chatUserName.selector)) {
        // Use selector and apply filter
        const selectors = CONFIG.selectors.chatList.chatUserName.selector.join(', ');
        const nameElements = Array.from(chatElement.querySelectorAll(selectors));

        // Apply filter if it exists
        const filteredElements = CONFIG.selectors.chatList.chatUserName.filter ?
          CONFIG.selectors.chatList.chatUserName.filter(nameElements) :
          nameElements;

        // If we found filtered elements, use the first one
        if (filteredElements && filteredElements.length > 0) {
          const fullText = filteredElements[0].innerText;
          // Extract only the name part (before the "·")
          const namePart = fullText.split("·")[0].trim();
          return namePart || 'Unknown User';
        }
      } else {
        // Fallback to previous code if the new structure isn't present
        const selectors = Array.isArray(CONFIG.selectors.chatList.chatUserName) ?
          CONFIG.selectors.chatList.chatUserName.join(', ') :
          CONFIG.selectors.chatList.chatUserName;

        const nameElements = Array.from(chatElement.querySelectorAll(selectors));

        // Filter to find elements with product separator
        const productNameElements = nameElements.filter(elem => {
          const text = elem.innerText || "";
          return text.includes("·") && !text.includes(":");
        });

        // If we find a product format, use it
        if (productNameElements.length > 0) {
          const fullText = productNameElements[0].innerText;
          // Extract only the name part (before the "·")
          const namePart = fullText.split("·")[0].trim();
          return namePart || 'Unknown User';
        }
      }

      // If we don't find a specific format, use any name element
      const nameElement = Array.from(chatElement.querySelectorAll(CONFIG.selectors.chatList.chatUserName.selector.join(', ')))[0];
      return nameElement?.innerText?.trim() || 'Unknown User';
    } catch (error) {
      logger.error(`Error extracting username: ${error.message}`);
      return 'Unknown User';
    }
  }

  /**
   * Extracts the time of the last message
   * @param {HTMLElement} chatElement - Chat DOM element
   * @returns {string} Text with the message time (e.g., "2h", "3m")
   */
  extractMessageTime(chatElement) {
    try {
      // Use selector to find the time element
      const timeElement = domUtils.findElement(CONFIG.selectors.chatList.timestamp, chatElement);
      return timeElement?.innerText || '0m';
    } catch (error) {
      logger.error(`Error extracting message time: ${error.message}`);
      return '0m';
    }
  }

  /**
   * Converts time (3m, 2h, 1d, etc.) to minutes for sorting
   * @param {string} timeStr - Time string to convert
   * @returns {number} Time converted to minutes
   */
  convertTimeToMinutes(timeStr) {
    if (!timeStr) return 0;

    const match = timeStr.match(/(\d+)([mhdsw])/);
    if (!match) return 0;

    const value = parseInt(match[1]);
    const unit = match[2];

    switch (unit) {
      case 'm': return value; // minutes
      case 'h': return value * 60; // hours -> minutes
      case 'd': return value * 60 * 24; // days -> minutes
      case 'w': return value * 60 * 24 * 7; // weeks -> minutes
      default: return value;
    }
  }

  //===================================================================
  // CHAT OPENING AND NAVIGATION
  //===================================================================

  /**
   * Opens the next pending chat from the queue
   * @returns {Promise<boolean>} True if a chat was successfully opened
   */
  async openNextPendingChat() {
    if (this.pendingChats.length === 0) {
      logger.log('No pending chats');
      return false;
    }

    // Ensure chats are sorted by priority
    this.pendingChats.sort((a, b) => b.messageTime - a.messageTime);

    const nextChat = this.pendingChats.shift();
    logger.log(`Opening chat with ${nextChat.userName} (${nextChat.chatId})`);

    try {
      // OPTION 1: Direct click on element if available
      if (nextChat.element && typeof nextChat.element.click === 'function') {
        logger.log('Using direct click method to open chat');

        // Scroll to element to ensure it's visible
        nextChat.element.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Notify user
        logger.notify(`Opening chat: ${nextChat.userName}`, 'info');

        // Wait a moment and click
        await new Promise(resolve => setTimeout(resolve, 1000));

        nextChat.element.click();

        this.currentChatId = nextChat.chatId;

        // Wait for chat to load
        await new Promise(resolve => setTimeout(resolve, 4000));

        // Explicitly check operation mode
        const isAutoMode = (window.CONFIG?.operationMode === 'auto');
        logger.debug(`Processing chat in ${isAutoMode ? 'AUTO' : 'MANUAL'} mode (operationMode: ${window.CONFIG?.operationMode})`);

        // Pass isAutoMode value for auto-response
        await this.processCurrentChat(isAutoMode);

        await this.markChatAsRead();

        return true;
      }
      // OPTION 2: Navigate directly by URL if we have a numeric ID
      else if (/^\d+$/.test(nextChat.chatId)) {
        logger.log('Using direct URL navigation to open chat');

        const url = `https://www.messenger.com/marketplace/t/${nextChat.chatId}/`;
        logger.notify(`Navigating to: ${nextChat.userName}`, 'info');

        // Change current location - this will reload the page
        window.location.href = url;
        await this.markChatAsRead();
        return true;
      }

      logger.error('Could not open chat - neither by click nor by URL');
      return false;
    } catch (error) {
      logger.error(`Error opening chat: ${error.message}`);
      return false;
    }
  }

  //===================================================================
  // CHAT DATA EXTRACTION AND ANALYSIS
  //===================================================================

  /**
   * Generates a response for the current chat (used by Generate Response button)
   * This method now uses only openaiManager and core modules
   * @returns {Promise<boolean>} True if the response was successfully generated
   */
  async generateResponseForCurrentChat() {
    if (!this.currentChatId) {
      logger.error('No active chat to generate response');
      showSimpleAlert('No active chat detected. Please select a chat first.', 'error');
      return false;
    }

    try {
      console.log('[ChatManager] Step 1: Extracting data from the current chat...');
      await this.extractCurrentChatData();

      const chatData = this.chatHistory.get(this.currentChatId);
      if (!chatData || !chatData.messages || chatData.messages.length === 0) {
        logger.error('No chat data or messages found');
        showSimpleAlert('No chat data or messages found.', 'error');
        return false;
      }

      const context = {
        chatId: this.currentChatId,
        role: chatData.isSeller ? 'seller' : 'buyer',
        messages: chatData.messages,
        productDetails: chatData.productDetails
      };

      console.log('[ChatManager] Step 2: Context built for response generation:', context);

      // Log before calling openaiManager
      console.log('[ChatManager] Step 3: Calling openaiManager.generateResponse(context)...');
      const response = await window.openaiManager.generateResponse(context);

      // Log after receiving the response
      console.log('[ChatManager] Step 4: Response received from assistant:', response);

      if (response && typeof response === 'string' && response.trim()) {
        this.insertResponseInInputField(response);
        logger.log('Response generated and inserted in input field');
        return true;
      } else {
        logger.warn('No response generated by OpenAI');
        showSimpleAlert('No response generated by OpenAI.', 'warning');
        return false;
      }
    } catch (error) {
      logger.error(`Error generating response: ${error.message}`);
      showSimpleAlert(`Error generating response: ${error.message}`, 'error');
      return false;
    }
  }

  /**
   * Extracts data from the current chat without generating a response.
   * Now separated from processCurrentChat to avoid automatic response generation.
   * @returns {Promise<Object>} Result of extraction with status and data.
   */
  async extractCurrentChatData() {
    if (!this.currentChatId) {
      logger.error('No active chat to extract data');
      return { success: false, error: 'No active chat' };
    }

    logger.log(`Extracting data from chat ${this.currentChatId}`);

    try {
      // Get chat container
      const chatContainer = await domUtils.waitForElement(CONFIG.selectors.activeChat.container);

      // Declare before assigning
      let productDetails = null;

      // Extract product ID and details using the new extractor
      const productId = productExtractor.extractProductIdFromCurrentChat();
      // New: get full product URL
      const productLink = this.extractProductLink(chatContainer);

      if (productId) {
        logger.log(`Product ID found: ${productId}`);
        logger.debug(`Product link found: ${productLink}`);
        // Pass productLink to extractor
        productDetails = await productExtractor.getProductDetails(productId, productLink);
        // INJECT: revert to fresh URLs from the DOM
        // productDetails.images = productExtractor.getProductImagesFromChat(chatContainer); // Comentado: getProductImagesFromChat no está disponible en productExtractor
        // logger.debug(`Product images extracted from DOM: ${productDetails.images.length} URLs`); // Comentar o ajustar si la línea anterior se elimina
      }

      // Get the messages container
      const messagesWrapper = await domUtils.waitForElement(CONFIG.selectors.activeChat.messageWrapper);
      const scrollContainer = domUtils.findElement(
        CONFIG.selectors.activeChat.scrollbar,
        messagesWrapper
      ) || messagesWrapper;

      // Scroll to load full history
      await domUtils.scrollToTop(scrollContainer);
      // Determine if we are seller or buyer
      const isSeller = this.determineIfSeller(chatContainer);
      logger.log(`Role in chat: ${isSeller ? 'seller' : 'buyer'}`);
      scrollContainer.scrollTop = scrollContainer.scrollHeight;

      // Get the full chat history with improved extraction
      // Pass messagesWrapper to extractChatHistory
      const messages = await this.extractChatHistory(messagesWrapper);
      logger.log(`Extracted ${messages.length} messages from chat`);

      // Store in history
      const chatData = {
        messages,
        productDetails,
        isSeller,
        lastUpdated: new Date()
      };
      this.chatHistory.set(this.currentChatId, chatData);

      // Return extracted data along with success status
      return { success: true, chatData };

    } catch (error) {
      logger.error(`Error extracting chat data: ${error.message}`);
      return { success: false, error };
    }
  }

  /**
   * Processes the current chat: Extracts data and optionally generates response.
   * @param {boolean} autoRespond - Whether to automatically generate response
   * @returns {Promise<boolean>} - True if processing was successful
   */
  async processCurrentChat(autoRespond = false) {
    // FIX: Explicitly check operation mode if not provided
    if (autoRespond === undefined || autoRespond === null) {
      autoRespond = window.CONFIG?.operationMode === 'auto';
      logger.debug(`Auto-respond not specified, using global setting: ${autoRespond ? 'AUTO' : 'MANUAL'}`);
    }

    // NEW PROTECTION: If we are in AUTO mode, preventively clear the input field
    // before any processing to avoid sending pre-existing text
    if (autoRespond) {
      try {
        logger.debug(`AUTO mode detected - Preventively clearing input field`);
        const inputField = document.querySelector(CONFIG.selectors.activeChat.messageInput);
        if (inputField) {
          const isContentEditable = inputField.getAttribute('contenteditable') === 'true';
          if (isContentEditable) {
            inputField.innerHTML = '';
            inputField.textContent = '';
          } else {
            inputField.value = '';
          }
          // Trigger input event to ensure Facebook detects the change
          const event = new Event('input', { bubbles: true });
          inputField.dispatchEvent(event);
        }
      } catch (e) {
        logger.error(`Error in preventive cleaning: ${e.message}`);
        // Continue despite error
      }
    }

      // If we already responded to this chat in auto mode, skip to avoid duplicates
      if (autoRespond && this.respondedChats.has(this.currentChatId)) {
        logger.debug(`Auto-response already sent for chat ${this.currentChatId}, skipping.`);
        return true;
      }

    // Anti-reentrancy
    if (autoRespond && this.isResponding) {
      logger.debug(`Already processing response for chat ${this.currentChatId}, skipping new call.`);
      return true;
    }
    this.isResponding = autoRespond;

    // Step 1: Extract data
    const extractionResult = await this.extractCurrentChatData();

    if (!extractionResult.success) {
      logger.error('Failed to extract chat data during processCurrentChat.');
      return false; // Indicate failure
    }

    // Step 2: Optionally generate response if autoRespond is true
    if (autoRespond) {
      logger.debug(`Automatic response enabled for chat ${this.currentChatId} (operationMode: ${window.CONFIG?.operationMode})`);
      const chatData = extractionResult.chatData;

      if (!chatData || !chatData.messages || chatData.messages.length === 0) {
        logger.warn('No messages found in extracted data, cannot auto-respond.');
        return true;
      }

      // Create context for response generation
      const context = {
        chatId: this.currentChatId,
        role: chatData.isSeller ? 'seller' : 'buyer',
        messages: chatData.messages,
        productDetails: chatData.productDetails
      };

      try {
        // FIX: Add more diagnostic logs
        logger.log(`Generating automatic response as ${context.role} for chat ${this.currentChatId}`);

        // Call handleResponse to generate and potentially send the response
        await this.handleResponse(context);
        this.respondedChats.add(this.currentChatId); // Mark as responded

        logger.log('Automatic response generated and sent successfully');
        return true;
      } catch (responseError) {
        logger.error(`Error during automatic response generation: ${responseError.message}`);
        return false;
      }
    } else {
      logger.debug(`Automatic response disabled for chat ${this.currentChatId}. Only data was extracted.`);
    }

    this.isResponding = false;
    return true; // Indicate successful processing (at least extraction)
  }

  /**
   * Extracts the product link
   * @param {HTMLElement} chatContainer - Active chat container
   * @returns {string|null} Product URL or null
   */
  extractProductLink(chatContainer) {
    const productLinkElement = domUtils.findElement(CONFIG.selectors.activeChat.productLink, chatContainer);
    return productLinkElement?.href || null;
  }

  //===================================================================
  // MESSAGE CONTENT DETECTION AND EXTRACTION
  //===================================================================

  /**
   * Gets audio transcription if available
   * @param {string} audioUrl - Audio URL or marker
   * @returns {string|null} Transcription or null if not available
   */
  getAudioTranscription(audioUrl) {
    // If there's no audio URL or transcription is disabled
    if (!audioUrl || !CONFIG.audioTranscription.enabled) return null;

    // If it's a marker (real URL not detected yet)
    if (audioUrl === "[Audio URL will be detected by Performance API]") {
      return null;
    }

    // Check if we have audioTranscriber available
    if (!window.audioTranscriber) {
      logger.debug(`Audio transcriber not available for URL: ${audioUrl}`);
      return null;
    }

    // Request transcription from audioTranscriber
    try {
      const transcription = window.audioTranscriber.getTranscription(audioUrl);
      if (transcription) {
        logger.debug(`Transcription found for audio: ${audioUrl.substring(0, 50)}...`);
        return transcription;
      }
    } catch (error) {
      logger.warn(`Error accessing audio transcription: ${error.message}`);
    }

    return null;
  }

  /**
   * Extracts the full chat history - PHASE 2: Improved timestamp validation and message structure
   * @param {HTMLElement} messagesWrapper - Message container
   * @returns {Promise<Array>} Array of extracted messages
   */
  async extractChatHistory(messagesWrapper) {
    if (this.isProcessingChat) {
      logger.warn('Chat history extraction already in progress. Skipping.');
      return [];
    }
    if (!messagesWrapper) {
      logger.error('messagesWrapper element not provided to extractChatHistory.');
      return [];
    }

    this.isProcessingChat = true;
    logger.debug('Starting chat history extraction (simplified)…');

    const messages = [];
    let messageElements = [];

    try {
      // 1) Get selectors from CONFIG or use fallback
      const selectors = window.CONFIG?.selectors?.activeChat || {
        messageWrapper: 'div.x4k7w5x > div > div > div, div[role="main"] > div > div > div:last-child > div',
        messageRow: 'div[role="row"]',
        senderAvatar: 'img.x1rg5ohu[alt]:not([alt="Open photo"])'
      };

      // 2) Retrieve message rows
      messageElements = domUtils.findAllElements(selectors.messageRow, messagesWrapper);
      logger.log(`Analyzing ${messageElements.length} messages in the current DOM`);

      if (messageElements.length === 0) {
        logger.warn('No message rows found with selector:', selectors.messageRow);
        return [];
      }

      // 3) Process each row
      messageElements.forEach((el, idx) => {
        // Extract and clean unique text
        const nodes = Array.from(el.querySelectorAll('span[dir="auto"], div[dir="auto"]'));
        const texts = [...new Set(
          nodes.map(n => n.textContent.trim())
            .filter(t => t && t.toLowerCase() !== 'enter')
        )];
        const text = texts.join(' ').trim();

        // Determine special types
        const isDiv = this.isDividerElement(el);
        const isSys = !isDiv && this.isSystemMessage(text);
        const isReply = !isDiv && !isSys && !!this.detectQuotedMessage(el);

        // Determine sender
        let sentByUs = false, type = 'UNKNOWN';
        if (isDiv) type = 'DIVIDER 📅';
        else if (isSys) type = 'SYSTEM 🤖';
        else if (isReply) {
          sentByUs = this.isMessageSentByUs(el);
          type = sentByUs ? 'OWN REPLY 📣✅' : 'EXTERNAL REPLY 📣❌';
        } else {
          sentByUs = this.isMessageSentByUs(el);
          type = sentByUs ? 'OWN ✅' : 'EXTERNAL ❌';
        }

        // SKIP if it is a divider or system message
        if (!isDiv && !isSys) {
          messages.push({
            id: `msg_${this.currentChatId}_${idx}`,
            sentByUs,
            content: { 
              text, 
              type, 
              media: {}
            }
          });
          logger.debug(`#${idx + 1}: ${type} – ${text.substring(0, 30)}${text.length > 30 ? '…' : ''}`);
        } else {
          logger.debug(`#${idx + 1}: Skipped ${isDiv ? 'DIVIDER' : 'SYSTEM'} message`);
        }
      });

      this.lastProcessedMessageCount = messages.length;
      logger.log(`Extraction completed: ${messages.length} messages found`);

    } catch (error) {
      logger.error('Error during chat history extraction:', {}, error);
    } finally {
      this.isProcessingChat = false;
    }

    return messages;
  }

  /**
   * PHASE 2: New function to validate timestamps
   * @param {string} text - Text to validate as timestamp
   * @returns {boolean} True if it appears to be a valid timestamp
   */
  isValidTimestamp(text) {
    if (!text || typeof text !== 'string') return false;

    const trimmedText = text.trim();

    // Patterns indicating it is NOT a timestamp (names, simple durations, actions)
    const invalidPatterns = [
      /^\d{1,2}:\d{2}$/, // Only MM:SS (probably audio duration)
      /^[a-záéíóúüñ\s]+$/i, // Only letters and spaces (probably name or action)
      /^(Play|Reproducir|Pause|Pausar)$/i, // Button labels
      /^Message replied to:/i, // Reply indicator
      /^Message:/i // Generic indicator
    ];

    // If it matches any invalid pattern, return false
    if (invalidPatterns.some(pattern => pattern.test(trimmedText))) {
      return false;
    }

    // Patterns indicating a valid timestamp
    const validPatterns = [
      /\d{1,2}:\d{2}\s*(AM|PM)/i, // HH:MM AM/PM
      /\d{1,2}\/\d{1,2}\/\d{2,4}/, // DD/MM/YY(YY)
      /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Ene|Feb|Mar|Abr|May|Jun|Jul|Ago|Sep|Oct|Nov|Dic)/i, // Month name
      /(Today|Yesterday|Hoy|Ayer)/i, // Today/Yesterday
      /minutes? ago|hours? ago|minutes?|hours?/i, // Relative (X minutes ago)
      /sent at \d{1,2}:\d{2}\s*(AM|PM)?/i, // "sent at HH:MM"
      /sent at \d{1,2}:\d{2}/i // "sent at HH:MM"
    ];

    // If it matches any valid pattern, return true
    return validPatterns.some(pattern => pattern.test(trimmedText));
  }

  /**
   * PHASE 2: New functions to detect and add content types
   */

  /**
   * Improved image detection
   * @param {HTMLElement} container - Message container
   * @param {Object} messageData - Message data to update
   */
  detectAndAddImageContent(container, messageData) {
    try {
      const imageSelectors = Array.isArray(CONFIG.selectors.activeChat.messageImageElement) ?
        CONFIG.selectors.activeChat.messageImageElement.join(', ') :
        CONFIG.selectors.activeChat.messageImageElement;

      const imgElements = container.querySelectorAll(imageSelectors);

      if (imgElements.length > 0) {
        const validImages = Array.from(imgElements).filter(img => {
          const src = img.src || '';
          // Filter small icons/base64/emojis/avatars
          return src &&
            !src.startsWith('data:') &&
            (img.width > 30 || !img.width) &&
            (img.height > 30 || !img.height) &&
            !src.includes('/emoji.') &&
            !src.includes('/avatar/');
        });

        if (validImages.length > 0) {
          // Backward compatibility
          messageData.content.imageUrls = validImages.map(img => img.src);

          // New improved structure
          messageData.content.media.images = validImages.map(img => ({
            url: img.src,
            alt: img.alt || '',
            width: img.width || 0,
            height: img.height || 0
          }));

          if (messageData.content.type === 'unknown') {
            messageData.content.type = 'image';
          }
        }
      }

      // Additional search for images in divs with background-image
      const bgImageDivs = container.querySelectorAll('div[style*="background-image"]');
      if (bgImageDivs.length > 0) {
        for (const div of bgImageDivs) {
          const style = div.getAttribute('style') || '';
          const urlMatch = style.match(/background-image:\s*url\(['"]?(.*?)['"]?\)/i);

          if (urlMatch && urlMatch[1] && !urlMatch[1].startsWith('data:')) {
            const imageUrl = urlMatch[1];

            // Add only if not already in the list
            if (!messageData.content.imageUrls.includes(imageUrl)) {
              messageData.content.imageUrls.push(imageUrl);

              messageData.content.media.images.push({
                url: imageUrl,
                alt: "Background Image",
                width: div.clientWidth || 0,
                height: div.clientHeight || 0
              });

              if (messageData.content.type === 'unknown') {
                messageData.content.type = 'image';
              }
            }
          }
        }
      }
    } catch (error) {
      logger.error(`Error detecting images: ${error.message}`, {}, error);
    }
  }

  /**
   * Improved audio detection
   * @param {HTMLElement} container - Message container
   * @param {Object} messageData - Message data to update
   */
  detectAndAddAudioContent(container, messageData) {
    try {
      // Look for audio buttons
      const audioSelectors = Array.isArray(CONFIG.selectors.activeChat.messageAudioPlayButton) ?
        CONFIG.selectors.activeChat.messageAudioPlayButton.join(', ') :
        CONFIG.selectors.activeChat.messageAudioPlayButton;

      const audioButton = container.querySelector(audioSelectors);

      if (audioButton) {
        const label = audioButton.getAttribute('aria-label') || '';

        // Ignore if it's a video button
        if (label.toLowerCase().includes('video')) {
          return;
        }

        // Try to extract duration if available
        const duration = this.extractAudioDuration(container) || '';
        const audioUrl = this.extractAudioUrl(container) || null;

        // Backward compatibility
        messageData.content.hasAudio = true;
        messageData.content.audioUrl = audioUrl;

        // New improved structure
        messageData.content.media.audio = {
          exists: true,
          url: audioUrl,
          duration: duration,
          label: label
        };

        if (messageData.content.type === 'unknown') {
          messageData.content.type = 'audio';
        }

        // If there's a URL, try to get transcription if available
        if (audioUrl && typeof this.getAudioTranscription === 'function') {
          const transcription = this.getAudioTranscription(audioUrl);
          if (transcription) {
            messageData.content.transcribedAudio = transcription;
          } else {
            messageData.content.transcribedAudio = "[Audio Transcription Pending]";
          }
        }
      } else {
        // Look for <audio> elements directly as alternative
        const audioElement = container.querySelector('audio[src]');
        if (audioElement) {
          const audioUrl = audioElement.src;

          // Backward compatibility
          messageData.content.hasAudio = true;
          messageData.content.audioUrl = audioUrl;

          // New improved structure
          messageData.content.media.audio = {
            exists: true,
            url: audioUrl,
            duration: audioElement.duration ? `${Math.round(audioElement.duration)}s` : '',
            label: 'Audio message'
          };

          if (messageData.content.type === 'unknown') {
            messageData.content.type = 'audio';
          }

          // Try to get transcription
          if (typeof this.getAudioTranscription === 'function') {
            const transcription = this.getAudioTranscription(audioUrl);
            if (transcription) {
              messageData.content.transcribedAudio = transcription;
            } else {
              messageData.content.transcribedAudio = "[Audio Transcription Pending]";
            }
          }
        }
      }
    } catch (error) {
      logger.error(`Error detecting audio: ${error.message}`, {}, error);
    }
  }

  /**
   * Extracts audio duration if available
   * @param {HTMLElement} container - Message container
   * @returns {string|null} Audio duration (format "M:SS") or null
   */
  extractAudioDuration(container) {
    try {
      const durationSelectors = [
        'span[style*="color: rgba"]',
        'span.x193iq5w',
        'div[dir="auto"] > span'
      ];

      for (const selector of durationSelectors) {
        const elements = container.querySelectorAll(selector);
        for (const el of elements) {
          const text = el.textContent.trim();
          // Check format MM:SS or M:SS
          if (/^\d{1,2}:\d{2}$/.test(text)) {
            return text;
          }
        }
      }

      return null;
    } catch (error) {
      logger.debug(`Error extracting audio duration: ${error.message}`);
      return null;
    }
  }

  /**
   * Tries to extract the audio URL
   * @param {HTMLElement} container - Message container
   * @returns {string|null} Audio URL or null
   */
  extractAudioUrl(container) {
    try {
      const audioElement = container.querySelector('audio[src]');
      if (audioElement && audioElement.src) {
        return audioElement.src;
      }

      // Check for links to audio files
      const audioLink = container.querySelector('a[href*=".mp3"], a[href*=".m4a"], a[href*=".wav"], a[href*=".ogg"]');
      if (audioLink && audioLink.href) {
        return audioLink.href;
      }

      return null;
    } catch (error) {
      logger.debug(`Error extracting audio URL: ${error.message}`);
      return null;
    }
  }

  /**
   * Detects video content
   * @param {HTMLElement} container - Message container
   * @param {Object} messageData - Message data to update
   */
  detectAndAddVideoContent(container, messageData) {
    try {
      // Detect explicit video (<video> or links)
      const videoElement = container.querySelector('video, a[href*="video_redirect"]');

      if (videoElement) {
        if (videoElement.tagName === 'VIDEO') {
          const videoInfo = {
            exists: true,
            url: videoElement.src || null,
            type: 'video',
            thumbnail: this.extractVideoThumbnail(videoElement) || null,
            duration: videoElement.duration ? `${Math.round(videoElement.duration)}s` : null
          };

          messageData.content.media.video = videoInfo;
          if (messageData.content.type === 'unknown') {
            messageData.content.type = 'video';
          }
        } else if (videoElement.tagName === 'A' && videoElement.href) {
          const videoInfo = {
            exists: true,
            url: videoElement.href,
            type: 'video_link',
            thumbnail: null,
            duration: null
          };

          messageData.content.media.video = videoInfo;
          if (messageData.content.type === 'unknown') {
            messageData.content.type = 'video';
          }
        }
      } else {
        // Look for video containers
        const videoSelectors = Array.isArray(CONFIG.selectors.activeChat.messageVideoElement) ?
          CONFIG.selectors.activeChat.messageVideoElement.join(', ') :
          CONFIG.selectors.activeChat.messageVideoElement;

        const potentialVideoContainer = container.querySelector(videoSelectors);

        if (potentialVideoContainer) {
          const label = potentialVideoContainer.getAttribute('aria-label') || 'Video Player';
          const isThumbnail = potentialVideoContainer.style.backgroundImage ||
            potentialVideoContainer.querySelector('div[style*="background-image"]');

          const videoInfo = {
            exists: true,
            url: null,
            type: isThumbnail ? 'video_thumbnail' : 'video_player',
            thumbnail: this.extractBackgroundImage(potentialVideoContainer),
            label: label
          };

          messageData.content.media.video = videoInfo;
          if (messageData.content.type === 'unknown') {
            messageData.content.type = 'video';
          }
        }
      }
    } catch (error) {
      logger.error(`Error detecting video: ${error.message}`, {}, error);
    }
  }

  /**
   * Extracts background image for video
   * @param {HTMLElement} element - Element with possible background image
   * @returns {string|null} URL of background image or null
   */
  extractBackgroundImage(element) {
    try {
      const style = element.getAttribute('style') || '';
      const urlMatch = style.match(/background-image:\s*url\(['"]?(.*?)['"]?\)/i);
      if (urlMatch && urlMatch[1]) {
        return urlMatch[1];
      }

      const childWithBg = element.querySelector('div[style*="background-image"]');
      if (childWithBg) {
        const childStyle = childWithBg.getAttribute('style') || '';
        const childUrlMatch = childStyle.match(/background-image:\s*url\(['"]?(.*?)['"]?\)/i);
        if (childUrlMatch && childUrlMatch[1]) {
          return childUrlMatch[1];
        }
      }

      return null;
    } catch (error) {
      logger.debug(`Error extracting background image: ${error.message}`);
      return null;
    }
  }

  /**
   * Extracts video thumbnail
   * @param {HTMLVideoElement} videoElement - Video element
   * @returns {string|null} URL of thumbnail or null
   */
  extractVideoThumbnail(videoElement) {
    try {
      if (videoElement.poster) {
        return videoElement.poster;
      }

      const source = videoElement.querySelector('source[type^="video/"]');
      if (source && source.src) {
        return source.src.replace(/\.mp4$/, '.jpg'); // Common approximation
      }

      return null;
    } catch (error) {
      logger.debug(`Error extracting video thumbnail: ${error.message}`);
      return null;
    }
  }

  /**
   * Detects file attachments
   * @param {HTMLElement} container - Message container
   * @param {Object} messageData - Message data to update
   */
  detectAndAddFileContent(container, messageData) {
    try {
      const fileSelectors = Array.isArray(CONFIG.selectors.activeChat.messageFileElement) ?
        CONFIG.selectors.activeChat.messageFileElement.join(', ') :
        CONFIG.selectors.activeChat.messageFileElement;

      const fileElements = Array.from(container.querySelectorAll(fileSelectors));

      if (fileElements.length > 0) {
        const files = [];

        fileElements.forEach(fileElement => {
          const url = fileElement.href || null;
          const fileName = this.extractFileName(fileElement);
          const fileType = this.detectFileType(fileElement, fileName);

          if (url || fileName) {
            files.push({
              url: url,
              name: fileName,
              type: fileType
            });
          }
        });

        if (files.length > 0) {
          messageData.content.media.files = files;
          if (messageData.content.type === 'unknown') {
            messageData.content.type = 'file';
          }
        }
      }
    } catch (error) {
      logger.error(`Error detecting files: ${error.message}`, {}, error);
    }
  }

  /**
   * Extracts file name
   * @param {HTMLElement} fileElement - File element
   * @returns {string} File name or "Unnamed file"
   */
  extractFileName(fileElement) {
    try {
      if (fileElement.hasAttribute('download')) {
        return fileElement.getAttribute('download') || this.extractFileNameFromPath(fileElement.href);
      }

      const textContent = fileElement.textContent?.trim();
      if (textContent && textContent.includes('.')) {
        const fileNameMatch = textContent.match(/[\w\s\-]+\.\w+/);
        if (fileNameMatch) return fileNameMatch[0];
      }

      if (fileElement.hasAttribute('title')) return fileElement.getAttribute('title');
      if (fileElement.hasAttribute('aria-label')) {
        const label = fileElement.getAttribute('aria-label');
        if (label.includes('file') || label.includes('archivo')) {
          const parts = label.split(':');
          if (parts.length > 1) return parts[1].trim();
        }
        return label;
      }

      if (fileElement.href) {
        return this.extractFileNameFromPath(fileElement.href);
      }

      return 'Unnamed file';
    } catch (error) {
      logger.debug(`Error extracting file name: ${error.message}`);
      return 'Unnamed file';
    }
  }

  /**
   * Extracts file name from a URL path
   * @param {string} path - URL path
   * @returns {string} Extracted file name or "Unnamed file"
   */
  extractFileNameFromPath(path) {
    if (!path) return 'Unnamed file';
    try {
      const urlObj = new URL(path);
      const pathSegments = urlObj.pathname.split('/');
      const lastSegment = pathSegments[pathSegments.length - 1];

      const fileName = lastSegment.split('?')[0];
      return decodeURIComponent(fileName) || 'Unnamed file';
    } catch (error) {
      const match = path.match(/\/([^\/\?]+)(?:\?|$)/);
      return match ? decodeURIComponent(match[1]) : 'Unnamed file';
    }
  }

  /**
   * Detects file type based on extension
   * @param {HTMLElement} fileElement - File element
   * @param {string} fileName - File name
   * @returns {string} Detected file type
   */
  detectFileType(fileElement, fileName) {
    try {
      if (!fileName) return 'unknown';

      const extension = fileName.split('.').pop().toLowerCase();

      const extensionMap = {
        'pdf': 'pdf',
        'doc': 'document', 'docx': 'document', 'odt': 'document', 'rtf': 'document',
        'xls': 'spreadsheet', 'xlsx': 'spreadsheet', 'ods': 'spreadsheet',
        'ppt': 'presentation', 'pptx': 'presentation', 'odp': 'presentation',
        'txt': 'text',
        'zip': 'archive', 'rar': 'archive', '7z': 'archive',
        'jpg': 'image', 'jpeg': 'image', 'png': 'image', 'gif': 'image', 'bmp': 'image',
        'mp3': 'audio', 'wav': 'audio', 'ogg': 'audio', 'm4a': 'audio',
        'mp4': 'video', 'avi': 'video', 'mov': 'video', 'wmv': 'video'
      };

      return extensionMap[extension] || 'unknown';
    } catch (error) {
      logger.debug(`Error detecting file type: ${error.message}`);
      return 'unknown';
    }
  }

  /**
   * Detects location in the message
   * @param {HTMLElement} container - Message container
   * @param {Object} messageData - Message data to update
   */
  detectAndAddLocationContent(container, messageData) {
    try {
      const locationSelectors = Array.isArray(CONFIG.selectors.activeChat.messageLocationElement) ?
        CONFIG.selectors.activeChat.messageLocationElement.join(', ') :
        CONFIG.selectors.activeChat.messageLocationElement;

      const locationElement = container.querySelector(locationSelectors);

      if (locationElement) {
        let locationInfo = null;

        // It's a map link
        if (locationElement.tagName === 'A' && locationElement.href) {
          const label = this.extractLocationLabel(locationElement) || 'Shared location';
          const coordinates = this.extractCoordinates(locationElement.href);

          locationInfo = {
            url: locationElement.href,
            label: label,
            coordinates: coordinates
          };
        } else { // It's a map container
          const label = this.extractLocationLabel(locationElement) || 'Shared location';
          const mapLink = locationElement.querySelector('a[href*="maps"]');
          const url = mapLink ? mapLink.href : null;
          const coordinates = url ? this.extractCoordinates(url) : null;

          locationInfo = {
            url: url,
            label: label,
            coordinates: coordinates
          };
        }

        if (locationInfo) {
          messageData.content.media.location = locationInfo;
          if (messageData.content.type === 'unknown') {
            messageData.content.type = 'location';
          }
        }
      }
    } catch (error) {
      logger.error(`Error detecting location: ${error.message}`, {}, error);
    }
  }

  /**
   * Extracts location label
   * @param {HTMLElement} locationElement - Location element
   * @returns {string|null} Location label or null
   */
  extractLocationLabel(locationElement) {
    try {
      if (locationElement.hasAttribute('aria-label')) {
        return locationElement.getAttribute('aria-label')
          .replace(/location|ubicación|shared/i, '')
          .trim();
      }

      const innerText = locationElement.textContent?.trim();
      if (innerText && !innerText.startsWith('http')) {
        return innerText;
      }

      return null;
    } catch (error) {
      logger.debug(`Error extracting location label: ${error.message}`);
      return null;
    }
  }

  /**
   * Extracts coordinates from map URL
   * @param {string} url - Map URL
   * @returns {object|null} Object with latitude/longitude or null
   */
  extractCoordinates(url) {
    if (!url) return null;
    try {
      if (url.includes('maps')) {
        // Formats: ?q=<lat>,<lng> or @<lat>,<lng>
        let coordsMatch = url.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/i);
        if (!coordsMatch) {
          coordsMatch = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/i);
        }

        if (coordsMatch) {
          return {
            latitude: parseFloat(coordsMatch[1]),
            longitude: parseFloat(coordsMatch[2])
          };
        }
      }

      return null;
    } catch (error) {
      logger.debug(`Error extracting coordinates: ${error.message}`);
      return null;
    }
  }

  /**
   * Detects GIFs and stickers
   * @param {HTMLElement} container - Message container
   * @param {Object} messageData - Message data to update
   */
  detectAndAddGifContent(container, messageData) {
    try {
      const gifSelectors = Array.isArray(CONFIG.selectors.activeChat.messageGifElement) ?
        CONFIG.selectors.activeChat.messageGifElement.join(', ') :
        CONFIG.selectors.activeChat.messageGifElement;

      const gifElement = container.querySelector(gifSelectors);

      if (gifElement) {
        let gifInfo = null;

        // For image elements
        if (gifElement.tagName === 'IMG') {
          const url = gifElement.src;
          const isGif = url && (url.includes('giphy.com') || url.includes('tenor.com') || url.endsWith('.gif'));
          const isSticker = !!container.querySelector('[data-testid="sticker"]');

          gifInfo = {
            url: url,
            type: isSticker ? 'sticker' : (isGif ? 'gif' : 'animated_content'),
            alt: gifElement.alt || ''
          };
        } else { // For containers
          const label = gifElement.getAttribute('aria-label') || 'GIF';
          const imgElement = gifElement.querySelector('img');
          const url = imgElement ? imgElement.src : null;

          gifInfo = {
            url: url,
            type: label.toLowerCase().includes('sticker') ? 'sticker' : 'gif',
            label: label
          };
        }

        if (gifInfo) {
          messageData.content.media.gif = gifInfo;
          if (messageData.content.type === 'unknown') {
            messageData.content.type = 'gif';
          }
        }
      }
    } catch (error) {
      logger.error(`Error detecting GIF/sticker: ${error.message}`, {}, error);
    }
  }

  /**
   * Determines if a message is a system message - IMPROVED VERSION
   * @param {string} messageText - Message text to check
   * @returns {boolean} True if the message is a system message
   */
  isSystemMessage(messageText) {
    if (!messageText) return false;

    // Common patterns for system messages - ADDITIONAL ADDITIONS
    const systemPatterns = [
      // ─── Conversation start ─────────────────────────────
      /^(You|Tú|[A-Z][a-z]+) started this chat\.?( View (seller|buyer) profile)?$/i,
      /^([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+) inició el chat\.?( Ver (perfil del vendedor|perfil del comprador))?$/i,

      // ─── Participants added or removed ────────────────
      /^You added .* to the group\.$/i,
      /^Agregaste a .* al grupo\.$/i,
      /^You removed .* from the group\.$/i,
      /^Eliminaste a .* del grupo\.$/i,

      // ─── Users leaving the group ──────────────────────
      /^.* (left|salió del) grupo\.$/i,

      // ─── Name or color changes ─────────────────────────
      /^You named the group .*$/i,
      /^Nombraste al grupo .*$/i,
      /^You changed the chat colors\.$/i,
      /^Cambiaste los colores del chat\.$/i,
      /^You set the nickname for .* to .*$/i,
      /^Definiste el apodo de .* como .*$/i,

      // ─── Changes in group photo/name with dynamic name
      /^Changed the group photo\.$/i,
      /^Cambió la foto del grupo\.$/i,
      /cambió la foto del grupo\.$/i,
      /named the group .+\.$/i,
      /nombró al grupo .+\.$/i,
      /^[A-Z][a-z]+(?: [A-Z][a-z]+)? changed the group photo\.$/i,
      /^[A-Z][a-z]+(?: [A-Z][a-z]+)? named the group .+\.$/i,

      // ─── Media sent ───────────────────────────────────
      /^You sent (a )?(GIF|photo|video|attachment)\.$/i,
      /^Enviaste (un|una) (GIF|foto|video|adjunto)\.$/i,
      /^You shared a location\.$/i,
      /^Compartiste una ubicación\.$/i,

      // ─── Calls ──────────────────────────────────────────
      /^Missed call$/i,
      /^You missed a call from .*$/i,
      /^Llamada perdida$/i,
      /^Llamada perdida de .*$/i,

      // ─── Listing statuses ───────────────────────────────
      /^.* marked the listing as (Available|Pending)\.$/i,
      /^Marcó este artículo como (vendido|pendiente|disponible)\.?$/i,
      /^.* sold .+\.$/i,
      /^Vendió .+\.$/i,
      /^[A-Z][a-z]+ marked the listing as (Available|Pending)\.$/i,
      /^[A-Z][a-z]+ changed the listing description\.$/i,
      /^[A-Z][a-z]+ sold .+\.$/i,

      // ─── System messages / UI ─────────────────────────
      /^.* bumped their message:?$/i,
      /^Mensaje enviado$/i,
      /^Ver anuncios similares$/i,
      /^See similar listings$/i,
      /^Ver perfil del comprador$/i,
      /^View buyer profile$/i,
      /^Ver perfil del vendedor$/i,
      /^View seller profile$/i,
      /^Ver detalles del comprador$/i,
      /^View buyer details$/i,
      /detalles del comprador$/i,
      /buyer details$/i,

      // ─── Alerts / informative messages ───────────────────
      /^Estás recibiendo muchos mensajes sobre este anuncio/i,
      /^To help identify and reduce scams and fraud, Meta may use technology to review Marketplace messages\./i,
      /^You're receiving a lot of messages about this listing/i,
      /^Estás esperando tu respuesta sobre este anuncio\.\s*Ver anuncio$/i,
      /^You're waiting for a response about this listing\.\s*View listing$/i,
      /^Is getting a lot of messages about this listing/i,
      /^Is waiting for your response about this listing\.\s*View listing$/i,
      /^Beware of common scams using payment apps/i,
      /^[A-Z][a-z]+ is getting a lot of messages about this listing\.? See similar listings$/i,
      /^[A-Z][a-z]+ is waiting for your response about this listing\.? View listing$/i,

      // ─── Ratings ────────────────────────────────────
      /^You can now rate each other.*Rate [A-Z][a-z]+$/i,
      /^Ahora pueden calificarse.*Califica a [A-ZÁÉÍÓÚÑ][a-záéíóúñ]+$/i,

      // ─── Profile information ─────────────────────────────
      /^Joined facebook in \d{4}$/i,
      /^Se unió a Facebook en \d{4}$/i,
      /se unió a Facebook en \d{4}/i,

      // ─── Dates / timestamps ───────────────────────────────
      /^\d{1,2}\/\d{1,2}\/\d{2,4},\s*\d{1,2}:\d{2}(\u2009|\u202F)?\s*(AM|PM)?$/i,
      /^[A-Za-z]{3,9}\s+\d{1,2},\s+\d{4}(,\s*\d{1,2}:\d{2}\s*(AM|PM)?)?$/i,

      // ─── Others ─────────────────────────────────────────────
      /·\s*.*\s*add name$/i
    ];

    const isSystem = systemPatterns.some(pattern => pattern.test(messageText));
    if (isSystem) {
      logger.debug(`[isSystemMessage] System message detected: "${messageText.substring(0, 30)}..."`);
    }
    return isSystem;
  }

  /**
   * Determines if an element is a divider (date, separator, etc.) - IMPROVED VERSION
   * @param {HTMLElement} element - Element to check
   * @returns {boolean} True if the element is a divider
   */
  isDividerElement(element) {
    try {
      const text = element.innerText || '';

      // 1. Check common divider classes
      if (element.classList &&
        (element.classList.contains('x1e56ztr') || // Classes observed in dividers
          element.classList.contains('x78zum5') ||
          element.classList.contains('xh8yej3'))) {
        // Check if it contains significant text besides the classes
        const contentDiv = element.querySelector('div[dir="auto"], span[dir="auto"]');
        if (!contentDiv || contentDiv.textContent.length < 5) { // If there's no content or it's very short
          logger.debug(`[isDivider] Element with divider class and little/no text: ${element.className}`);
          return true;
        }
      }

      // 2. Check text that are usually dividers (dates, etc.)
      if (/^(Today|Yesterday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Hoy|Ayer|Lunes|Martes|Miércoles|Jueves|Viernes|Sábado|Domingo)$/i.test(text)) {
        logger.debug(`[isDivider] Element with day text: ${text}`);
        return true;
      }

      // 3. Check date patterns (DD/MM/YYYY, etc.)
      if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(text) ||
        /^\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)(\w*)(\s+\d{2,4})?$/i.test(text) ||
        /^\d{1,2}\s+(Ene|Feb|Mar|Abr|May|Jun|Jul|Ago|Sep|Oct|Nov|Dic)(\w*)(\s+\d{2,4})?$/i.test(text)) {
        logger.debug(`[isDivider] Element with date text: ${text}`);
        return true;
      }

      // 4. Check if the element has divider structure
      if (element.getAttribute('role') === 'separator' ||
        element.tagName === 'HR' ||
        (element.children.length === 0 && element.parentElement?.getAttribute('role') === 'separator')) {
        logger.debug(`[isDivider] Element with separator role/tag`);
        return true;
      }

      return false;
    } catch (error) {
      logger.error(`Error in isDividerElement: ${error.message}`);
      return false;
    }
  }

  /**
   * PHASE 3: New methods for contextualization and advanced processing
   */

  /**
   * Determines if a message is a reply to another message
   * @param {HTMLElement} container - Message container
   * @returns {Object|null} Object with reply information or null if not a reply
   */
  detectQuotedMessage(container) {
    try {
      // Look for quote indicators - adjust selectors as needed
      const quoteElement = container.querySelector('div[data-testid="message-quote"]');
      if (!quoteElement) return null;

      // Extract quoted text
      const quotedTextElement = quoteElement.querySelector('span[data-testid="message-text"]');
      const quotedText = quotedTextElement ? quotedTextElement.innerText.trim() : '';

      // 2. Try to get the name of the original sender
      let originalSender = null;
      const senderElement = quoteElement.querySelector('span.x1ncwhqj, h4.xexx8yu');
      if (senderElement) {
        originalSender = senderElement.innerText.trim();
      }

      // 3. Look for additional information such as timestamp
      let originalTimestamp = null;
      const timestampElement = quoteElement.querySelector(CONFIG.selectors.activeChat.messageTimestamp.join(', '));
      if (timestampElement) {
        originalTimestamp = timestampElement.getAttribute('aria-label') ||
          timestampElement.getAttribute('data-tooltip-content') ||
          timestampElement.innerText;
      }

      return {
        type: 'reply',
        quotedText: quotedText,
        originalSender: originalSender,
        originalTimestamp: originalTimestamp
      };
    } catch (error) {
      logger.debug(`Error detecting quoted message: ${error.message}`);
      return null;
    }
  }

  /**
   * Detects and extracts mentions in a message
   * @param {HTMLElement} container - Message container
   * @returns {array} Array of found mentions
   */
  extractMentions(container) {
    try {
      const mentions = [];

      // Look for mention elements with specific classes or attributes
      const mentionElements = container.querySelectorAll('a[href*="/user/"], span.xngnso2, span[data-hovercard]');

      mentionElements.forEach(element => {
        const name = element.innerText.trim();
        let userId = null;

        // Try to extract user ID from different sources
        if (element.href) {
          const match = element.href.match(/\/user\/(\d+)|\?id=(\d+)/);
          if (match) {
            userId = match[1] || match[2];
          }
        } else if (element.getAttribute('data-hovercard')) {
          const match = element.getAttribute('data-hovercard').match(/id=(\d+)/);
          if (match) {
            userId = match[1];
          }
        }

        if (name) {
          mentions.push({
            name: name,
            id: userId
          });
        }
      });

      return mentions.length > 0 ? mentions : null;
    } catch (error) {
      logger.debug(`Error extracting mentions: ${error.message}`);
      return null;
    }
  }

  /**
   * Analyzes the context of a message to get additional information
   * @param {HTMLElement} container - Message container
   * @param {Object} messageData - Message data
   */
  enhanceMessageContext(container, messageData) {
    try {
      // 1. Detect if it's a reply
      const quoteInfo = this.detectQuotedMessage(container);
      if (quoteInfo) {
        messageData.context = {
          ...messageData.context || {},
          ...quoteInfo
        };
        // If it's a reply, update the message type
        messageData.content.type = messageData.content.type === 'unknown' ? 'reply' : `${messageData.content.type}_reply`;
      }

      // 2. Extract mentions
      const mentions = this.extractMentions(container);
      if (mentions) {
        messageData.context = {
          ...messageData.context || {},
          mentions: mentions
        };
      }

      // 3. Detect reactions to the message
      const reactions = this.detectReactions(container);
      if (reactions) {
        messageData.context = {
          ...messageData.context || {},
          reactions: reactions
        };
      }

      // 4. Detect products or links mentioned
      const productMention = this.detectProductMention(container);
      if (productMention) {
        messageData.context = {
          ...messageData.context || {},
          productMention: productMention
        };
      }
    } catch (error) {
      logger.debug(`Error enhancing message context: ${error.message}`);
    }
  }

  /**
   * Detects reactions to a message (emojis, likes)
   * @param {HTMLElement} container - Message container
   * @returns {array|null} Array of reactions or null
   */
  detectReactions(container) {
    try {
      // Look for reaction containers
      const reactionContainer = container.querySelector('div.xq8finb, div.x6s0dn4.x78zum5.xl56j7k, div[role="toolbar"][aria-label*="reaction"]');

      if (!reactionContainer) return null;

      const reactions = [];

      // Look for emoji elements
      const emojiElements = reactionContainer.querySelectorAll('img.emoji, span[aria-label*=":"], div[aria-label*="Reacted"]');

      emojiElements.forEach(element => {
        let type = 'unknown';
        let value = '';

        // Get details based on element type
        if (element.tagName === 'IMG') {
          type = 'emoji';
          value = element.alt || element.getAttribute('aria-label') || '';
        } else {
          const label = element.getAttribute('aria-label') || '';
          if (label.includes('Like')) {
            type = 'like';
            value = '👍';
          } else if (label.includes('Love')) {
            type = 'love';
            value = '❤️';
          } else if (label.match(/Reacted with/i)) {
            type = 'emoji';
            // Extract emoji from text (format: "Reacted with :emoji:")
            const match = label.match(/Reacted with :([^:]+):/);
            if (match) {
              value = match[1];
            } else {
              value = label.replace(/Reacted with\s*/i, '');
            }
          } else {
            value = label;
          }
        }

        if (value) {
          reactions.push({
            type: type,
            value: value
          });
        }
      });

      return reactions.length > 0 ? reactions : null;
    } catch (error) {
      logger.debug(`Error detecting reactions: ${error.message}`);
      return null;
    }
  }

  /**
   * Detects product mentions or links in a message
   * @param {HTMLElement} container - Message container
   * @returns {object|null} Product information or null
   */
  detectProductMention(container) {
    try {
      // Look for links to Marketplace products
      const productLink = container.querySelector('a[href*="/marketplace/item/"]');
      if (!productLink) return null;

      const href = productLink.href;
      let productId = null;

      // Extract product ID
      const match = href.match(/\/marketplace\/item\/(\d+)/);
      if (match) {
        productId = match[1];
      }

      // Extract title and image if available
      let title = '';
      let imageUrl = '';

      // Look for elements related to the product
      const titleElement = productLink.querySelector('span[dir="auto"], div[dir="auto"]');
      if (titleElement) {
        title = titleElement.innerText.trim();
      }

      const imageElement = container.querySelector('a[href*="/marketplace/item/"] img, div.x1ey2m1c img');
      if (imageElement && imageElement.src) {
        imageUrl = imageElement.src;
      }

      return {
        type: 'product',
        productId: productId,
        productUrl: href,
        title: title,
        imageUrl: imageUrl
      };
    } catch (error) {
      logger.debug(`Error detecting product mention: ${error.message}`);
      return null;
    }
  }

  /**
   * PHASE 3: Advanced detector for system messages and important events
   */
  detectSpecialSystemEvents(messageText) {
    if (!messageText) return null;

    // Important events in a Marketplace conversation
    const eventPatterns = [
      // Purchase/sale events
      {
        pattern: /marked this item as (sold|pending|available)/i,
        type: 'status_change',
        action: (match) => match[1].toLowerCase()
      },
      // Price changes
      {
        pattern: /changed the price from ([\d,\.]+) to ([\d,\.]+)/i,
        type: 'price_change',
        action: (match) => ({ oldPrice: match[1], newPrice: match[2] })
      },
      // Cancellation or completion
      {
        pattern: /(canceled|completed) this sale/i,
        type: 'sale_event',
        action: (match) => match[1].toLowerCase()
      },
      // Specific requests
      {
        pattern: /requested more details about/i,
        type: 'request',
        action: () => 'details_request'
      },
      // Spanish version
      {
        pattern: /marcó este artículo como (vendido|pendiente|disponible)/i,
        type: 'status_change',
        action: (match) => {
          const status = match[1].toLowerCase();
          return status === 'vendido' ? 'sold' : (status === 'pendiente' ? 'pending' : 'available');
        }
      }
    ];

    // Check each pattern
    for (const eventDef of eventPatterns) {
      const match = messageText.match(eventDef.pattern);
      if (match) {
        return {
          type: eventDef.type,
          action: eventDef.action(match),
          originalText: messageText
        };
      }
    }

    return null;
  }

  /**
   * PHASE 3: Extracts enhanced chat history with asynchronous processing and promises
   * @param {HTMLElement} messagesWrapper - Messages container
   * @returns {Promise<Array>} Promise that resolves to the messages array
   */
  async extractChatHistoryEnhanced(messagesWrapper) {
    if (this.isProcessingChat) {
      logger.warn('Chat history extraction already in progress. Skipping.');
      return [];
    }
    if (!messagesWrapper) {
      logger.error('messagesWrapper element not provided to extractChatHistory.');
      return [];
    }

    this.isProcessingChat = true;
    logger.debug('Starting enhanced chat history extraction...');

    const messages = [];
    let messageElements = [];
    let previousMessageBubbleHTML = null;

    try {
      // Use the improved message row selector
      messageElements = domUtils.findAllElements(CONFIG.selectors.activeChat.messageRow, messagesWrapper);
      logger.debug(`Found ${messageElements.length} message row elements`);

      if (messageElements.length === 0) {
        // Fallback if elements aren't found with main selector
        const potentialMessages = messagesWrapper.querySelectorAll('div[dir="auto"][role="none"]');
        if (potentialMessages.length > 0) {
          messageElements = Array.from(potentialMessages);
        } else {
          throw new Error("No message elements found with main or fallback selectors");
        }
      }

      // Use batch processing for large messages
      const BATCH_SIZE = 20;
      const batches = Math.ceil(messageElements.length / BATCH_SIZE);

      for (let batchIndex = 0; batchIndex < batches; batchIndex++) {
        const start = batchIndex * BATCH_SIZE;
        const end = Math.min(start + BATCH_SIZE, messageElements.length);
        const currentBatch = messageElements.slice(start, end);

        logger.debug(`Processing batch ${batchIndex + 1}/${batches} (${currentBatch.length} messages)`);

        // Process messages in batches and allow the browser to "breathe" between batches
        const batchMessages = await this.processBatchOfMessages(
          currentBatch,
          previousMessageBubbleHTML,
          batchIndex
        );

        if (batchMessages.lastProcessed) {
          previousMessageBubbleHTML = batchMessages.lastProcessed;
        }

        // Add valid messages from this batch
        if (batchMessages.messages && batchMessages.messages.length > 0) {
          messages.push(...batchMessages.messages);
        }

        // Pause between batches to avoid blocking the interface
        if (batchIndex < batches - 1) {
          await new Promise(resolve => setTimeout(resolve, 5));
        }
      }

      this.lastProcessedMessageCount = messages.length;
      logger.log(`Enhanced extraction completed: ${messages.length} messages processed in ${batches} batches`);

      // PHASE 3: Post-processing to add references between messages
      this.buildMessageReferences(messages);

    } catch (error) {
      logger.error('Error during enhanced chat history extraction:', {}, error);
    } finally {
      this.isProcessingChat = false;
    }

    return messages;
  }

  /**
   * Processes a batch of messages and returns an array with the valid messages
   * @param {Array<HTMLElement>} elements - Elements to process
   * @param {string} previousHTML - HTML of the previous message to detect duplicates
   * @param {number} batchIndex - Index of the current batch
   * @returns {Promise<Object>} - Object with the messages and the last processed HTML
   */
  async processBatchOfMessages(elements, previousHTML, batchIndex) {
    const batchMessages = [];
    let lastProcessedHTML = previousHTML;

    for (let i = 0; i < elements.length; i++) {
      const rowElement = elements[i];

      // The 'messageBubble' is now the row itself for duplicate checking
      const messageBubble = rowElement;
      const currentMessageBubbleHTML = messageBubble.outerHTML;

      // Skip duplicates
      if (currentMessageBubbleHTML === lastProcessedHTML) {
        continue;
      }
      lastProcessedHTML = currentMessageBubbleHTML;

      // The 'contentContainer' is where we will look for the actual message content
      const contentContainer = domUtils.findElement([
        'div.x1cy8zhl', // Common container for message bubble
        'div[data-testid*="message-container"]', // Another possible container
        'span.x1lliihq.x1plvlek > div[dir="auto"]' // Directly the text div
      ], rowElement) || rowElement; // Fallback to the row

      // Improved structure - PHASE 3
      const messageData = {
        id: `msg_${this.currentChatId}_${batchIndex * 100 + i}`,
        timestamp: null,
        sentByUs: false,
        content: {
          text: '',
          type: 'unknown',
          media: {
            images: [],
            audio: null,
            video: null,
            files: [],
            location: null,
            gif: null
          }
        },
        context: {} // NEW: Contextual information of the message
      };

      try {
        // Determine if it was sent by us
        messageData.sentByUs = this.isMessageSentByUs(messageBubble);

        // Extract text with improved cleaning
        const textElement = domUtils.findElement(CONFIG.selectors.activeChat.messageContent, contentContainer);
        let textContent = '';
        if (textElement) {
          textContent = (textElement.innerText || textElement.textContent || '').trim();

          // Cleaning of timestamps at the beginning of the text
          textContent = textContent.replace(/^(\d{1,2}\/\d{1,2}\/\d{2,4},\s*)?\d{1,2}:\d{2}\s*(?:AM|PM)?\s*:\s*/i, '').trim();
          textContent = textContent.replace(/^(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4},\s*\d{1,2}:\d{2}\s*(?:AM|PM)?\s*:\s*/i, '').trim();
          textContent = textContent.replace(/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+\d{1,2}:\d{2}\s*(?:AM|PM)?\s*:\s*/i, '').trim();
          textContent = textContent.replace(/^Sent \d+d ago:\s*/i, '').trim(); // Format "Sent Xd ago: "
          textContent = textContent.replace(/^\d{1,2}\/\d{1,2}\/\d{2,4},?\s+\d{1,2}:\d{2}\s*(?:AM|PM)?\s*:\s*/i, '').trim(); // Format "DD/MM/YY, HH:MM AM/PM:"
        }

        const isSys = this.isSystemMessage(textContent);
        const isDiv = this.isDividerElement(rowElement);

        if (textContent && !isDiv) {
          messageData.content.text = textContent;

          if (isSys) {
            // Detect special system events
            const specialEvent = this.detectSpecialSystemEvents(textContent);
            if (specialEvent) {
              messageData.content.type = 'system_event';
              messageData.context.systemEvent = specialEvent;
            } else {
              messageData.content.type = 'system';
            }
          } else {
            messageData.content.type = 'text';
          }
        }

        // PHASE 3: Context improvement (mentions, replies, etc.)
        this.enhanceMessageContext(contentContainer, messageData);

        // Extract timestamp
        const timestampElement = domUtils.findElement(CONFIG.selectors.activeChat.messageTimestamp, messageBubble);
        if (timestampElement) {
          const potentialTimestamp = timestampElement.getAttribute('data-tooltip-content') ||
            timestampElement.getAttribute('aria-label') ||
            timestampElement.innerText;

          if (this.isValidTimestamp(potentialTimestamp)) {
            messageData.timestamp = potentialTimestamp;
          }
        }

        // Detection of media types
        this.detectAndAddImageContent(contentContainer, messageData);
        this.detectAndAddAudioContent(contentContainer, messageData);
        this.detectAndAddVideoContent(contentContainer, messageData);
        this.detectAndAddFileContent(contentContainer, messageData);
        this.detectAndAddLocationContent(contentContainer, messageData);
        this.detectAndAddGifContent(contentContainer, messageData);

        // Determine final content type
        if (messageData.content.type === 'unknown') {
          if (messageData.content.text) {
            messageData.content.type = 'text';
          } else if (messageData.content.media.images.length > 0) {
            messageData.content.type = 'image';
          } else if (messageData.content.media.audio) {
            messageData.content.type = 'audio';
          } else if (messageData.content.media.video) {
            messageData.content.type = 'video';
          } else if (messageData.content.media.files.length > 0) {
            messageData.content.type = 'file';
          } else if (messageData.content.media.location) {
            messageData.content.type = 'location';
          } else if (messageData.content.media.gif) {
            messageData.content.type = 'gif';
          }
        }

        // Add message only if it has relevant content and is not a divider
        if (messageData.content.type !== 'unknown' && !isDiv) {
          batchMessages.push(messageData);
        }

      } catch (msgError) {
        logger.error(`Error processing message element in batch ${batchIndex}, item ${i}:`, {}, msgError);
      }
    }

    return {
      messages: batchMessages,
      lastProcessed: lastProcessedHTML
    };
  }

  /**
   * Builds references between messages (replies, quotes) after processing
   * @param {Array} messages - List of processed messages
   */
  buildMessageReferences(messages) {
    if (!messages || messages.length === 0) return;

    try {
      // Create an indexing of messages by text to facilitate searching
      const textMap = new Map();

      // First pass: index by text
      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        if (msg.content.text) {
          // Use the first 50 characters as a key to improve partial matches
          const textKey = msg.content.text.substring(0, 50).toLowerCase();
          if (!textMap.has(textKey)) {
            textMap.set(textKey, []);
          }
          textMap.get(textKey).push({ index: i, id: msg.id });
        }
      }

      // Second pass: set references
      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        if (msg.context && msg.context.type === 'reply' && msg.context.quotedText) {
          const quotedTextKey = msg.context.quotedText.substring(0, 50).toLowerCase();

          // Search for possible original messages
          if (textMap.has(quotedTextKey)) {
            const candidates = textMap.get(quotedTextKey);

            // Prioritize messages prior to this response
            const validCandidates = candidates.filter(c => c.index < i);

            if (validCandidates.length > 0) {
              // Use the closest message as the original
              const originalMsg = validCandidates.reverse()[0];
              msg.context.referencesMessageId = originalMsg.id;

              // Also add a reverse reference in the original message
              const originalMsgObj = messages[originalMsg.index];
              if (originalMsgObj) {
                originalMsgObj.context = originalMsgObj.context || {};
                originalMsgObj.context.referencedBy = originalMsgObj.context.referencedBy || [];
                originalMsgObj.context.referencedBy.push(msg.id);
              }
            }
          }
        }
      }

      logger.debug(`Message references built for ${messages.length} messages`);
    } catch (error) {
      logger.error('Error building message references:', {}, error);
    }
  }

  /**
   * Determines if we are the seller in this chat using DOM indicators
   * @param {HTMLElement} chatContainer - The active chat container
   * @returns {boolean} True if we are the seller, false if we are the buyer
   */
  determineIfSeller(chatContainer) {
    try {
      // Verify seller indicators
      for (const selector of CONFIG.selectors.activeChat.sellerIndicators) {
        // For jQuery-like selectors with :contains
        if (selector.includes(':contains')) {
          const textToFind = selector.match(/:contains\("(.+?)"\)/)[1];
          const elements = Array.from(chatContainer.querySelectorAll('*')).filter(
            el => el.textContent && el.textContent.includes(textToFind)
          );
          if (elements.length > 0) {
            logger.debug(`Seller indicator found: ${textToFind}`);
            return true;
          }
        } else {
          const elements = chatContainer.querySelectorAll(selector);
          if (elements.length > 0) {
            logger.debug(`Seller indicator found: ${selector}`);
            return true;
          }
        }
      }

      // Verify buyer indicators
      for (const selector of CONFIG.selectors.activeChat.buyerIndicators) {
        // For jQuery-like selectors with :contains
        if (selector.includes(':contains')) {
          const textToFind = selector.match(/:contains\("(.+?)"\)/)[1];
          const elements = Array.from(chatContainer.querySelectorAll('*')).filter(
            el => el.textContent && el.textContent.includes(textToFind)
          );
          if (elements.length > 0) {
            logger.debug(`Buyer indicator found: ${textToFind}`);
            return false;
          }
        } else {
          const elements = chatContainer.querySelectorAll(selector);
          if (elements.length > 0) {
            logger.debug(`Buyer indicator found: ${selector}`);
            return false;
          }
        }
      }

      // If there are no clear indicators, use alternative heuristics
      logger.debug('No definitive role indicators found, using alternative heuristic');

      // Look for a link to the product as an indication that we are the buyer
      const productLink = chatContainer.querySelector('a[href*="/marketplace/item/"]');
      if (productLink) {
        logger.debug('Product link found, likely a buyer');
        return false;
      }

      // By default, assume that we are the buyer if there are no clear indicators
      return false;
    } catch (error) {
      logger.error(`Error determining seller/buyer role: ${error.message}`, {}, error);
      // By default in case of error, we assume that we are the buyer as the safest case
      return false;
    }
  }

  /**
   * Determines if a message was sent by the current user - v2.1 (Based on HTML analysis and priorities)
   * @param {HTMLElement} messageRowElement - The message row element
   * @returns {boolean} True if the message was sent by the current user
   */
  isMessageSentByUs(messageRowElement) {
    // Make sure we are working with the row element (role="row")
    const row = messageRowElement?.getAttribute('role') === 'row'
      ? messageRowElement
      : messageRowElement?.closest('div[role="row"]');

    if (!row) {
      logger.debug("[isMessageSentByUs] Could not find the div[role='row'] container. Assuming foreign message.");
      return false;
    }

    try {
      // --- METHOD 1: Direct class in the row (Highest priority) ---
      if (row.classList.contains('x1ja2u2z')) {
        logger.debug("[isMessageSentByUs] CLASS INDICATOR: Row has 'x1ja2u2z'. It's own.");
        return true;
      }
      if (row.classList.contains('x1yc453h')) {
        logger.debug("[isMessageSentByUs] CLASS INDICATOR: Row has 'x1yc453h'. It's foreign.");
        return false;
      }
      logger.debug("[isMessageSentByUs] CLASS INDICATOR: No conclusive class detected in the row.");

      // --- METHOD 2: data-scope in the first gridcell ---
      const firstCell = row.firstElementChild;
      // Verify that it is a gridcell and has the specific data-scope
      if (firstCell?.getAttribute('role') === 'gridcell' && firstCell.getAttribute('data-scope') === 'messages_table') {
        logger.debug("[isMessageSentByUs] GRIDCELL INDICATOR: First gridcell has data-scope='messages_table'. It's own.");
        return true;
      }
      logger.debug("[isMessageSentByUs] GRIDCELL INDICATOR: First gridcell does not have data-scope='messages_table'.");

      // --- METHOD 3: Alignment (justify-content) ---
      try {
        // Try to get the computed style of the row
        const style = window.getComputedStyle(row);
        const justifyContent = style.getPropertyValue('justify-content');

        if (justifyContent === 'flex-end') {
          logger.debug("[isMessageSentByUs] ALIGNMENT INDICATOR: justify-content is 'flex-end'. It's own.");
          return true;
        }
        if (justifyContent === 'flex-start') {
          logger.debug("[isMessageSentByUs] ALIGNMENT INDICATOR: justify-content is 'flex-start'. It's foreign.");
          return false;
        }
        logger.debug(`[isMessageSentByUs] ALIGNMENT INDICATOR: justify-content is '${justifyContent}'. Not conclusive.`);
      } catch (styleError) {
        logger.debug(`[isMessageSentByUs] ALIGNMENT INDICATOR: Error getting style: ${styleError.message}`);
      }

      // --- METHOD 4: Aria-label with "You sent" ---
      // Search in any child element of the row
      const hasYouSentLabel = Array.from(row.querySelectorAll('[aria-label]'))
        .some(el => {
          const label = el.getAttribute('aria-label');
          return label && /you sent|enviaste/i.test(label);
        });

      if (hasYouSentLabel) {
        logger.debug("[isMessageSentByUs] ARIA INDICATOR: Found 'you sent' in aria-label. It's own.");
        return true;
      }
      logger.debug("[isMessageSentByUs] ARIA INDICATOR: No sending text found in aria-label.");

      // --- METHOD 5: Avatar Presence ---
      // Use the configured selector for avatars
      const avatar = domUtils.findElement(CONFIG.selectors.activeChat.senderAvatar, row);
      if (avatar) {
        // If an avatar is found (according to the selector), it is likely a received message
        logger.debug("[isMessageSentByUs] AVATAR INDICATOR: Avatar found in the row. It's foreign.");
        return false;
      }
      logger.debug("[isMessageSentByUs] AVATAR INDICATOR: No avatar found in the row. Could be own.");

      // --- METHOD 6: Text "You sent" (H5) - Less reliable, but as fallback ---
      const h5SenderElement = row.querySelector('h5 > span');
      if (h5SenderElement && /you sent|enviaste/i.test(h5SenderElement.textContent || '')) {
        logger.debug(`[isMessageSentByUs] TEXTUAL INDICATOR (H5): Found '${h5SenderElement.textContent.trim()}'. It's own.`);
        return true;
      }

      // --- Final Default ---
      // If none of the above indicators were conclusive, assume it is foreign as a security measure.
      logger.warn("[isMessageSentByUs] Could not determine the sender with certainty after all checks. Assuming foreign message.");
      return false;

    } catch (error) {
      logger.error(`[isMessageSentByUs] General error processing the row: ${error.message}`, { html: row.outerHTML.substring(0, 200) }, error);
      return false; // Assume foreign in case of error
    }
  }

  /**
   * Handles the generation and potentially sending of a response based on the chat context
   * @param {Object} context - Chat context that includes messages, product information, etc.
   * @returns {Promise<Object>} - Promise that resolves with the generated response
   */
  async handleResponse(context) {
    try {
      logger.log('[ChatManager] Initiating handleResponse...');

      if (!context || !context.messages || context.messages.length === 0) {
        logger.error('[ChatManager] Invalid chat context or no messages.');
        throw new Error('Invalid chat context or no messages');
      }

      const roleText = context.role === 'seller' ? 'seller' : 'buyer';
      logger.log(`[ChatManager] Role: ${roleText}, Total messages for context: ${context.messages.length}`);

      const operationMode = window.CONFIG?.operationMode || 'manual';
      logger.log(`[ChatManager] Configured operation mode (for sending): ${operationMode}`);

      // Assume window.openaiManager is the primary (and likely only) AI service provider,
      // and it implements the OpenAI Assistants API.
      const assistantService = window.openaiManager;

      let assistantServiceAvailable = false;
      if (typeof assistantService === 'object' &&
        typeof assistantService.generateResponse === 'function' &&
        typeof assistantService.isReady === 'function') {
        assistantServiceAvailable = assistantService.isReady();
      }

      logger.debug(`[ChatManager] OpenAI Assistant Service (via window.openaiManager) Available: ${assistantServiceAvailable}`);
      if (assistantService && typeof assistantService.isReady === 'function') {
        // Log current state of openaiManager, isReady() call will auto-correct isInitialized if needed.
        logger.debug(`[ChatManager] window.openaiManager details: apiKey=${!!assistantService.apiKey}, isInitialized=${assistantService.isInitialized}, isReady=${assistantService.isReady()}`);
      } else if (assistantService) {
        logger.debug(`[ChatManager] window.openaiManager details: apiKey=${!!assistantService.apiKey}, isInitialized=${assistantService.isInitialized}, isReady method not found.`);
      }


      if (assistantServiceAvailable) {
        logger.log('[ChatManager] Using OpenAI Assistant...');
        console.log('[ChatManager] Payload to assistant →', context);
        showSimpleAlert('Consulting the OpenAI Assistant...', 'info');

        // Get response as plain text
        const responseText = await assistantService.generateResponse(context);

        // Always treat as simple plain text
        const replyText = typeof responseText === 'string'
          ? responseText
          : (responseText.toString() || "No response received");

        this.insertResponseInInputField(replyText);
        showSimpleAlert('Response inserted. Review and send.', 'info');
        await this.markChatAsRead();
        return { text: replyText };
      }
      // NO AI SERVICE AVAILABLE
      else {
        logger.warn('[ChatManager] No AI services available (window.openaiManager not configured or not ready).');
        const productInfo = context.productDetails ? `${context.productDetails.title} (${context.productDetails.price})` : 'No product information';
        const helpText = `You are in a conversation as ${roleText}.\nProduct: ${productInfo}\nNo AI services configured. Please check options.`;
        showSimpleAlert(helpText, 'info');
        if (assistantService) {
          logger.debug(helpText + `\n[ChatManager] Debug: window.openaiManager ready state: ${assistantService.isReady ? assistantService.isReady() : 'isReady method missing'}, isInitialized: ${assistantService.isInitialized}`);
        } else {
          logger.debug(helpText + `\n[ChatManager] Debug: window.openaiManager is not an object.`);
        }
        return { text: helpText, error: true, refusalReason: "No AI service configured" };
      }
    } catch (error) {
      logger.error(`[ChatManager] Critical error in handleResponse: ${error.message}`, {}, error);
      // Avoid duplicate alerts if a more specific one was already shown
      if (!error.message.includes("API Error:") &&
        !error.message.includes("parsing issue") &&
        !error.message.includes("unsafe") &&
        !error.message.includes("Could not generate a valid structured response")) {
        showSimpleAlert(`Error generating response: ${error.message}`, 'error');
      }
      throw error;
    }
  }

  /**
   * Inserts the generated response directly into the chat input field and sends it if configured
   * @param {string} text - Text of the response to insert
   * @returns {boolean} - True if it was inserted correctly
   */
  insertResponseInInputField(text) {
    try {
      const inputField = document.querySelector(CONFIG.selectors.activeChat.messageInput);
      if (!inputField) {
        logger.error('Message input field not found');
        return false;
      }

      // Verify if we are in AUTO mode to apply greater protection
      const isAutoMode = window.CONFIG?.operationMode === 'auto';
      logger.debug(`Operation mode when inserting response: ${isAutoMode ? 'AUTO' : 'MANUAL'}`);

      // PHASE 1: Previous cleaning with delay to ensure Facebook is ready
      setTimeout(() => {
        // First try to clean with openaiManager - more aggressive if we are in AUTO
        if (window.openaiManager && typeof window.openaiManager.clearInputField === 'function') {
          window.openaiManager.clearInputField();
          logger.debug('First cleaning phase completed with openaiManager');
        }

        // PHASE 2: Additional direct cleaning, more intense in AUTO
        this.forceCleanInputField(inputField);
        logger.debug('Second direct cleaning phase completed');

        // PHASE 3: Verify the cleaning status before inserting
        const isContentEditable = inputField.getAttribute('contenteditable') === 'true';
        const currentContent = isContentEditable ? 
          (inputField.textContent || '').trim() : 
          (inputField.value || '').trim();

        if (currentContent) {
          logger.warn(`Field is NOT empty after two cleaning attempts. Current content: "${currentContent.substring(0, 20)}..."`);
          // PHASE 4: Emergency cleaning as a last resort
          this.emergencyCleanField(inputField);

          // In AUTO mode, wait a little longer to ensure complete cleaning
          if (isAutoMode) {
            logger.debug('AUTO mode detected, applying additional pause to ensure complete cleaning');
            setTimeout(() => {
              this.insertTextAndPotentiallySend(inputField, text, isAutoMode);
            }, 500);
            return true;
          }
        }

        // PHASE 5: Insert the text after a small delay so that the cleaning takes effect
        setTimeout(() => {
          this.insertTextAndPotentiallySend(inputField, text, isAutoMode);
        }, 100);
      }, isAutoMode ? 300 : 0); // Greater delay in AUTO mode

      return true;
    } catch (error) {
      logger.error(`Error inserting response in input field: ${error.message}`);
      return false;
    }
  }

  /**
   * Separate method to insert text and potentially send it
   * @param {HTMLElement} inputField - Input field
   * @param {string} text - Text to insert
   * @param {boolean} isAutoMode - If we are in automatic mode
   */
  insertTextAndPotentiallySend(inputField, text, isAutoMode) {
    try {
      logger.debug('Inserting text in input field');
      domUtils.insertTextIntoField(inputField, text);

      // Send the message automatically only if both conditions
      if (CONFIG.autoSendMessages && isAutoMode) {
        logger.debug('Automatic sending activated in AUTO mode, sending message...');

        // MODIFIED: Longer waiting time before verifying the text and sending
        // The previous value was too short, now we use a larger configurable delay
        const sendDelay = CONFIG.sendMessageDelay || 2000; // Minimum 2 seconds by default
        logger.debug(`Waiting ${sendDelay}ms before sending so that Facebook processes the text...`);

        setTimeout(() => {
          // Verify once more that the inserted text is what we want to send
          const finalText = inputField.getAttribute('contenteditable') === 'true' ?
            (inputField.textContent || '') :
            (inputField.value || '');

          if (finalText.trim() === text.trim()) {
            logger.debug('Text verified, sending message...');
            this.sendMessage(true); // Pass true to indicate that it is a sending attempt after inserting text
          } else {
            logger.warn(`The final text (${finalText.length} chars) does not match the expected one (${text.length} chars), aborting automatic sending`);
          }
        }, sendDelay);
      } else {
        if (!CONFIG.autoSendMessages) {
          logger.debug('Automatic sending deactivated (autoSendMessages: false)');
        } else if (!isAutoMode) {
          logger.debug(`MANUAL mode detected (operationMode: ${window.CONFIG?.operationMode})`);
        }
      }
    } catch (error) {
      logger.error(`Error in insertTextAndPotentiallySend: ${error.message}`);
    }
  }

  /**
   * Sends the message by clicking on the send button or simulating the Enter key
   * @param {boolean} isAfterInsert - Indicates if it is an attempt after inserting text
   * @returns {boolean} - True if the message could be sent
   */
  sendMessage(isAfterInsert = false) {
    try {
      // NEW: Detailed log about the sending attempt
      logger.debug(`Initiating message sending attempt (${isAfterInsert ? 'after inserting text' : 'direct'})`);

      // Strategy 1: Click on the send button with improved selectors
      // IMPROVEMENT: Use more specific selectors and verify visibility/enablement
      const sendButtonSelectors = [
        ...CONFIG.selectors.activeChat.sendButton, // Use the configured ones
        'div[aria-label="Press enter to send"]', // Common button in new version
        'div[aria-label="Pulsa Intro para enviar"]', // Spanish version
        'div[role="button"][tabindex="0"][style*="transform: translateY(0px)"]', // Transformed visible button
        'div.xjbqb8w:not([style*="opacity: 0"])', // Button with visible opacity
        'div.x1i10hfl[role="button"]:not(.x1hc1fzr)' // Generic non-hidden button
      ];

      // Log for debugging
      logger.debug(`Searching for send button with ${sendButtonSelectors.length} selectors...`);

      // Search for the button with any of the selectors
      const sendButton = domUtils.findElement(sendButtonSelectors);

      if (sendButton) {
        // NEW: Verify that the button is visible and enabled before clicking
        const rect = sendButton.getBoundingClientRect();
        const styles = window.getComputedStyle(sendButton);
        const isVisible = rect.width > 0 && rect.height > 0 &&
          styles.visibility !== 'hidden' &&
          styles.display !== 'none' &&
          styles.opacity !== '0';

        if (isVisible) {
          logger.debug(`Send button found and visible (${rect.width}x${rect.height}), clicking...`);

          // IMPROVEMENT: Add small delay before the click to give Facebook time
          setTimeout(() => {
            try {
              // Try a normal click
              sendButton.click();
              logger.log('Message sent by clicking on the button');
              this.markChatAsRead();
              return true;
            } catch (clickError) {
              // If the normal click fails, try simulating a click event
              logger.warn(`Error when doing normal click: ${clickError.message}, trying simulated event...`);
              try {
                sendButton.dispatchEvent(new MouseEvent('click', {
                  bubbles: true,
                  cancelable: true,
                  view: window
                }));
                logger.log('Message sent using simulated click event');
                this.markChatAsRead();
                return true;
              } catch (eventError) {
                logger.error(`Error simulating click event: ${eventError.message}`);
              }
            }
          }, 100); // Small delay before the click
        } else {
          logger.warn(`Send button found but NOT visible/enabled. Using alternative method.`);
        }
      } else {
        logger.debug('Send button not found, trying with Enter key...');
      }

      // Strategy 2: Simulate Enter key in the input field
      const inputField = document.querySelector(CONFIG.selectors.activeChat.messageInput);
      if (inputField) {
        logger.debug('Simulating Enter key in the input field...');

        // Use the simulateKeyPress method from domUtils
        if (domUtils.simulateKeyPress(inputField, 'Enter', 13)) {
          logger.log('Message sent simulating Enter key with domUtils.simulateKeyPress');
          this.markChatAsRead();
          return true;
        }

        // Alternative strategy if the previous one fails
        inputField.focus();
        const enterEvent = new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true
        });

        const sent = inputField.dispatchEvent(enterEvent);

        if (sent) {
          logger.log('Message sent simulating Enter key with KeyboardEvent');
          this.markChatAsRead();
          return true;
        } else {
          logger.warn('The event was not sent correctly');
        }

        // Strategy 3: Use execCommand (alternative method)
        try {
          if (document.execCommand('insertText', false, '\n')) {
            logger.log('Message sent using execCommand insertText');
            this.markChatAsRead();
            return true;
          }
        } catch (execError) {
          logger.error(`Error using execCommand: ${execError.message}`);
        }

        // NEW: Strategy 4 - Try resending after a while if it is the first attempt
        if (!isAfterInsert) {
          logger.debug('First attempt failed, scheduling retry after 1 second...');
          setTimeout(() => this.sendMessage(true), 1000);
          return true; // Indicate that the retry has been scheduled
        }
      }

      logger.error('Could not send the message after all attempts');
      return false;
    } catch (error) {
      logger.error(`Error sending message: ${error.message}`, {}, error);
      return false;
    }
  }

  /**
   * Additional method to force cleaning of the input field directly
   * @param {HTMLElement} inputField - Input field to clean
   */
  forceCleanInputField(inputField) {
    try {
      if (!inputField) return;

      const isContentEditable = inputField.getAttribute('contenteditable') === 'true';

      if (isContentEditable) {
        // Clean HTML and text content
        inputField.innerHTML = '';
        inputField.textContent = '';

        // Use selection and delete command
        try {
          const selection = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(inputField);
          selection.removeAllRanges();
          selection.addRange(range);
          document.execCommand('delete', false, null);
        } catch (e) {
          logger.debug(`Error using selection to clean: ${e.message}`);
        }
      } else {
        inputField.value = '';
      }

      // Trigger events
      ['input', 'change', 'keyup'].forEach(eventType => {
        const event = new Event(eventType, { bubbles: true });
        inputField.dispatchEvent(event);
      });
    } catch (error) {
      logger.debug(`Error in forced cleaning: ${error.message}`);
    }
  }

  /**
   * Emergency method to clean a field that does not respond to normal methods
   * @param {HTMLElement} inputField - Input field to clean
   */
  emergencyCleanField(inputField) {
    try {
      // 1. Try replacing the node completely
      if (inputField.parentNode) {
        const newField = inputField.cloneNode(false); // Clone without content
        inputField.parentNode.replaceChild(newField, inputField);

        // 2. Simulate keyboard events to delete content
        const keyEvents = [
          new KeyboardEvent('keydown', { key: 'Control', keyCode: 17, bubbles: true }),
          new KeyboardEvent('keydown', { key: 'a', keyCode: 65, bubbles: true }),
          new KeyboardEvent('keyup', { key: 'a', keyCode: 65, bubbles: true }),
          new KeyboardEvent('keyup', { key: 'Control', keyCode: 17, bubbles: true }),
          new KeyboardEvent('keydown', { key: 'Delete', keyCode: 46, bubbles: true }),
          new KeyboardEvent('keyup', { key: 'Delete', keyCode: 46, bubbles: true })
        ];

        keyEvents.forEach(event => newField.dispatchEvent(event));
        logger.debug('Emergency cleaning applied (node replacement)');
      } else {
        logger.warn('Could not apply emergency cleaning: the field has no parent node');
      }
    } catch (error) {
      logger.debug(`Error in emergency cleaning: ${error.message}`);
    }
  }

  /**
   * Sends the message by clicking on the send button or simulating the Enter key
   * @returns {boolean} - True if the message could be sent
   */
  sendMessage() {
    try {
      // Strategy 1: Click on the send button
      const sendButton = domUtils.findElement(CONFIG.selectors.activeChat.sendButton);

      if (sendButton) {
        logger.debug('Send button found, clicking...');
        sendButton.click();
        logger.log('Message sent by clicking on the button');
        return true;
      }

      // Strategy 2: Simulate Enter key in the input field
      const inputField = document.querySelector(CONFIG.selectors.activeChat.messageInput);
      if (inputField) {
        logger.debug('Simulating Enter key in the input field...');

        // Use the new simulateKeyPress method from domUtils
        if (domUtils.simulateKeyPress(inputField, 'Enter', 13)) {
          logger.log('Message sent simulating Enter key with simulateKeyPress');
          return true;
        }

        // Alternative strategy if the previous one fails
        inputField.focus();
        const enterEvent = new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true
        });

        const sent = inputField.dispatchEvent(enterEvent);

        if (sent) {
          logger.log('Message sent simulating Enter key');
          return true;
        } else {
          logger.warn('The keydown event was not processed by the input field');
        }

        // Strategy 3: Use execCommand (alternative method)
        try {
          document.execCommand('insertText', false, '\n');
          logger.log('Message sent using execCommand');
          return true;
        } catch (execError) {
          logger.debug(`execCommand failed: ${execError.message}`);
        }
      }

      logger.error('Could not send the message - send button or input field not found');
      return false;
    } catch (error) {
      logger.error(`Error sending message: ${error.message}`, {}, error);
      return false;
    }
  }

  /**
   * Processes a chat and decides whether to generate an automatic response
   * @param {string} chatId 
   */
  async processChatAndAutoRespond(chatId) {
    try {
      logger.log(`Extracting data from chat ${chatId}`);

      // FIX: Correctly verify the operation mode
      const autoMode = window.CONFIG?.operationMode === 'auto';

      // Verify FIRST if automatic mode is enabled
      // This avoids extracting data unnecessarily when we are in manual mode
      if (!autoMode) {
        logger.debug(`Auto-response deactivated for chat ${chatId}. The current mode is: ${window.CONFIG?.operationMode}`);
        return false;
      }

      // FIX: Additional log for diagnosis
      logger.log(`Automatic mode activated (operationMode: ${window.CONFIG?.operationMode}), processing automatic response...`);

      const chatData = await this.extractChatData(chatId);

      if (!chatData.success) {
        logger.error(`Error extracting chat data for automatic response: ${chatData.error || 'Unknown error'}`);
        return false;
      }

      // We already know that we are in automatic mode, we proceed with the response
      logger.debug(`AUTO mode activated (${window.CONFIG?.operationMode}), processing automatic response`);

      // Verify that responseManager exists for automatic response
      if (!window.responseManager) {
        logger.error('responseManager not found to process automatic response');
        return false;
      }

      // Verify availability of OpenAI Manager for automatic mode
      if (!window.openaiManager) {
        logger.error('openaiManager not found to process automatic response');
        return false;
      }

      // Verify if OpenAI Manager is ready
      const openaiReady = typeof window.openaiManager.isReady === 'function' ?
        window.openaiManager.isReady() :
        (window.openaiManager.apiKey && window.openaiManager.isInitialized);

      if (!openaiReady) {
        logger.error('OpenAI Manager is not ready to process automatic response');
        return false;
      }

      // Call processAutoResponse directly
      const result = await window.responseManager.processAutoResponse(chatId, chatData.chatData);

      // FIX: Additional log for diagnosis
      logger.log(`Result of processAutoResponse: ${result ? 'success' : 'failed'}`);
      return result;

    } catch (error) {
      logger.error(`Error processing chat for automatic response: ${error.message}`, {}, error);
      showSimpleAlert(`Error processing automatic response: ${error.message}`, 'error');
      return false;
    }
  }

  /**
   * Marks the current chat as read to avoid duplicate responses
   * @param {string} chatId - Chat ID to mark as read (optional, uses current if not provided)
   * @returns {Promise<boolean>} - True if it could be marked as read
   */
  async markChatAsRead(chatId = null) {
    const targetChatId = chatId || this.currentChatId;

    if (!targetChatId) {
      logger.error('No chat ID to mark as read');
      return false;
    }

    logger.log(`Attempting to mark chat as read: ${targetChatId}`);

    try {
      // Method 1: Find and click the unread message indicator
      // These selectors may need adjustments depending on Facebook's current structure
      const unreadIndicatorSelectors = [
        // Specific "mark as read" buttons/indicators
        'div[aria-label="Marcar como leído"]',
        'div[aria-label="Mark as read"]',
        'div[aria-label*="read"][role="button"]',
        // General elements that indicate unread messages
        'div.xuk3077[role="row"] div[aria-label*="unread"]',
        'div.x78zum5[role="row"] div.xzg4506:not(:empty)',
        'div[role="grid"] div[role="row"] div.xzg4506:not(:empty)' // Generic unread indicator
      ];

      // Try to find any unread indicator in this chat
      let unreadElement = null;

      // If we are in the active chat, search directly in the DOM
      if (document.querySelector(`[data-thread-id="${targetChatId}"]`) ||
        document.querySelector(`[href*="${targetChatId}"]`)) {

        for (const selector of unreadIndicatorSelectors) {
          unreadElement = document.querySelector(selector);
          if (unreadElement) {
            logger.debug(`Found unread message indicator with selector: ${selector}`);
            break;
          }
        }
      }

      // If we found an element, simulate click
      if (unreadElement) {
        logger.debug('Simulating click on "mark as read" indicator');
        this.simulateCompatibleMouseEvents(unreadElement);

        // Verify that the indicator disappeared
        await new Promise(resolve => setTimeout(resolve, 1000));
        if (!document.querySelector(unreadIndicatorSelectors.join(', '))) {
          logger.log('Chat marked as read successfully (indicator disappeared)');
          return true;
        }
      }

      // Method 2: Update an internal Facebook attribute (more advanced)
      // This approach is more technical and may require adjustments when Facebook changes its implementation
      try {
        // Try to find the React data model where Facebook stores read state
        const chatElements = document.querySelectorAll(`[data-thread-id="${targetChatId}"], [href*="${targetChatId}"]`);

        for (const element of chatElements) {
          // Access React instance properties
          const reactKey = Object.keys(element).find(key => key.startsWith('__reactFiber$'));
          if (reactKey) {
            const internalInstance = element[reactKey];
            if (internalInstance) {
              // Navigate through internal structure to find state
              const stateNode = internalInstance.return?.stateNode;
              if (stateNode && typeof stateNode.markRead === 'function') {
                logger.debug('Found Facebook internal markRead function, attempting to use');
                stateNode.markRead();
                logger.log('Chat marked as read using Facebook internal API');
                return true;
              }
            }
          }
        }
      } catch (internalError) {
        logger.debug(`Error attempting to use internal API: ${internalError.message}`);
        // Continue with other methods if this fails
      }

      // Method 3: Simulate complete viewing of chat (usually marks as read)
      if (this.currentChatId === targetChatId) {
        // Find messages container
        const messagesContainer = domUtils.findElement(CONFIG.selectors.activeChat.container);
        if (messagesContainer) {
          // Scroll completely to bottom
          messagesContainer.scrollTop = messagesContainer.scrollHeight;

          // Wait a moment for Facebook to process the action
          await new Promise(resolve => setTimeout(resolve, 1500));
          logger.debug('Chat marked as read by scrolling to most recent messages');
          return true;
        }
      }

      // If we get here, we couldn't explicitly mark as read
      logger.warn(`Could not explicitly mark chat ${targetChatId} as read, but sending response may have done it automatically`);

      // Return true since FB may have marked it automatically when sending message
      return true;
    } catch (error) {
      logger.error(`Error marking chat as read: ${error.message}`);
      return false;
    }
  }
}

// Create an instance and expose it globally
const chatManager = new ChatManager();
window.chatManager = chatManager; // Global export for access from other modules