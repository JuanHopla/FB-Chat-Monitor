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
    this.lastProcessedMessageCount = 0; // Counter of processed messages
    this.isProcessingChat = false; // Anti-concurrency flag
    this.respondedChats = new Set(); // Avoids duplicate responses in auto mode
    this.isResponding = false; // New anti-reentrancy flag


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
  // En el método que maneja cambios de chat (_handleUrlChange o similar)
  _handleUrlChange(url) {
    try {
      const oldChatId = this.currentChatId;

      // Extraer nuevo chatId de la URL
      const chatIdMatch = url.match(/\/t\/(\d+)/);
      if (chatIdMatch && chatIdMatch[1]) {
        const newChatId = chatIdMatch[1];

        // Si es un cambio real de chat
        if (newChatId !== oldChatId) {
          this.currentChatId = newChatId;
          console.log(`[ChatManager] Cambio de chat detectado: ${oldChatId} -> ${newChatId}`);

          // NUEVO: Resetear estado de transcripciones para el nuevo chat
          if (window.audioTranscriber && typeof window.audioTranscriber.resetForNewChat === 'function') {
            window.audioTranscriber.resetForNewChat(newChatId);
          }
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

        return true;
      }
      // OPTION 2: Navigate directly by URL if we have a numeric ID
      else if (/^\d+$/.test(nextChat.chatId)) {
        logger.log('Using direct URL navigation to open chat');

        const url = `https://www.messenger.com/marketplace/t/${nextChat.chatId}/`;
        logger.notify(`Navigating to: ${nextChat.userName}`, 'info');

        // Change current location - this will reload the page
        window.location.href = url;
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
   * @returns {Promise<boolean} True if the response was successfully generated
   */
  async generateResponseForCurrentChat() {
    if (!this.currentChatId) {
      logger.error('No active chat to generate response');
      showSimpleAlert('No active chat detected. Please select a chat first.', 'error');
      return false;
    }

    try {
      console.log('[ChatManager] Step 1: Extracting data from the current chat...');
      // Incrementar el contador de chats procesados en modo manual
      if (window.FBChatMonitor && typeof window.FBChatMonitor.incrementChatsProcessed === 'function') {
        window.FBChatMonitor.incrementChatsProcessed();
      }
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
        // Registrar en historial (nueva línea)
        this.logResponseToHistory(context, context.role, response, false);
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
      }

      // Get the messages container
      const messagesWrapper = await domUtils.waitForElement(CONFIG.selectors.activeChat.messageWrapper);

      // NUEVA INTEGRACIÓN: Usar ScrollManager para gestionar el scroll según tipo de hilo
      // Determinar si es un hilo nuevo o existente
      const threadInfo = window.threadStore?.getThreadInfo?.(this.currentChatId);
      const isNewThread = !threadInfo;
      logger.log(`Thread type: ${isNewThread ? 'new' : 'existing'}`);

      // Extraer mensajes según el tipo de hilo
      let messages = [];

      if (window.scrollManager) {
        if (isNewThread) {
          // Para hilos nuevos: hacer scroll completo al inicio
          logger.log('New thread: performing complete scroll to beginning');
          await window.scrollManager.scrollToBeginning({
            onScroll: () => {
              // Detectar audios mientras se hace scroll
              if (window.audioTranscriber) {
                window.audioTranscriber.checkForAudioResources();
              }
            }
          });

          // Extraer mensajes después del scroll completo
          messages = await this.extractChatHistory(messagesWrapper);

          // Restaurar posición original (al final de la conversación)
          await window.scrollManager.restorePosition();

          // Verificar si realmente volvimos al final, si no, forzar scroll
          const scrollContainer = domUtils.findElement(CONFIG.selectors.activeChat.scrollbar, messagesWrapper);
          if (scrollContainer) {
            // Esperar un momento para que se estabilice el DOM
            await new Promise(resolve => setTimeout(resolve, 100));

            // Si el scroll no está en la posición correcta, forzar scroll al final
            if (Math.abs(scrollContainer.scrollHeight - scrollContainer.scrollTop - scrollContainer.clientHeight) > 50) {
              logger.debug('Forcing scroll to bottom after restoration');
              scrollContainer.scrollTop = scrollContainer.scrollHeight;
            }
          }
        } else {
          // Para hilos existentes: intentar cargar hasta el último mensaje conocido
          if (threadInfo?.lastMessageId) {
            logger.log(`Existing thread: scrolling to last known message: ${threadInfo.lastMessageId}`);
            await window.scrollManager.scrollToMessage(threadInfo.lastMessageId);
          }

          // Extraer mensajes visibles
          messages = await this.extractChatHistory(messagesWrapper);

          // NUEVA IMPLEMENTACIÓN: También restaurar posición para hilos existentes
          logger.log('Existing thread: restoring original scroll position');
          await window.scrollManager.restorePosition();

          // También verificar para hilos existentes si volvimos a la posición correcta
          const scrollContainer = domUtils.findElement(CONFIG.selectors.activeChat.scrollbar, messagesWrapper);
          if (scrollContainer) {
            await new Promise(resolve => setTimeout(resolve, 100));

            if (Math.abs(scrollContainer.scrollHeight - scrollContainer.scrollTop - scrollContainer.clientHeight) > 50) {
              logger.debug('Forcing scroll to bottom after restoration for existing thread');
              scrollContainer.scrollTop = scrollContainer.scrollHeight;
            }
          }
        }
      } else {
        // Fallback al método antiguo si scrollManager no está disponible
        logger.warn('ScrollManager not available, using legacy scroll method');
        const scrollContainer = domUtils.findElement(
          CONFIG.selectors.activeChat.scrollbar,
          messagesWrapper
        ) || messagesWrapper;

        // Guardar posición original
        const originalPosition = scrollContainer.scrollTop;

        await domUtils.scrollToTop(scrollContainer);
        messages = await this.extractChatHistory(messagesWrapper);

        // Restaurar posición (al final de la conversación)
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }

      // Determine if we are seller or buyer
      const isSeller = this.determineIfSeller(chatContainer);
      logger.log(`Role in chat: ${isSeller ? 'seller' : 'buyer'}`);

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
   * Combines the old logic with improved scroll/thread detection from the new version.
   * @param {boolean} autoRespond - Whether to automatically generate response
   * @returns {Promise<boolean>} - True if processing was successful
   */
  async processCurrentChat(autoRespond = false) {
    // Explicitly check operation mode if not provided
    if (autoRespond === undefined || autoRespond === null) {
      autoRespond = window.CONFIG?.operationMode === 'auto';
      logger.debug(`Auto-respond not specified, using global setting: ${autoRespond ? 'AUTO' : 'MANUAL'}`);
    }

    // Preventively clear the input field in AUTO mode
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

    // --- BEGIN: Improved scroll/thread logic from new version ---
    try {
      logger.log('Processing current chat with improved scroll/thread logic');
      const chatContainer = document.querySelector(CONFIG.selectors.activeChat.container);
      if (!chatContainer) {
        logger.error('Active chat container not found');
        this.isResponding = false;
        return false;
      }

      const chatId = this.currentChatId;
      if (!chatId) {
        logger.error('Could not extract chat ID');
        this.isResponding = false;
        return false;
      }

      // Get thread info to determine if it's a new or existing thread
      const threadInfo = window.threadStore?.getThreadInfo?.(chatId);
      const isNewThread = !threadInfo;
      logger.debug(`Thread ${isNewThread ? 'NEW' : 'EXISTING'}: ${chatId}`);

      // Prepare messages extraction with scroll logic
      let messages = [];
      const messagesWrapper = chatContainer.querySelector(CONFIG.selectors.activeChat.messageWrapper);

      if (!messagesWrapper) {
        logger.error('Messages wrapper not found');
        this.isResponding = false;
        return false;
      }

      if (isNewThread && window.scrollManager) {
        logger.debug('New thread: performing complete scroll to beginning');
        await window.scrollManager.scrollToBeginning({
          onScroll: () => {
            if (window.audioTranscriber) {
              window.audioTranscriber.checkForAudioResources();
            }
          }
        });
        messages = await this.extractChatHistory(messagesWrapper);
        await window.scrollManager.restorePosition();
        // Ensure scroll is at the end
        const scrollContainer = messagesWrapper.querySelector(CONFIG.selectors.activeChat.scrollbar) ||
          messagesWrapper.querySelector('div[style*="overflow-y: auto"]');
        if (scrollContainer) {
          await new Promise(resolve => setTimeout(resolve, 100));
          if (Math.abs(scrollContainer.scrollHeight - scrollContainer.scrollTop - scrollContainer.clientHeight) > 50) {
            logger.debug('Forcing scroll to bottom after restoration');
            scrollContainer.scrollTop = scrollContainer.scrollHeight;
          }
        }
      } else if (!isNewThread && window.scrollManager && threadInfo?.lastMessageId) {
        logger.debug(`Existing thread: scrolling to last known message: ${threadInfo.lastMessageId}`);
        await window.scrollManager.scrollToMessage(threadInfo.lastMessageId);
        messages = await this.extractChatHistory(messagesWrapper);
        await window.scrollManager.restorePosition();
        const scrollContainer = messagesWrapper.querySelector(CONFIG.selectors.activeChat.scrollbar) ||
          messagesWrapper.querySelector('div[style*="overflow-y: auto"]');
        if (scrollContainer) {
          await new Promise(resolve => setTimeout(resolve, 100));
          if (Math.abs(scrollContainer.scrollHeight - scrollContainer.scrollTop - scrollContainer.clientHeight) > 50) {
            logger.debug('Forcing scroll to bottom after restoration for existing thread');
            scrollContainer.scrollTop = scrollContainer.scrollHeight;
          }
        }
      } else {
        logger.debug('Extracting messages without special scroll');
        messages = await this.extractChatHistory(messagesWrapper);
      }

      // If no messages found, abort
      if (!messages || messages.length === 0) {
        logger.error('No messages found in conversation');
        this.isResponding = false;
        return false;
      }

      // Extract product details and role as in the old method
      let productDetails = null;
      if (typeof this.extractProductDetails === 'function') {
        try {
          productDetails = await this.extractProductDetails(chatContainer);
        } catch (e) {
          logger.warn('Error extracting product details: ' + e.message);
        }
      }
      let isSeller = false;
      if (typeof this.determineIfSeller === 'function') {
        try {
          isSeller = this.determineIfSeller(chatContainer);
        } catch (e) {
          logger.warn('Error determining seller/buyer: ' + e.message);
        }
      }

      // Store in chatHistory for compatibility with old flow
      this.chatHistory.set(chatId, {
        messages,
        productDetails,
        isSeller,
        lastUpdated: new Date()
      });

      // Step 2: Optionally generate response if autoRespond is true
      if (autoRespond) {
        logger.debug(`Automatic response enabled for chat ${chatId} (operationMode: ${window.CONFIG?.operationMode})`);
        const chatData = { messages, productDetails, isSeller };

        if (!chatData || !chatData.messages || chatData.messages.length === 0) {
          logger.warn('No messages found in extracted data, cannot auto-respond.');
          this.isResponding = false;
          return true;
        }

        // Create context for response generation
        const context = {
          chatId,
          role: isSeller ? 'seller' : 'buyer',
          messages,
          productDetails
        };

        try {
          logger.log(`Generating automatic response as ${context.role} for chat ${chatId}`);
          await this.handleResponse(context);
          this.respondedChats.add(chatId); // Mark as responded
          logger.log('Automatic response generated and sent successfully');
          this.isResponding = false;
          return true;
        } catch (responseError) {
          logger.error(`Error during automatic response generation: ${responseError.message}`);
          this.isResponding = false;
          return false;
        }
      } else {
        logger.debug(`Automatic response disabled for chat ${chatId}. Only data was extracted.`);
      }

      this.isResponding = false;
      return true;
    } catch (error) {
      logger.error('Error processing chat', {}, error);
      this.isResponding = false;
      return false;
    }
    // --- END: Improved scroll/thread logic ---
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
 * Busca separadores de fecha/hora en el DOM usando múltiples métodos
 * @returns {Array<Object>} Array de separadores encontrados
 */
  findDateSeparators() {
    const separators = [];

    try {
      // Array de selectores a probar en orden de prioridad
      const selectors = [
        'div[data-scope="date_break"]',           // Selector específico de FB Messenger
        'span.x186z157.xk50ysn',                  // Selector alternativo identificado
        'h4 span.xdj266r',                        // Selector para encabezados
        'div[role="row"] div[aria-hidden="true"]', // Posible selector para separadores
        'div[role="separator"]',                  // Selector genérico para separadores
        'h4'                                      // Encabezados de sección (podría contener fechas)
      ];

      // Intentar cada selector
      let elementsFound = [];
      let successfulSelector = null;

      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          elementsFound = Array.from(elements);
          successfulSelector = selector;
          logger.debug(`Encontrados ${elements.length} posibles separadores de fecha usando ${selector}`);
          break;
        }
      }

      // Si no encontramos nada con selectores, intentar búsqueda por contenido
      if (elementsFound.length === 0) {
        // Buscar elementos que podrían contener textos de fecha (patrones como "10/8/24" o "Today")
        const datePatterns = [
          /\d{1,2}\/\d{1,2}\/\d{2,4}/,          // 10/8/24, 01/15/2024
          /^(Today|Yesterday|Ayer|Hoy)/i,        // Today, Yesterday, etc
          /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i // Jan 15, Oct 8, etc
        ];

        // Buscar span o div con textos que coincidan con estos patrones
        const allTextElements = document.querySelectorAll('span, div[role="row"]');

        elementsFound = Array.from(allTextElements).filter(el => {
          const text = el.textContent.trim();
          return datePatterns.some(pattern => pattern.test(text)) && text.length < 50; // Evitar textos largos
        });

        if (elementsFound.length > 0) {
          logger.debug(`Encontrados ${elementsFound.length} posibles separadores de fecha por patrón de texto`);
          successfulSelector = 'content-pattern';
        }
      }

      // Procesar los elementos encontrados
      elementsFound.forEach((element, index) => {
        try {
          // Obtener el texto
          const dateText = element.textContent.trim();

          // Ignorar si no parece una fecha
          if (!dateText || dateText.length < 5) return;

          // Verificar si contiene un patrón de fecha
          const hasDatePattern = /\d{1,2}\/\d{1,2}\/\d{2,4}|\d{1,2}:\d{2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i.test(dateText);
          if (!hasDatePattern) return;

          // Intentar parsear la fecha
          const timestamp = this.parseDateString(dateText);
          if (!timestamp) return;

          // Encontrar el elemento padre (fila) si existe
          const parentRow = element.closest('div[role="row"]');

          separators.push({
            element: parentRow || element,
            timestamp,
            text: dateText,
            index
          });

          logger.debug(`Separador de fecha #${index + 1}: "${dateText}" (${new Date(timestamp).toLocaleString()})`);
        } catch (e) {
          logger.warn(`Error procesando posible separador de fecha: ${e.message}`);
        }
      });

      // Ordenar por timestamp
      separators.sort((a, b) => a.timestamp - b.timestamp);

      logger.log(`Se encontraron ${separators.length} bloques temporales usando ${successfulSelector || 'ningún selector'}`);
      return separators;
    } catch (error) {
      logger.error(`Error buscando separadores de fecha: ${error.message}`);
      return [];
    }
  }

  /**
   * Extrae el historial de chat completo - VERSIÓN MEJORADA con soporte para bloques temporales
   * @param {HTMLElement} messagesWrapper - Contenedor de mensajes
   * @returns {Promise<Array>} Array de mensajes extraídos
   */
  async extractChatHistory(messagesWrapper) {
    if (this.isProcessingChat) {
      logger.warn('Extracción de historial ya en progreso. Omitiendo.');
      return [];
    }
    if (!messagesWrapper) {
      logger.error('No se proporcionó elemento messagesWrapper a extractChatHistory.');
      return [];
    }

    this.isProcessingChat = true;
    logger.debug('Iniciando extracción del historial de chat...');

    const messages = [];
    const timeBlocks = []; // Array para registrar bloques de tiempo
    let currentTimeBlock = null; // Bloque de tiempo actual
    let messageElements = [];

    try {
      // 1) Obtener selectores desde CONFIG o usar fallback
      const selectors = window.CONFIG?.selectors?.activeChat || {
        messageWrapper: 'div.x4k7w5x > div > div > div, div[role="main"] > div > div > div:last-child > div',
        messageRow: 'div[role="row"]',
        senderAvatar: 'img.x1rg5ohu[alt]:not([alt="Open photo"])'
      };

      // 2) Obtener todas las filas de mensajes
      messageElements = domUtils.findAllElements(selectors.messageRow, messagesWrapper);
      logger.log(`Analizando ${messageElements.length} mensajes en el DOM actual`);

      if (messageElements.length === 0) {
        logger.warn('No se encontraron filas de mensajes con selector:', selectors.messageRow);
        return [];
      }

      // NUEVO: Buscar separadores de fecha antes de procesar mensajes
      const dateSeparators = this.findDateSeparators();

      // Convertir separadores a bloques temporales
      dateSeparators.forEach((separator, idx) => {
        timeBlocks.push({
          timestamp: separator.timestamp,
          element: separator.element,
          text: separator.text,
          index: idx,
          messages: [] // Se llenarán durante el procesamiento
        });
      });

      // Para debugging
      if (timeBlocks.length > 0) {
        logger.debug('Bloques temporales encontrados:');
        timeBlocks.forEach((block, idx) => {
          logger.debug(`  Bloque #${idx + 1}: ${block.text} (${new Date(block.timestamp).toLocaleString()})`);
        });
      }

      // 3) Procesar cada fila de mensaje
      let currentBlockIndex = 0; // Para seguimiento del bloque actual mientras procesamos mensajes

      messageElements.forEach((el, idx) => {
        // Extraer y limpiar texto único
        const nodes = Array.from(el.querySelectorAll('span[dir="auto"], div[dir="auto"]'));
        const texts = [...new Set(
          nodes.map(n => n.textContent.trim())
            .filter(t => t && t.toLowerCase() !== 'enter')
        )];
        const text = texts.join(' ').trim();

        // Determinar tipos especiales
        const isDiv = this.isDividerElement(el);
        const isSys = !isDiv && this.isSystemMessage(text);
        const isReply = !isDiv && !isSys && !!this.detectQuotedMessage(el);

        // --- ACTUALIZADO: Manejo de bloques temporales ---
        // Si tenemos bloques temporales y este elemento es un separador
        if (timeBlocks.length > 0 && isDiv) {
          // Ver si este elemento coincide con alguno de nuestros separadores
          for (let i = 0; i < timeBlocks.length; i++) {
            if (timeBlocks[i].element === el || el.contains(timeBlocks[i].element) || timeBlocks[i].element.contains(el)) {
              currentBlockIndex = i; // Actualizar el índice del bloque actual
              break;
            }
          }
        }

        // Determinar remitente
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

        // OMITIR si es separador o mensaje del sistema
        if (!isDiv && !isSys) {
          const messageData = {
            id: `msg_${this.currentChatId}_${idx}`,
            sentByUs,
            content: {
              text,
              type: "unknown",
              media: {}
            },
            // ACTUALIZADO: Asignar el índice del bloque temporal actual
            timeBlockIndex: timeBlocks.length > 0 ? currentBlockIndex : null
          };

          // Detectar y añadir contenido multimedia
          this.detectAndAddImageContent(el, messageData);
          this.detectAndAddAudioContent(el, messageData);
          this.detectAndAddVideoContent(el, messageData);
          this.detectAndAddFileContent(el, messageData);
          this.detectAndAddLocationContent(el, messageData);

          messages.push(messageData);

          // Agregar también al array del bloque temporal si existe
          if (timeBlocks.length > 0 && currentBlockIndex < timeBlocks.length) {
            timeBlocks[currentBlockIndex].messages.push(messageData);
          }

          logger.debug(`#${idx + 1}: ${messageData.content.type} – ${text.substring(0, 30)}${text.length > 30 ? '…' : ''}`);
        } else {
          logger.debug(`#${idx + 1}: Omitido mensaje ${isDiv ? 'SEPARADOR' : 'SISTEMA'}`);
        }
      });

      this.lastProcessedMessageCount = messages.length;
      logger.log(`Extracción completada: ${messages.length} mensajes encontrados en ${timeBlocks.length} bloques temporales`);

      // Contar mensajes de audio y transcripciones
      const messagesWithAudio = messages.filter(m => m.content?.hasAudio).length;
      const messagesWithTranscription = messages.filter(m =>
        m.content?.hasAudio &&
        m.content.transcribedAudio &&
        m.content.transcribedAudio !== '[Transcription Pending]'
      ).length;

      logger.debug(`Extracción completa: ${messages.length} mensajes (${messagesWithAudio} con audio, ${messagesWithTranscription} con transcripción)`);

      // Emitir evento de extracción completada con los bloques temporales
      const result = {
        messages: messages,
        timeBlocks: timeBlocks
      };

      if (window.eventCoordinator) {
        window.eventCoordinator.emit('chatHistoryExtracted', result);
      }

      return result;

    } catch (error) {
      logger.error('Error durante la extracción del historial del chat:', {}, error);
    } finally {
      this.isProcessingChat = false;
    }

    return { messages: messages, timeBlocks: timeBlocks };
  }

  /**
   * Parsea una cadena de fecha de Messenger a timestamp
   * @param {string} dateText - Texto de fecha a parsear
   * @returns {number|null} Timestamp o null si no es válido
   */
  parseDateString(dateText) {
    if (!dateText) return null;

    try {
      // Formato de Facebook: "10/8/24, 12:23 AM"
      const dateTimeMatch = dateText.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:,\s*(\d{1,2}):(\d{2})(?:\s*(AM|PM))?)?/i);

      if (dateTimeMatch) {
        const [, month, day, yearShort, hour = '0', minute = '0', ampm = ''] = dateTimeMatch;

        // Convertir año de 2 dígitos a 4 dígitos
        const year = yearShort.length === 2 ? 2000 + parseInt(yearShort, 10) : parseInt(yearShort, 10);

        // Convertir hora al formato 24h si es necesario
        let hours = parseInt(hour, 10);
        if (ampm.toUpperCase() === 'PM' && hours < 12) hours += 12;
        if (ampm.toUpperCase() === 'AM' && hours === 12) hours = 0;

        // Crear fecha
        const date = new Date(year, parseInt(month, 10) - 1, parseInt(day, 10), hours, parseInt(minute, 10));
        return date.getTime();
      }

      // Intentar con el formato "October 8, 2024"
      return new Date(dateText).getTime();
    } catch (error) {
      logger.debug(`Error parseando fecha: ${dateText} - ${error.message}`);
      return null;
    }
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
   * Mejorada la detección de audio en mensajes
   * @param {HTMLElement} container - Message container
   * @param {Object} messageData - Message data to update
   */
  detectAndAddAudioContent(container, messageData) {
    // Usar todos los selectores de botones de audio para mejor detección
    const audioButtonSelectors = CONFIG.selectors.activeChat.messageAudioPlayButton;
    let audioButton = null;

    // Intentar cada selector hasta encontrar un botón de audio
    for (const selector of audioButtonSelectors) {
      const buttons = container.querySelectorAll(selector);
      if (buttons.length > 0) {
        audioButton = buttons[0];
        break;
      }
    }

    if (!audioButton) return;

    // Si encontramos un botón de audio, marcar este mensaje como contenedor de audio
    messageData.content.hasAudio = true;

    // Intentar obtener URL directa (rara vez disponible en el DOM)
    const audioElement = container.querySelector('audio[src]');
    if (audioElement && audioElement.src) {
      messageData.content.audioUrl = audioElement.src;
    } else {
      // Si no hay URL directa, generar un marcador único para este audio
      // que podemos usar para asociar más tarde con las transcripciones
      const audioMarkerId = `audio_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      messageData.content.audioMarkerId = audioMarkerId;

      // Añadir al DOM como atributo de datos para facilitar la asociación posterior
      if (audioButton) {
        audioButton.setAttribute('data-audio-marker-id', audioMarkerId);

        // Registrar que estamos esperando este audio para cuando se detecte
        if (window.audioTranscriber) {
          window.audioTranscriber.expectingAudioForMessageId = messageData.id;
          window.audioTranscriber.expectingAudioTimestamp = Date.now();
        }
      }
    }

    // Extraer duración si está disponible
    messageData.content.audioDuration = this.extractAudioDuration(container);
    messageData.content.transcribedAudio = '[Transcription Pending]';
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
        // Registrar en historial (nueva línea)
        this.logResponseToHistory(context, context.role, replyText, CONFIG.operationMode === 'auto');
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
      let messageSent = false; // Solo incrementar una vez

      logger.debug(`Initiating message sending attempt (${isAfterInsert ? 'after inserting text' : 'direct'})`);

      // Strategy 1: Click on the send button con selectores mejorados
      const sendButtonSelectors = [
        ...CONFIG.selectors.activeChat.sendButton,
        'div[aria-label="Press enter to send"]',
        'div[aria-label="Pulsa Intro para enviar"]',
        'div[role="button"][tabindex="0"][style*="transform: translateY(0px)"]',
        'div.xjbqb8w:not([style*="opacity: 0"])',
        'div.x1i10hfl[role="button"]:not(.x1hc1fzr)'
      ];
      logger.debug(`Searching for send button with ${sendButtonSelectors.length} selectors...`);
      const sendButton = domUtils.findElement(sendButtonSelectors);

      if (sendButton) {
        const rect = sendButton.getBoundingClientRect();
        const styles = window.getComputedStyle(sendButton);
        const isVisible = rect.width > 0 && rect.height > 0 &&
          styles.visibility !== 'hidden' &&
          styles.display !== 'none' &&
          styles.opacity !== '0';

        if (isVisible) {
          logger.debug(`Send button found and visible (${rect.width}x${rect.height}), clicking...`);
          setTimeout(() => {
            try {
              sendButton.click();
              logger.log('Message sent by clicking on the button');
              if (!messageSent && window.FBChatMonitor?.incrementResponseSent) {
                messageSent = true;
                window.FBChatMonitor.incrementResponseSent();
              }
              return true;
            } catch (clickError) {
              logger.warn(`Error on normal click: ${clickError.message}, trying simulated event...`);
              try {
                sendButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                logger.log('Message sent using simulated click event');
                if (!messageSent && window.FBChatMonitor?.incrementResponseSent) {
                  messageSent = true;
                  window.FBChatMonitor.incrementResponseSent();
                }
                return true;
              } catch (eventError) {
                logger.error(`Error simulating click event: ${eventError.message}`);
              }
            }
          }, 100);
          return true;
        } else {
          logger.warn('Send button found but NOT visible/enabled. Using alternative method.');
        }
      } else {
        logger.debug('Send button not found, trying with Enter key...');
      }

      // Strategy 2: Simular tecla Enter en el campo
      const inputField = document.querySelector(CONFIG.selectors.activeChat.messageInput);
      if (inputField) {
        logger.debug('Simulating Enter key in the input field...');

        if (domUtils.simulateKeyPress(inputField, 'Enter', 13)) {
          logger.log('Message sent simulating Enter key with domUtils.simulateKeyPress');
          if (!messageSent && window.FBChatMonitor?.incrementResponseSent) {
            messageSent = true;
            window.FBChatMonitor.incrementResponseSent();
          }
          return true;
        }

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
          if (!messageSent && window.FBChatMonitor?.incrementResponseSent) {
            messageSent = true;
            window.FBChatMonitor.incrementResponseSent();
          }
          return true;
        } else {
          logger.warn('The event was not sent correctly');
        }

        try {
          if (document.execCommand('insertText', false, '\n')) {
            logger.log('Message sent using execCommand insertText');
            if (!messageSent && window.FBChatMonitor?.incrementResponseSent) {
              messageSent = true;
              window.FBChatMonitor.incrementResponseSent();
            }
            return true;
          }
        } catch (execError) {
          logger.error(`Error using execCommand: ${execError.message}`);
        }

        // Reintentar una vez si falló el primer intento
        if (!isAfterInsert) {
          logger.debug('First attempt failed, scheduling retry after 1 second...');
          setTimeout(() => this.sendMessage(true), 1000);
          return true;
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
   * @returns {Promise<Object>} Result of the cleaning operation
   */
  forceCleanInputField(inputField) {
    // New implementation: simulate Ctrl+A and Backspace/Delete to clear Messenger input
    return new Promise((resolve) => {
      if (!inputField) return resolve({ exito: false, mensaje: "Campo no encontrado" });

      inputField.focus();
      const contenidoInicial = inputField.textContent?.trim() || "";

      if (!contenidoInicial) return resolve({ exito: true, mensaje: "Campo ya vacío" });

      // Simulate Ctrl+A
      ['keydown', 'keyup'].forEach(type => {
        inputField.dispatchEvent(new KeyboardEvent(type, {
          key: 'Control', code: 'ControlLeft', keyCode: 17, ctrlKey: true, bubbles: true
        }));
        inputField.dispatchEvent(new KeyboardEvent(type, {
          key: 'a', code: 'KeyA', keyCode: 65, ctrlKey: true, bubbles: true
        }));
      });

      setTimeout(() => {
        // Simulate Backspace and Delete
        ['Backspace', 'Delete'].forEach(key => {
          inputField.dispatchEvent(new KeyboardEvent('keydown', { key, code: key, keyCode: key === 'Backspace' ? 8 : 46, bubbles: true }));
          inputField.dispatchEvent(new KeyboardEvent('keyup', { key, code: key, keyCode: key === 'Backspace' ? 8 : 46, bubbles: true }));
        });

        inputField.dispatchEvent(new Event('input', { bubbles: true }));

        setTimeout(() => {
          const contenidoFinal = inputField.textContent?.trim() || "";
          const exito = contenidoFinal === "";
          resolve({
            exito,
            mensaje: exito ? "Campo limpiado con éxito" : "No se pudo limpiar completamente",
            contenidoInicial,
            contenidoFinal
          });
        }, 100);
      }, 50);
    });
  }

  /**
 * Registra una respuesta generada en el historial
 * @param {Object} context - Contexto del chat
 * @param {string} response - Respuesta generada
 * @param {boolean} sent - Si la respuesta fue enviada
 */
  logResponseToHistory(context, role, response, sent = false) {
    try {
      // Obtener historial actual
      const history = storageUtils.get('RESPONSE_LOGS', []);

      // Añadir nueva entrada
      const logEntry = {
        timestamp: Date.now(),
        mode: window.CONFIG?.operationMode || 'manual',
        context: {
          chatId: context.chatId,
          role: role || context.role,
          username: context.username || ''
        },
        response: response,
        sent: sent
      };

      // Añadir al inicio para mostrar los más recientes primero
      history.unshift(logEntry);

      // Limitar a 200 entradas para no ocupar demasiado espacio
      const limitedHistory = history.slice(0, 200);

      // Guardar actualización
      storageUtils.set('RESPONSE_LOGS', limitedHistory);

      // Verificar que response sea un string antes de llamar a substring
      if (typeof response === 'string') {
        logger.debug(`Response logged to history: ${response.substring(0, 30)}...`);
      } else {
        logger.debug(`Response logged to history: ${JSON.stringify(response).substring(0, 30)}...`);
      }
    } catch (error) {
      logger.error(`Error logging response to history: ${error.message}`);
    }
  }
}

// Create an instance and expose it globally
const chatManager = new ChatManager();
window.chatManager = chatManager; // Global export for access from other modules