// ----- CHAT MANAGEMENT -----

// Class to manage the chat queue and processing
class ChatManager {
  constructor() {
    this.pendingChats = []; // Queue of unread chats
    this.currentChatId = null; // ID of the currently open chat
    this.chatHistory = new Map(); // Conversation history by ID
    this.isProcessing = false; // Indicates if we are processing messages
    this.conversationLogs = JSON.parse(localStorage.getItem('FB_CHAT_MONITOR_LOGS') || '[]'); // Conversation logs
    
    // Typing simulation state
    this.typingState = {
      isTyping: false,
      intervalId: null,
      chatId: null
    };
  }
  
  // Scans the inbox for unread chats - VERSION WITHOUT VISUAL EFFECTS
  async scanForUnreadChats() {
    logger.log('Scanning for unread chats...');
    
    try {
      // Get chat list container
      const chatContainer = domUtils.findElement(CONFIG.selectors.chatList.container);
      if (!chatContainer) {
        logger.error('Chat list container not found');
        return 0;
      }
      
      // Get all chat items
      const chatItems = domUtils.findAllElements(CONFIG.selectors.chatList.chatItem, chatContainer);
      logger.log(`Found ${chatItems.length} chat items`);
      
      // Clear the pending chat queue
      this.pendingChats = [];
      
      // Process each item to identify unread chats
      for (const chatItem of chatItems) {
        // Check if it's really an unread chat with stricter validation
        if (this.isUnreadChat(chatItem)) {
          // Extract relevant information
          const chatId = this.extractChatId(chatItem);
          const userName = this.extractChatUsername(chatItem);
          const messageTime = this.extractMessageTime(chatItem);
          
          // VALIDATION: Use only chats with valid numeric IDs
          if (chatId && /^\d+$/.test(chatId)) {
            // Add to the pending queue with its time for prioritization
            this.pendingChats.push({
              chatId,
              userName, 
              element: chatItem,
              messageTime: this.convertTimeToMinutes(messageTime)
            });
            
            logger.debug(`Valid unread chat: ${userName} (${chatId}) - ${messageTime}`);
          } else {
            logger.debug(`Chat ignored due to invalid ID: ${userName} (${chatId})`);
          }
        }
      }
      
      // Sort the queue by time (oldest first)
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
  
  // Determines if a chat is unread using the new optimized selector
  isUnreadChat(chatElement) {
    try {
      // Use the optimized selector to detect unread messages
      const unreadIndicator = chatElement.querySelector(CONFIG.selectors.chatList.unreadIndicator);
      if (unreadIndicator) {
        const text = unreadIndicator.textContent || "";
        // Exclude general Marketplace notifications
        if (!text.includes('Marketplace ·')) {
          logger.debug(`Unread chat detected: "${chatElement.innerText.substring(0, 30)}..."`);
          return true;
        }
      }
      
      // If no specific indicator, check if the name or message has unread format
      const userNameElements = Array.from(chatElement.querySelectorAll(CONFIG.selectors.chatList.chatUserName.selector.join(', ')));
      for (const element of userNameElements) {
        const style = window.getComputedStyle(element);
        if (style && parseInt(style.fontWeight) >= 600) {
          logger.debug(`Unread chat detected by bold font style: "${chatElement.innerText.substring(0, 30)}..."`);
          return true;
        }
      }
      
      // If we get here, consider the chat read
      return false;
    } catch (error) {
      logger.error(`Error evaluating unread chat: ${error.message}`);
      return false;
    }
  }
  
  // Extracts the chat ID from the element - IMPROVED to extract numeric ID
  extractChatId(chatElement) {
    // PRIORITY 1: Get the direct numeric ID from the href (more reliable)
    const href = chatElement.getAttribute('href');
    if (href && href.includes('/marketplace/t/')) {
      const match = href.match(/\/marketplace\/t\/(\d+)\//);
      if (match && match[1]) {
        logger.debug(`ID extracted from href: ${match[1]}`);
        return match[1]; // Numeric ID
      }
    }
    
    // PRIORITY 2: Look for child links that may contain the ID
    const childLinks = chatElement.querySelectorAll('a[href*="/marketplace/t/"]');
    for (const link of childLinks) {
      const childHref = link.getAttribute('href');
      const match = childHref.match(/\/marketplace\/t\/(\d+)\//);
      if (match && match[1]) {
        logger.debug(`ID extracted from child link: ${match[1]}`);
        return match[1]; // Numeric ID
      }
    }
    
    // PRIORITY 3: Data from testid or id of the element
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
  
  // Extracts the chat username using the new selectors with filtering
  extractChatUsername(chatElement) {
    try {
      // If we have an object with selector and filter, use both
      if (Array.isArray(CONFIG.selectors.chatList.chatUserName.selector)) {
        // Use the selector and apply the filter
        const selectors = CONFIG.selectors.chatList.chatUserName.selector.join(', ');
        const nameElements = Array.from(chatElement.querySelectorAll(selectors));
        
        // Apply the filter if it exists
        const filteredElements = CONFIG.selectors.chatList.chatUserName.filter ?
                                CONFIG.selectors.chatList.chatUserName.filter(nameElements) :
                                nameElements;
        
        // If we find filtered elements, use the first one
        if (filteredElements && filteredElements.length > 0) {
          const fullText = filteredElements[0].innerText;
          // Extract only the name part (before the "·")
          const namePart = fullText.split("·")[0].trim();
          return namePart || 'Unknown user';
        }
      } else {
        // Fallback to previous code if for some reason the new structure is not present
        const selectors = Array.isArray(CONFIG.selectors.chatList.chatUserName) ? 
                         CONFIG.selectors.chatList.chatUserName.join(', ') : 
                         CONFIG.selectors.chatList.chatUserName;
        
        const nameElements = Array.from(chatElement.querySelectorAll(selectors));
        
        // Filter to find elements that contain the product separator
        const productNameElements = nameElements.filter(elem => {
          const text = elem.innerText || "";
          return text.includes("·") && !text.includes(":");
        });
        
        // If we find an element with product format, use it
        if (productNameElements.length > 0) {
          const fullText = productNameElements[0].innerText;
          // Extract only the name part (before the "·")
          const namePart = fullText.split("·")[0].trim();
          return namePart || 'Unknown user';
        }
      }
      
      // If we don't find a specific format, use any name element
      const nameElement = Array.from(chatElement.querySelectorAll(CONFIG.selectors.chatList.chatUserName.selector.join(', ')))[0];
      return nameElement?.innerText?.trim() || 'Unknown user';
    } catch (error) {
      logger.error(`Error extracting username: ${error.message}`);
      return 'Unknown user';
    }
  }
  
  // Extracts the time of the last message
  extractMessageTime(chatElement) {
    try {
      // Use the selector to find the timestamp element
      const timeElement = domUtils.findElement(CONFIG.selectors.chatList.timestamp, chatElement);
      return timeElement?.innerText || '0m';
    } catch (error) {
      logger.error(`Error extracting message time: ${error.message}`);
      return '0m';
    }
  }
  
  // Converts time (3m, 2h, 1d, etc.) to minutes for sorting
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
  
  // Opens the next pending chat
  async openNextPendingChat() {
    if (this.pendingChats.length === 0) {
      logger.log('No pending chats');
      return false;
    }
    
    // Ensure chats are properly sorted by priority
    this.pendingChats.sort((a, b) => b.messageTime - a.messageTime);
    
    const nextChat = this.pendingChats.shift();
    logger.log(`Opening chat with ${nextChat.userName} (${nextChat.chatId})`);
    
    try {
      // OPTION 1: Click directly on the element if available
      if (nextChat.element && typeof nextChat.element.click === 'function') {
        logger.log('Using direct click method to open chat');
        
        // Scroll to the element to ensure it's visible
        nextChat.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Notify the user
        logger.notify(`Opening chat: ${nextChat.userName}`, 'info');
        
        // Wait a moment and click
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        nextChat.element.click();
        
        this.currentChatId = nextChat.chatId;
        
        // Wait for the chat to load
        await new Promise(resolve => setTimeout(resolve, 4000));
        
        // Process the chat content
        await this.processCurrentChat();
        
        return true;
      }
      // OPTION 2: Navigate directly by URL if we have a numeric ID
      else if (/^\d+$/.test(nextChat.chatId)) {
        const chatUrl = `https://www.messenger.com/marketplace/t/${nextChat.chatId}/`;
        logger.log(`Navigating to: ${chatUrl}`);
        
        // Notify the user
        logger.notify(`Opening chat by URL: ${nextChat.userName}`, 'info');
        
        // Better to use location.assign which doesn't refresh the whole page
        window.location.assign(chatUrl);
        
        // Wait for the page to load
        this.currentChatId = nextChat.chatId;
        
        // Give time for the page to load
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Process the chat content
        await this.processCurrentChat();
        
        return true;
      }
      
      logger.error('Could not open chat - neither by click nor by URL');
      return false;
    } catch (error) {
      logger.error(`Error opening chat: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Process current chat with enhanced data extraction
   */
  async processCurrentChat() {
    if (!this.currentChatId) {
      logger.error('No active chat to process');
      return;
    }
    
    logger.log(`Processing chat ${this.currentChatId}`);
    
    try {
      // Get the chat container
      const chatContainer = await domUtils.waitForElement(CONFIG.selectors.activeChat.container);
      
      // Determine if we are the seller or buyer
      const isSeller = this.determineIfSeller(chatContainer);
      logger.log(`Role in chat: ${isSeller ? 'seller' : 'buyer'}`);
      
      // Extract product ID and details using the new extractor
      const productId = productExtractor.extractProductIdFromCurrentChat();
      let productDetails = null;
      
      if (productId) {
        logger.log(`Product ID found: ${productId}`);
        productDetails = await productExtractor.getProductDetails(productId);
      }
      
      // Get the message container
      const messagesWrapper = await domUtils.waitForElement(CONFIG.selectors.activeChat.messageWrapper);
      const scrollContainer = domUtils.findElement(
        CONFIG.selectors.activeChat.scrollbar,
        messagesWrapper
      ) || messagesWrapper;
      
      // Scroll to load full history
      await domUtils.scrollToTop(scrollContainer);
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
      
      // Get the full chat history with enhanced content extraction
      const messages = await this.extractChatHistory(messagesWrapper);
      logger.log(`Extracted ${messages.length} messages from chat`);
      
      // Store in history
      this.chatHistory.set(this.currentChatId, {
        messages,
        productDetails,
        isSeller,
        lastUpdated: new Date()
      });
      
      // Generate response based on configured mode
      const context = {
        chatId: this.currentChatId,
        role: isSeller ? 'seller' : 'buyer',
        messages,
        productDetails
      };
      
      await this.handleResponse(context);
      
    } catch (error) {
      logger.error(`Error processing chat: ${error.message}`);
    }
  }

  /**
   * Extract full chat history with rich content
   * @param {HTMLElement} messagesWrapper - Message container
   * @returns {Array} Array of processed messages
   */
  async extractChatHistory(messagesWrapper) {
    logger.debug('Starting enhanced chat history extraction...');
    
    // Ensure the container is fully loaded
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Use existing code for message element detection
    // ...existing code...
    
    const messages = [];
    
    // Find all message elements
    const messageElements = domUtils.findAllElements(CONFIG.selectors.activeChat.messageRow, messagesWrapper);
    
    // Process each message with enhanced content extraction
    for (let i = 0; i < messageElements.length; i++) {
      try {
        const msgElement = messageElements[i];
        const msgText = msgElement.innerText || '';
        
        // Skip empty elements
        if (!msgText) continue;
        
        // Check if it's a divider
        if (this.isDividerElement(msgElement)) continue;
        
        // Extract basic content
        let contentElement = this.findMessageContentElement(msgElement);
        let content = contentElement ? contentElement.innerText.trim() : msgText.trim();
        
        // Skip system messages
        if (this.isSystemMessage(content)) continue;
        
        // Determine sender
        const sentByUs = this.isMessageSentByUs(msgElement);
        
        // Extract timestamp
        let timestamp = new Date().toISOString();
        const timestampElement = this.findTimestampElement(msgElement);
        if (timestampElement) {
          timestamp = timestampElement.getAttribute('title') || 
                     timestampElement.getAttribute('aria-label') || 
                     timestamp;
        }
        
        // Extract rich content
        const richContent = {
          text: content,
          images: this.extractImageURLs(msgElement),
          audio: this.extractAudioURLs(msgElement),
          location: this.extractLocationData(msgElement),
          attachments: this.extractAttachmentInfo(msgElement)
        };
        
        // Add the processed message
        messages.push({
          content: richContent,
          sentByUs,
          timestamp,
          sender: sentByUs ? 'You' : 'Other',
          isSentByYou: sentByUs
        });
        
      } catch (err) {
        logger.error(`Error processing message element: ${err.message}`);
      }
    }
    
    return messages;
  }

  /**
   * Find message content element
   * @param {HTMLElement} messageElement - Message element to search in
   * @returns {HTMLElement|null} Content element or null
   */
  findMessageContentElement(messageElement) {
    // Try multiple selectors for content
    const contentSelectors = Array.isArray(CONFIG.selectors.activeChat.messageContent) 
      ? CONFIG.selectors.activeChat.messageContent 
      : [CONFIG.selectors.activeChat.messageContent];
    
    for (const selector of contentSelectors) {
      const element = messageElement.querySelector(selector);
      if (element) return element;
    }
    
    return null;
  }

  /**
   * Find timestamp element
   * @param {HTMLElement} messageElement - Message element
   * @returns {HTMLElement|null} Timestamp element or null
   */
  findTimestampElement(messageElement) {
    // Try multiple selectors for timestamp
    const timestampSelectors = Array.isArray(CONFIG.selectors.activeChat.messageTimestamp) 
      ? CONFIG.selectors.activeChat.messageTimestamp 
      : [CONFIG.selectors.activeChat.messageTimestamp];
    
    for (const selector of timestampSelectors) {
      const element = messageElement.querySelector(selector);
      if (element) return element;
    }
    
    return null;
  }

  /**
   * Extract image URLs from a message
   * @param {HTMLElement} messageElement - Message element
   * @returns {Array} Array of image URLs
   */
  extractImageURLs(messageElement) {
    const images = [];
    const imgElements = messageElement.querySelectorAll('img:not(.emoji):not(.sticker)');
    
    imgElements.forEach(img => {
      // Filter out avatars and small icons
      if (img.offsetWidth > 50 && img.offsetHeight > 50) {
        const highResSrc = img.getAttribute('data-large-preview') || 
                         img.getAttribute('data-full-size') || 
                         img.src.replace(/\/[sc]\d+x\d+\//, '/');
        images.push(highResSrc);
      }
    });
    
    return images;
  }

  /**
   * Extract audio URLs from a message
   * @param {HTMLElement} messageElement - Message element
   * @returns {Array} Array of audio URLs
   */
  extractAudioURLs(messageElement) {
    const audioURLs = [];
    const audioElements = messageElement.querySelectorAll('audio, [data-audio-uri]');
    
    audioElements.forEach(audio => {
      if (audio.tagName === 'AUDIO') {
        const source = audio.querySelector('source');
        if (source && source.src) audioURLs.push(source.src);
        else if (audio.src) audioURLs.push(audio.src);
      } else {
        const audioURI = audio.getAttribute('data-audio-uri');
        if (audioURI) audioURLs.push(audioURI);
      }
    });
    
    return audioURLs;
  }

  /**
   * Extract location data from a message
   * @param {HTMLElement} messageElement - Message element
   * @returns {Object|null} Location data or null
   */
  extractLocationData(messageElement) {
    const locationContainers = messageElement.querySelectorAll('.location-attachment, [data-geo]');
    if (locationContainers.length === 0) return null;
    
    const locationData = {};
    
    for (const container of locationContainers) {
      // Place name
      const nameEl = container.querySelector('.location-name');
      if (nameEl) locationData.placeName = nameEl.textContent.trim();
      
      // Coordinates
      const geoData = container.getAttribute('data-geo');
      if (geoData) {
        try {
          const geo = JSON.parse(geoData);
          locationData.latitude = geo.latitude;
          locationData.longitude = geo.longitude;
        } catch (e) {
          logger.error('Error parsing location data', e);
        }
      }
    }
    
    return Object.keys(locationData).length > 0 ? locationData : null;
  }

  /**
   * Extract attachment information
   * @param {HTMLElement} messageElement - Message element
   * @returns {Array} Array of attachment objects
   */
  extractAttachmentInfo(messageElement) {
    const attachments = [];
    const attachmentElements = messageElement.querySelectorAll('[data-attachment], [role="button"][aria-label*="file"]');
    
    attachmentElements.forEach(element => {
      try {
        const label = element.getAttribute('aria-label') || '';
        const fileType = this.determineFileType(label);
        
        attachments.push({
          type: fileType,
          name: label.replace('file', '').trim(),
          url: element.getAttribute('href') || ''
        });
      } catch (e) {
        // Ignore errors for individual attachments
      }
    });
    
    return attachments;
  }
  
  /**
   * Determine file type from label
   * @param {string} label - Attachment label
   * @returns {string} File type
   */
  determineFileType(label) {
    label = label.toLowerCase();
    if (label.includes('.pdf')) return 'pdf';
    if (label.includes('.doc') || label.includes('.word')) return 'document';
    if (label.includes('.xls') || label.includes('.excel')) return 'spreadsheet';
    if (label.includes('.zip') || label.includes('.rar')) return 'archive';
    return 'file';
  }
  
  // Extracts the product link
  extractProductLink(chatContainer) {
    const productLinkElement = domUtils.findElement(CONFIG.selectors.activeChat.productLink, chatContainer);
    return productLinkElement?.href || null;
  }
  
  // Extracts the full chat history - MODIFIED VERSION WITHOUT VISUAL HIGHLIGHTING
  async extractChatHistory(messagesWrapper) {
    logger.debug('Starting chat history extraction...');
    
    // Ensure the container is fully loaded
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Detect if we are using the new or old message format
    let messageElements = [];
    
    try {
      // Handle messageRow as string or array
      const messageRowSelectors = Array.isArray(CONFIG.selectors.activeChat.messageRow) 
        ? CONFIG.selectors.activeChat.messageRow 
        : [CONFIG.selectors.activeChat.messageRow];
      
      // Try each selector as a whole (not character by character)
      for (const rowSelector of messageRowSelectors) {
        logger.debug(`Trying complete selector: ${rowSelector}`);
        try {
          const elements = domUtils.findAllElements(rowSelector, messagesWrapper);
          logger.debug(`Selector '${rowSelector}' found ${elements.length} elements`);
          
          if (elements.length > 0) {
            messageElements = elements;
            logger.debug(`Using successful selector: ${rowSelector}`);
            break;
          }
        } catch (e) {
          logger.debug(`Error with selector: ${e.message}`);
        }
      }
      
      // If still no messages found, try alternative search
      if (messageElements.length === 0) {
        logger.debug('Trying alternative message search...');
        
        // Get all divs that might contain messages
        const allDivs = messagesWrapper.querySelectorAll('div');
        messageElements = Array.from(allDivs).filter(div => {
          // Filter to find elements that look like messages
          const hasText = div.innerText && div.innerText.length > 3;
          const notTooDeep = div.querySelectorAll('div').length < 5; // Not too many nested divs
          return hasText && notTooDeep;
        });
        
        logger.debug(`Alternative search found ${messageElements.length} possible messages`);
      }
      
      const messages = [];
      
      logger.debug(`Processing ${messageElements.length} message elements...`);
      
      for (let i = 0; i < messageElements.length; i++) {
        try {
          const msgElement = messageElements[i];
          // Get text for debugging
          const msgText = msgElement.innerText || '';
          const msgIndex = i;
          
          // Skip empty elements
          if (!msgText) {
            logger.debug(`[Msg #${msgIndex}] Skipping message with no text`);
            continue;
          }
          
          // Check if it's a divider (implementing the missing function)
          if (this.isDividerElement(msgElement)) {
            logger.debug(`[Msg #${msgIndex}] Skipping divider: "${msgText.substring(0, 20)}..."`);
            continue;
          }
          
          // Log for debugging
          logger.debug(`[Msg #${msgIndex}] Analyzing message: "${msgText.substring(0, 30)}..."`);
          
          // Extract message content - try multiple selectors
          let contentElement = null;
          let content = '';
          
          // Ensure messageContent is an array to iterate over it
          const contentSelectors = Array.isArray(CONFIG.selectors.activeChat.messageContent) 
            ? CONFIG.selectors.activeChat.messageContent 
            : [CONFIG.selectors.activeChat.messageContent];
          
          // Try to find the message content using multiple selectors
          for (const contentSelector of contentSelectors) {
            contentElement = domUtils.findElement(contentSelector, msgElement);
            if (contentElement && contentElement.innerText) {
              content = contentElement.innerText.trim();
              logger.debug(`[Msg #${msgIndex}] Content found with selector: ${contentSelector}`);
              break;
            }
          }
          
          // If no content found with selectors, use the full element innerText
          if (!content) {
            content = msgText.trim();
            logger.debug(`[Msg #${msgIndex}] Using full text as content`);
          }
          
          // Filter system messages (implementing the missing function)
          if (this.isSystemMessage(content)) {
            logger.debug(`[Msg #${msgIndex}] Ignoring system message: "${content.substring(0, 20)}..."`);
            continue;
          }
          
          // Determine if it was sent by us
          const sentByUs = this.isMessageSentByUs(msgElement);
          logger.debug(`[Msg #${msgIndex}] Message sent by: ${sentByUs ? 'US' : 'OTHER'}`);
          
          // Extract timestamp
          let timestamp = new Date().toISOString();
          
          // Ensure messageTimestamp is an array to iterate over it
          const timestampSelectors = Array.isArray(CONFIG.selectors.activeChat.messageTimestamp) 
            ? CONFIG.selectors.activeChat.messageTimestamp 
            : [CONFIG.selectors.activeChat.messageTimestamp];
          
          for (const timestampSelector of timestampSelectors) {
            const timestampElement = domUtils.findElement(timestampSelector, msgElement);
            if (timestampElement && (timestampElement.getAttribute('title') || timestampElement.getAttribute('aria-label'))) {
              timestamp = timestampElement.getAttribute('title') || timestampElement.getAttribute('aria-label') || timestamp;
              break;
            }
          }
          
          // Add the processed message to the array
          messages.push({
            content,
            sentByUs,
            timestamp,
            // For compatibility with processing
            sender: sentByUs ? 'You' : 'Other',
            isSentByYou: sentByUs
          });
          
          logger.debug(`[Msg #${msgIndex}] Message successfully extracted: ${sentByUs ? '[YOU]' : '[OTHER]'} "${content.substring(0, 30)}..."`);
        } catch (err) {
          logger.error(`Error processing message element: ${err.message}`);
        }
      }
      
      logger.log(`Extraction completed: ${messages.length} messages found`);
      
      // Alternative method: If no messages found, try a simpler approach
      if (messages.length === 0) {
        logger.debug('No messages found with the main method. Trying alternative method...');
        return await this.extractChatHistoryAlternative(messagesWrapper);
      }
      
      return messages;
    } catch (error) {
      logger.error(`Error during history extraction: ${error.message}`);
      return []; // Return empty array in case of error
    }
  }
  
  // Alternative method to extract messages when the main one fails (VERSION WITHOUT HIGHLIGHTING)
  async extractChatHistoryAlternative(messagesWrapper) {
    logger.debug('Using alternative method to extract messages...');
    
    try {
      const messages = [];
      
      // Search for all elements that look like messages, with a more basic approach
      const divElements = messagesWrapper.querySelectorAll('div[role="row"]');
      logger.debug(`Alternative method: found ${divElements.length} div[role="row"] elements`);
      
      if (divElements.length === 0) {
        // If no divs with role="row", search for any div with text
        const allDivs = messagesWrapper.querySelectorAll('div');
        const possibleMessageDivs = Array.from(allDivs).filter(div => {
          const text = div.innerText || '';
          return text.length > 5 && 
                 div.children.length < 5 && 
                 !div.querySelector('button') && 
                 !div.querySelector('input') &&
                 !div.querySelector('a[href*="/marketplace/item/"]');
        });
        
        logger.debug(`Alternative method (broad search): found ${possibleMessageDivs.length} possible messages`);
        
        // Process these elements as possible messages
        for (const div of possibleMessageDivs) {
          const text = div.innerText.trim();
          
          // Ignore elements that look like UI controls
          if (text.length < 5 || this.looksLikeUIControl(div)) continue;
          
          // Determine who the message belongs to by position on screen
          const sentByUs = this.determineIfMessageIsMine(div);
          
          messages.push({
            content: text,
            sentByUs,
            timestamp: new Date().toISOString(),
            sender: sentByUs ? 'You' : 'Other',
            isSentByYou: sentByUs
          });
        }
      } else {
        // Process divs with role="row"
        for (const row of divElements) {
          const rowText = row.innerText.trim();
          if (rowText.length < 3 || this.looksLikeDate(rowText)) continue;
          
          // Determine who it belongs to by alignment
          const sentByUs = this.determineIfMessageIsMine(row);
          
          messages.push({
            content: rowText,
            sentByUs,
            timestamp: new Date().toISOString(),
            sender: sentByUs ? 'You' : 'Other',
            isSentByYou: sentByUs
          });
        }
      }
      
      logger.debug(`Alternative method: extracted ${messages.length} messages`);
      
      return messages;
    } catch (error) {
      logger.error(`Error in alternative method: ${error.message}`);
      return [];
    }
  }
  
  /**
   * Determines if we are the seller in this chat using the new indicators
   */
  determineIfSeller(chatContainer) {
    try {
      // Check seller indicators
      for (const selector of CONFIG.selectors.activeChat.sellerIndicators) {
        if (domUtils.findElement(selector, chatContainer)) {
          logger.debug('Role detected: SELLER');
          return true;
        }
      }
      
      // Check buyer indicators
      for (const selector of CONFIG.selectors.activeChat.buyerIndicators) {
        if (domUtils.findElement(selector, chatContainer)) {
          logger.debug('Role detected: BUYER');
          return false;
        }
      }
      
      // If no clear indicators, use the old heuristic
      logger.debug('No clear role indicators found, using alternative heuristic');
      return false;
    } catch (error) {
      logger.error(`Error determining role: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Determines if an element is a divider (date, separator, etc.)
   */
  isDividerElement(element) {
    try {
      // Detailed log for debugging
      const text = element.innerText || '';
      logger.debug(`Analyzing possible divider: "${text.substring(0, 30)}${text.length > 30 ? '...' : ''}" (${element.tagName})`);
      
      // Check if the element has typical divider characteristics
      
      // 1. Check common divider classes
      if (element.classList && 
          (element.classList.contains('x1e56ztr') || 
           element.classList.contains('x78zum5') ||
           element.classList.contains('xh8yej3'))) {
        logger.debug(`Divider detected by class: ${Array.from(element.classList).join(', ')}`);
        return true;
      }
      
      // 2. Check text that is usually dividers (dates, etc.)
      if (/^(Today|Yesterday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Hoy|Ayer|Lunes|Martes|Miércoles|Jueves|Viernes|Sábado|Domingo)$/i.test(text)) {
        logger.debug(`Divider detected by date text: "${text}"`);
        return true;
      }
      
      // 3. Check date patterns (DD/MM/YYYY, etc.)
      if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(text) || 
          /^\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)(\w*)(\s+\d{2,4})?$/i.test(text) ||
          /^\d{1,2}\s+(Ene|Feb|Mar|Abr|May|Jun|Jul|Ago|Sep|Oct|Nov|Dic)(\w*)(\s+\d{2,4})?$/i.test(text)) {
        logger.debug(`Divider detected by date pattern: "${text}"`);
        return true;
      }
      
      // 4. Check if the element has divider structure
      if (element.getAttribute('role') === 'separator' || 
          element.tagName === 'HR' ||
          (element.children.length === 0 && element.parentElement?.getAttribute('role') === 'separator')) {
        logger.debug(`Divider detected by structure/attributes`);
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error(`Error in isDividerElement: ${error.message}`);
      return false; // In case of error, assume it's not a divider
    }
  }

  /**
   * Determines if a message is a system message
   */
  isSystemMessage(messageText) {
    if (!messageText) return false;
    
    // Common system message patterns
    const systemPatterns = [
      /^You sent an attachment\.$/i,
      /^You set the nickname for .* to .*$/i,
      /^You changed the chat colors\.$/i,
      /^You named the group .*$/i,
      /^You added .* to the group\.$/i,
      /^You removed .* from the group\.$/i,
      /^.* left the group\.$/i,
      /^Enviaste un adjunto\.$/i,
      /^Cambiaste los colores del chat\.$/i,
    ];
    
    return systemPatterns.some(pattern => pattern.test(messageText));
  }
  
  /**
   * Determines if a message was sent by the current user
   */
  isMessageSentByUs(messageElement) {
    const alignRight = messageElement.querySelector('[style*="flex-end"]');
    const hasRightClass = messageElement.matches('[style*="margin-left:auto"]');
    return !!(alignRight || hasRightClass);
  }
  
  /**
   * Determines if position is owned by current user in alternative extraction
   */
  determineIfMessageIsMine(div) {
    // Check position on screen - right side is typically user's messages
    const rect = div.getBoundingClientRect();
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
    
    // If positioned in the right 60% of screen, likely from the user
    return rect.left > viewportWidth * 0.4;
  }
  
  /**
   * Checks if text looks like a date
   */
  looksLikeDate(text) {
    return /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(text) || 
           /^(Today|Yesterday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/i.test(text) ||
           /^(Hoy|Ayer|Lunes|Martes|Miércoles|Jueves|Viernes|Sábado|Domingo)$/i.test(text);
  }
  
  /**
   * Checks if element looks like UI control
   */
  looksLikeUIControl(element) {
    // UI controls often have these attributes
    if (element.getAttribute('role') === 'button' || 
        element.getAttribute('role') === 'tab' ||
        element.tagName === 'BUTTON') {
      return true;
    }
    
    // Or contain these terms
    const text = element.innerText.toLowerCase();
    return text.includes('send') || 
           text.includes('attach') || 
           text.includes('enviar') || 
           text.includes('adjuntar');
  }
  
  /**
   * Process the response according to the configured mode
   */
  async handleResponse(context) {
    try {
      // Only respond if the last message is not from us
      const lastMessage = context.messages[context.messages.length - 1];
      if (!lastMessage || lastMessage.sentByUs) {
        logger.debug("No need to respond - last message is ours or no messages");
        return;
      }
      
      // Enhance context with conversation analysis
      const analysis = conversationAnalyzer.analyzeConversation(context.messages, context.productDetails);
      context.analysis = analysis;
      
      logger.debug(`Conversation analysis: Stage=${analysis.stage}, Sentiment=${analysis.sentiment}`);
      
      // Act based on the operation mode
      switch (CONFIG.operationMode) {
        case 'auto':
          await this.handleAutoMode(context);
          break;
          
        case 'manual':
          await this.handleManualMode(context);
          break;
          
        case 'generate':
          await this.handleGenerateMode(context);
          break;
      }
      
      // Log the interaction
      this.logConversation(context);
      
    } catch (error) {
      logger.error(`Error handling response: ${error.message}`);
    }
  }

  /**
   * Handles auto mode response generation and sending
   */
  async handleAutoMode(context) {
    try {
      // Add human-like delay before responding
      const responseDelay = humanSimulator.calculateTypingTime(humanSimulator.getAverageMessageLength());
      
      logger.debug(`Waiting ${responseDelay}ms before responding (human simulation)`);
      await this.delay(responseDelay);
      
      // Start the typing indicator
      await humanSimulator.startTypingIndicator();
      
      // Generate the response using the OpenAI Manager
      let responseText;
      try {
        responseText = await openAIManager.generateResponse(context);
        logger.debug(`AI response generated: "${responseText.substring(0, 30)}..."`);
      } catch (error) {
        logger.error(`Error generating AI response: ${error.message}`);
        responseText = this.getFallbackResponse(context.messages, context.analysis);
      }
      
      // Calculate realistic typing time
      const typingTime = humanSimulator.calculateTypingTime(responseText);
      logger.debug(`Simulating typing for ${Math.round(typingTime/1000)} seconds`);
      await this.delay(typingTime);
      
      // Stop typing indicator
      await humanSimulator.stopTypingIndicator();
      
      // Send the message with human-like behavior
      await this.sendMessageWithHumanBehavior(responseText);
      
      logger.log('Message sent automatically');
      
      // Record in history
      this.saveResponseToHistory(context.chatId, responseText, 'auto');
      
    } catch (error) {
      logger.error(`Auto mode error: ${error.message}`);
      await humanSimulator.stopTypingIndicator();
    }
  }

  /**
   * Method getFallbackResponse that is called in case of error with the API
   */
  getFallbackResponse(messages, analysis = null) {
    // Emergency response for when AI generation fails
    try {
      // If we have conversation analysis, use it for better fallback responses
      if (analysis) {
        // Get suggestions based on analysis
        const suggestions = conversationAnalyzer.generateResponseSuggestions(analysis);
        if (suggestions.length > 0) {
          // Select a random suggestion
          return suggestions[Math.floor(Math.random() * suggestions.length)];
        }
      }
      
      // Otherwise fall back to language detection in the last message
      // Determine the language based on the last received message
      const lastMessage = messages[messages.length - 1]?.content || '';
      
      // Detect if it's Spanish
      if (typeof lastMessage === 'string') {
        if (/[áéíóúñ¿¡]/i.test(lastMessage) || 
            /\b(hola|gracias|buenos días|buenas tardes|disponible)\b/i.test(lastMessage)) {
          return "Hola! Gracias por tu mensaje. Te responderé lo antes posible.";
        } 
      } else if (lastMessage.text) {
        if (/[áéíóúñ¿¡]/i.test(lastMessage.text) || 
            /\b(hola|gracias|buenos días|buenas tardes|disponible)\b/i.test(lastMessage.text)) {
          return "Hola! Gracias por tu mensaje. Te responderé lo antes posible.";
        }
      }
      
      // If not Spanish, respond in English
      return "Hello! Thank you for your message. I'll get back to you as soon as possible.";
    } catch (error) {
      logger.error(`Error generating emergency response: ${error.message}`);
      return "Thank you for your message. I'll respond soon.";
    }
  }

  /**
   * Calculates typing time based on message length - could be removed as we now use humanSimulator
   */
  calculateTypingTime(message) {
    // Delegate to humanSimulator for consistency
    return humanSimulator.calculateTypingTime(message);
  }
  
  /**
   * Starts a typing indicator in the chat - could be removed as we now use humanSimulator
   */
  async startTypingIndicator() {
    return await humanSimulator.startTypingIndicator();
  }
  
  /**
   * Stops the typing indicator - could be removed as we now use humanSimulator
   */
  async stopTypingIndicator() {
    return await humanSimulator.stopTypingIndicator();
  }

  /**
   * Saves a response in the history
   */
  saveResponseToHistory(chatId, responseText, mode) {
    const log = {
      chatId: chatId || this.currentChatId,
      timestamp: new Date().toISOString(),
      mode: mode,
      response: responseText,
      sent: mode !== 'generate'
    };
    
    // Add to the beginning of the array
    this.conversationLogs.unshift(log);
    
    // Limit the size of the history
    if (this.conversationLogs.length > CONFIG.logging.maxStoredConversations) {
      this.conversationLogs = this.conversationLogs.slice(0, CONFIG.logging.maxStoredConversations);
    }
    
    // Save in localStorage
    localStorage.setItem('FB_CHAT_MONITOR_LOGS', JSON.stringify(this.conversationLogs));
  }

  /**
   * Logs the complete conversation
   */
  logConversation(context) {
    if (!CONFIG.logging.saveConversations) return;

    // Extract relevant information
    const log = {
      chatId: context.chatId || this.currentChatId,
      timestamp: new Date().toISOString(),
      role: context.role || 'unknown',
      messageCount: context.messages?.length || 0,
      product: context.productDetails ? {
        id: context.productDetails.id,
        title: context.productDetails.title,
        price: context.productDetails.price
      } : null
    };
    
    logger.debug(`Conversation logged: ${JSON.stringify(log)}`);
  }
  
  /**
   * Sends a message to the current chat
   * @param {string} message - Message to send
   * @returns {Promise<boolean>} Success flag
   */
  async sendMessage(message) {
    if (!this.currentChatId) return logger.error('No active chat to send message to'), false;
    
    try {
      const inputField = domUtils.findElement(CONFIG.selectors.activeChat.messageInput);
      if (!inputField) return logger.error('Message input field not found'), false;
      
      inputField.focus();
      document.execCommand('insertText', false, message);
      
      // If execCommand didn't work, try setting the innerText
      if (!inputField.innerText || inputField.innerText.trim() === '') {
        inputField.innerText = message;
        inputField.dispatchEvent(new Event('input', { bubbles: true }));
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const sendButton = domUtils.findElement(CONFIG.selectors.activeChat.sendButton);
      if (!sendButton) return logger.error('Send button not found'), false;
      
      sendButton.click();
      logger.log(`Message sent: "${message.substring(0, 30)}${message.length > 30 ? '...' : ''}"`);
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      await this.processCurrentChat();
      
      return true;
    } catch (error) {
      logger.error(`Error sending message: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Sends a message with human-like behavior (typos, corrections, etc.)
   */
  async sendMessageWithHumanBehavior(text) {
    const inputField = await domUtils.waitForElement(CONFIG.selectors.activeChat.messageInput);
    if (!inputField) {
      throw new Error("Message input field not found");
    }
    
    // Split into fragments if needed
    const fragments = humanSimulator.shouldSplitMessage(text) ? 
                    humanSimulator.splitTextIntoFragments(text) : 
                    [text];
    
    // Send each fragment
    for (let i = 0; i < fragments.length; i++) {
      if (i > 0) {
        // Delay between fragments
        const fragmentDelay = Math.floor(
          CONFIG.AI.humanSimulation.fragmentDelay[0] + 
          Math.random() * (CONFIG.AI.humanSimulation.fragmentDelay[1] - CONFIG.AI.humanSimulation.fragmentDelay[0])
        );
        
        logger.debug(`Waiting ${fragmentDelay}ms between message fragments`);
        await this.delay(fragmentDelay);
        
        // Start typing again for subsequent fragments
        await humanSimulator.startTypingIndicator();
        await this.delay(humanSimulator.calculateTypingTime(fragments[i]) / 2); // Shorter times for follow-ups
        await humanSimulator.stopTypingIndicator();
      }
      
      // Insert text with possible typo simulation
      const fragment = fragments[i];
      
      // Possibly introduce a typo that will be corrected
      if (CONFIG.AI.humanSimulation.typingErrors.enabled && 
          Math.random() < CONFIG.AI.humanSimulation.typingErrors.probability && 
          fragment.length > 10) {
        await this.simulateTypoAndCorrection(inputField, fragment);
      } else {
        // Normal typing
        this.insertTextIntoField(inputField, fragment);
      }
      
      // Send with Enter key
      await this.sendViaEnter(inputField);
      
      // Brief pause after sending
      await this.delay(300);
    }
  }

  /**
   * Simulates typing a message with a typo and then correcting it
   */
  async simulateTypoAndCorrection(inputField, correctText) {
    // Create a typo version
    const typoVersion = humanSimulator.createTypoVersion(correctText);
    
    if (typoVersion !== correctText) {
      // Type the typo version first
      this.insertTextIntoField(inputField, typoVersion);
      
      // Wait a moment before correction
      const correctionDelay = Math.floor(
        CONFIG.AI.humanSimulation.typingErrors.correctionDelay[0] + 
        Math.random() * (
          CONFIG.AI.humanSimulation.typingErrors.correctionDelay[1] - 
          CONFIG.AI.humanSimulation.typingErrors.correctionDelay[0]
        )
      );
      
      await this.delay(correctionDelay);
      
      // Clear and correct it
      inputField.innerText = '';
      inputField.dispatchEvent(new Event('input', { bubbles: true }));
      this.insertTextIntoField(inputField, correctText);
    } else {
      // Just type it normally if no typo was created
      this.insertTextIntoField(inputField, correctText);
    }
  }

  /**
   * Inserts text into input field
   */
  insertTextIntoField(inputField, text) {
    // Focus the field
    inputField.focus();
    
    // Try several methods to insert text for compatibility
    if (document.execCommand) {
      document.execCommand('insertText', false, text);
    }
    
    // If execCommand didn't work, try setting the innerText
    if (!inputField.innerText || inputField.innerText.trim() === '') {
      inputField.innerText = text;
      inputField.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  /**
   * Sends the current input via Enter key
   */
  async sendViaEnter(inputField) {
    // Focus the input
    inputField.focus();
    
    // Send Enter key event
    const enterEvent = new KeyboardEvent('keypress', {
      bubbles: true,
      cancelable: true,
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13
    });
    inputField.dispatchEvent(enterEvent);
    
    // If Enter doesn't work, try clicking send button
    setTimeout(async () => {
      if (inputField.innerText && inputField.innerText.trim() !== '') {
        const sendButton = domUtils.findElement(CONFIG.selectors.activeChat.sendButton);
        if (sendButton) {
          sendButton.click();
          logger.debug('Used send button as fallback');
        }
      }
    }, 300);
  }

  /**
   * Helper method for delay/sleep
   */
  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Expose the ChatManager instance globally
const chatManager = new ChatManager();
// only one global instance:
window.chatManager = chatManager;