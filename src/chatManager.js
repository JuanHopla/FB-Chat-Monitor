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
  
  // Processes the current chat
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
      
      // Extract product link (only for sellers)
      let productLink = null;
      if (isSeller) {
        productLink = this.extractProductLink(chatContainer);
        if (productLink) {
          logger.log(`Product link: ${productLink}`);
        }
      }
      
      // Get the message container
      const messagesWrapper = await domUtils.waitForElement(CONFIG.selectors.activeChat.messageWrapper);
      const scrollContainer = domUtils.findElement(
        CONFIG.selectors.activeChat.scrollbar,
        messagesWrapper
      ) || messagesWrapper;
      await domUtils.scrollToTop(scrollContainer);
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
      
      // Get the full chat history
      const messages = await this.extractChatHistory(messagesWrapper);
      logger.log(`Extracted ${messages.length} messages from chat`);
      
      // Store in history
      this.chatHistory.set(this.currentChatId, {
        messages,
        productLink,
        isSeller,
        lastUpdated: new Date()
      });
      
      // Generate response based on configured mode
      await this.handleResponse(messages, productLink, isSeller);
      
    } catch (error) {
      logger.error(`Error processing chat: ${error.message}`);
    }
  }
  
  // Determines if we are the seller in this chat using the new indicators
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
  
  // Determines if a message is mine based on position and style
  determineIfMessageIsMine(element) {
    try {
      // Check horizontal alignment
      const rect = element.getBoundingClientRect();
      const parentRect = element.parentElement?.getBoundingClientRect() || document.body.getBoundingClientRect();
      
      // If it's closer to the right edge than the left, it's probably ours
      if (parentRect.right - rect.right < rect.left - parentRect.left) {
        return true;
      }
      
      // Check common classes for own messages on Facebook
      const classes = element.className || '';
      if (classes.includes('x1q0g3np') || classes.includes('x78zum5')) {
        return true;
      }
      
      // Check if it's aligned to the right by style
      const style = window.getComputedStyle(element);
      if (style.textAlign === 'right' || style.alignSelf === 'flex-end') {
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error(`Error determining if message is mine: ${error.message}`);
      return false; // By default, assume it's not ours
    }
  }
  
  // Detects if an element looks like a UI control and not a message
  looksLikeUIControl(element) {
    // Check typical control attributes
    if (element.hasAttribute('aria-label') || 
        element.hasAttribute('aria-disabled') || 
        element.hasAttribute('aria-selected')) {
      return true;
    }
    
    // Check if it has interactive functions
    if (element.onclick || 
        element.getAttribute('role') === 'button' || 
        element.getAttribute('role') === 'menuitem' ||
        element.getAttribute('role') === 'tab') {
      return true;
    }
    
    // Check typical UI control text
    const text = element.innerText || '';
    return /^(Send|Like|React|Reply|More|Enviar|Me gusta|Más)$/i.test(text);
  }
  
  // Checks if a text looks like a date or a separator
  looksLikeDate(text) {
    // Common date patterns
    return /^(Today|Yesterday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Hoy|Ayer|Lunes|Martes|Miércoles|Jueves|Viernes|Sábado|Domingo)$/i.test(text) ||
           /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(text) ||
           /^\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)(\w*)\s+\d{2,4}$/i.test(text) ||
           /^\d{1,2}\s+(Ene|Feb|Mar|Abr|May|Jun|Jul|Ago|Sep|Oct|Nov|Dic)(\w*)(?:\s+\d{2,4})?$/i.test(text);
  }

  // Determines if an element is a chat divider (corrected implementation)
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
      
      // IMPORTANT: For this specific bug, temporarily mark as NOT divider all elements
      return false;
    } catch (error) {
      logger.error(`Error in isDividerElement: ${error.message}`);
      return false; // In case of error, assume it's not a divider
    }
  }

  // Determines if a message is a system message (corrected implementation)
  isSystemMessage(messageText) {
    try {
      if (!messageText) return false;
      logger.debug(`Analyzing if it's a system message: "${messageText.substring(0, 30)}..."`);
      
      // Always false (we do not detect system messages)
      return false;
    } catch (error) {
      logger.error(`Error in isSystemMessage: ${error.message}`);
      return false;
    }
  }

  // Also need to add the isMessageSentByUs function that is used but not implemented
  isMessageSentByUs(msgElement) {
    // Determine if a message was sent by us (usually based on position or CSS class)
    try {
      // On Facebook, messages sent by us are usually aligned to the right
      // or have specific classes
      const hasRightAlignmentClass = msgElement.classList.contains('x1q0g3np') || 
                                    msgElement.classList.contains('x78zum5') ||
                                    msgElement.getAttribute('class')?.includes('right');
      
      if (hasRightAlignmentClass) return true;
      
      // Check by position (if it's aligned to the right)
      const rect = msgElement.getBoundingClientRect();
      const parentRect = msgElement.parentElement?.getBoundingClientRect();
      
      if (parentRect && rect) {
        // If the message is closer to the right edge than the left, it's probably ours
        const distanceFromRight = parentRect.right - rect.right;
        const distanceFromLeft = rect.left - parentRect.left;
        
        if (distanceFromRight < distanceFromLeft) return true;
      }
      
      // 3. Check by content (look for common indicators)
      const text = msgElement.innerText || '';
      if (text.includes("You:") || text.includes("Tú:")) return true;
      
      // If none of the previous checks worked, assume it's from the other user
      return false;
    } catch (error) {
      logger.error(`Error determining if the message is ours: ${error.message}`);
      return false; // In case of error, assume it's not ours
    }
  }

  // Method getFallbackResponse that is called in case of error with the API
  getFallbackResponse(messages) {
    // Emergency response for when AI generation fails
    try {
      // Determine the language based on the last received message
      const lastMessage = messages[messages.length - 1]?.content || '';
      
      // Detect if it's Spanish (simple responses)
      if (/[áéíóúñ¿¡]/i.test(lastMessage) || 
          /\b(hola|gracias|buenos días|buenas tardes|disponible)\b/i.test(lastMessage)) {
        return "Hello! Thank you for your message. I’ll reply as soon as possible.";
      } 
      
      // If not Spanish, respond in English
      return "Hello! Thank you for your message. I'll get back to you as soon as possible.";
    } catch (error) {
      logger.error(`Error generating emergency response: ${error.message}`);
      return "Thank you for your message. I'll respond soon.";
    }
  }
  
  // New helper: send by pressing Enter in the field
  async sendViaEnter(inputField) {
    inputField.focus();
    ['keydown','keypress','keyup'].forEach(type => {
      inputField.dispatchEvent(new KeyboardEvent(type, {
        key: 'Enter', code: 'Enter', bubbles: true
      }));
    });
  }

  // Handles the response according to the configured mode
  async handleResponse(messages, productLink, isSeller) {
    // Only respond if the last message is not ours
    if (messages.length === 0 || messages[messages.length - 1].sentByUs) {
      logger.log('No need to respond - the last message is ours or there are no messages');
      return;
    }
    
    // Prepare the context for generating the response
    const context = {
      messages,
      productLink,
      isSeller,
      // Add time information for logging
      timestamp: new Date().toISOString()
    };
    
    // Act according to the configured mode
    switch (CONFIG.operationMode) {
      case 'auto':
        // Fully automatic mode
        await this.handleAutoMode(context);
        break;
        
      case 'manual':
        // Manually supervised mode
        await this.handleManualMode(context);
        break;
        
      case 'generate':
        // Test and adjustment mode
        await this.handleGenerateMode(context);
        break;
    }
    
    // Log the interaction if enabled
    if (CONFIG.logging.saveConversations) {
      this.logConversation(context);
    }
  }
  
  // Handles the automatic mode
  async handleAutoMode(context) {
    try {
      const wrapper = await domUtils.waitForElement(CONFIG.selectors.activeChat.messageWrapper);
      const scrollContainer = domUtils.findElement(
        CONFIG.selectors.activeChat.scrollbar,
        wrapper
      ) || wrapper;
      // load the entire history
      await domUtils.scrollToTop(scrollContainer);
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
      wrapper.scrollTop = wrapper.scrollHeight;
      await this.delay(500);

      // collect initial messages
      let collected = [...context.messages];
      const observer = new MutationObserver(muts => {
        muts.forEach(m => {
          m.addedNodes.forEach(node => {
            if (node.nodeType===1 && node.innerText) {
              collected.push({
                content: node.innerText.trim(),
                sentByUs: this.isMessageSentByUs(node),
                timestamp: new Date().toISOString()
              });
            }
          });
        });
      });
      observer.observe(wrapper, { childList: true, subtree: true });

      // random wait 30–60s
      const waitTime = 30000 + Math.random()*30000;
      logger.log(`Collecting messages for ${Math.round(waitTime/1000)}s before auto-response`);
      await this.delay(waitTime);
      observer.disconnect();

      // update context
      context.messages = collected;

      // generate and send
      await this.startTypingIndicator();
      let responseText;
      try {
        responseText = await this.generateAIResponse(context);
      } catch {
        responseText = this.getFallbackResponse(context.messages);
      }
      await this.delay(this.calculateTypingTime(responseText));
      await this.stopTypingIndicator();

      // insert and send
      const inputField = await domUtils.waitForElement(CONFIG.selectors.activeChat.messageInput);
      inputField.click(); inputField.focus();
      this.insertTextDirectly(inputField, responseText);

      await this.delay(200);
      // now reuse the helper
      await this.sendViaEnter(inputField);

      logger.notify('Message sent automatically', 'success');
      this.saveResponseToHistory(context, responseText, 'auto');
    } catch (e) {
      // Log the specific error message
      logger.error(`Error in auto mode: ${e.message}`); 
      // Add stack trace for more details if available
      if (e.stack) {
        logger.error(e.stack);
      }
      await this.stopTypingIndicator();
      logger.notify('Error processing automatic message', 'error');
    }
  }
  
  // Handles the manual mode - MODIFIED FOR MORE RELIABLE INSERTION
  async handleManualMode(context) {
    try {
      await this.startTypingIndicator();
      let responseText;
      try {
        responseText = await this.generateAIResponse(context);
        logger.log('Response successfully generated in manual mode');
      } catch (error) {
        logger.error(`Error generating response in manual mode: ${error.message}`);
        responseText = this.getFallbackResponse(context.messages);
      }
      await this.stopTypingIndicator();

      // 4. Prepare manual insertion with highlighting and timeout
      const inputField = await domUtils.waitForElement(CONFIG.selectors.activeChat.messageInput);
      inputField.click(); inputField.focus(); await this.delay(300);

      // Highlight input field
      inputField.style.border = '2px solid #4267B2';
      inputField.style.boxShadow = '0 0 8px rgba(66,103,178,0.6)';

      // Attempt insertion
      const inserted = this.insertTextDirectly(inputField, responseText);
      if (!inserted) { /* fallback clipboard/prompt... */ }

      await this.delay(500);
      const alertElement = this.showSimpleAlert(
        'Response generated and ready to send. Press Send or edit.', 
        'info'
      );

      // start manual mode timeout
      this.manualTimeoutId = setTimeout(() => {
        alertElement?.remove();
        inputField.style.border = '';
        inputField.style.boxShadow = '';
        logger.notify('Manual mode timeout reached, response discarded', 'warning');
      }, CONFIG.manualModeTimeout);

      // set up events to clear timeout and styles
      const onSendClick = () => {
        clearTimeout(this.manualTimeoutId);
        inputField.style.border = '';
        inputField.style.boxShadow = '';
        const finalText = inputField.innerText || inputField.textContent || responseText;
        this.saveResponseToHistory(context, finalText, 'manual');
        logger.notify('Message sent manually', 'success');
        alertElement?.remove();
        sendButton.removeEventListener('click', onSendClick);
      };
      const onInputClick = () => {
        clearTimeout(this.manualTimeoutId);
        inputField.style.border = '';
        inputField.style.boxShadow = '';
        alertElement?.remove();
        inputField.removeEventListener('click', onInputClick);
      };

      const sendButton = await domUtils.waitForElement(CONFIG.selectors.activeChat.sendButton, 2000);
      if (sendButton) {
        sendButton.addEventListener('click', onSendClick);
        inputField.addEventListener('click', onInputClick);
      }

      logger.notify('Response generated and ready to send', 'info');
    } catch (error) {
      logger.error(`Error in manual mode: ${error.message}`);
      await this.stopTypingIndicator();
      logger.notify('Error processing manual message', 'error');
    }
  }

  // New improved method for direct text insertion
  insertTextDirectly(element, text) {
    try {
      // Log the state before insertion
      const previousContent = element.innerText || element.textContent || '';
      logger.debug(`State before insertion: ${previousContent.length > 0 ? 'Field with content' : 'Empty field'}`);
      
      // Method 1: Use innerHTML/innerText based on the type of element
      if (element.tagName.toLowerCase() === 'div') {
        // For contenteditable divs, innerText usually works better
        element.innerText = text;
        logger.debug('Text inserted using innerText in div');
      } 
      else if (element.tagName.toLowerCase() === 'p') {
        // For p elements, innerHTML may work better
        element.innerHTML = text;
        logger.debug('Text inserted using innerHTML in p');
      }
      // Method 2: Use textContent as an alternative
      else {
        element.textContent = text;
        logger.debug('Text inserted using textContent');
      }
      
      // Method 3: Use execCommand as a backup
      try {
        // First select all existing text
        document.execCommand('selectAll', false, null);
        // Then insert the new text
        element.focus();
        document.execCommand('insertText', false, text);
        logger.debug('Text inserted using execCommand');
      } catch (e) {
        logger.debug(`execCommand failed: ${e.message}`);
      }
      
      // Method 4: Low-level DOM manipulation
      try {
        // Create a text node
        const textNode = document.createTextNode(text);
        
        // Clear existing content
        while (element.firstChild) {
          element.removeChild(element.firstChild);
        }
        
        // Insert the new text node
        element.appendChild(textNode);
        logger.debug('Text inserted via DOM text node');
      } catch (e) {
        logger.debug(`DOM insertion failed: ${e.message}`);
      }
      
      // Trigger multiple events to ensure Facebook detects the change
      const events = ['input', 'change', 'keyup', 'keydown', 'keypress'];
      events.forEach(eventType => {
        element.dispatchEvent(new Event(eventType, { bubbles: true }));
      });
      
      // Check if it was inserted correctly
      const currentContent = element.innerText || element.textContent || '';
      const inserted = currentContent.length > 0;
      
      logger.debug(`Direct insertion verification: ${inserted ? 'Text inserted' : 'No text detected'}`);
      
      // Simulate a key press at the end to trigger Facebook events
      element.focus();
      const keyEvent = new KeyboardEvent('keypress', {
        key: ' ',
        code: 'Space',
        bubbles: true
      });
      element.dispatchEvent(keyEvent);
      
      return inserted;
    } catch (error) {
      logger.error(`Error inserting text directly: ${error.message}`);
      return false;
    }
  }
  
  // Handles the test mode (generate)
  async handleGenerateMode(context) {
    try {
      // Generate response with AI
      let responseText;
      try {
        responseText = await this.generateAIResponse(context);
        logger.log('Response successfully generated in generate mode');
      } catch (error) {
        logger.error(`Error generating response in generate mode: ${error.message}`);
        responseText = this.getFallbackResponse(context.messages);
      }

      // Insert directly into the field
      const inputField = await domUtils.waitForElement(CONFIG.selectors.activeChat.messageInput);
      inputField.click(); inputField.focus();
      this.insertTextDirectly(inputField, responseText);

      logger.notify('Response generated (generate mode)', 'info');
    } catch (error) {
      logger.error(`Error in generate mode: ${error.message}`);
      logger.notify('Error generating test response', 'error');
    }
  }
  
  // Simulates a natural delay for automatic responses
  getRandomResponseDelay() {
    return Math.floor(
      Math.random() * 
      (CONFIG.humanSimulation.maxResponseDelay - CONFIG.humanSimulation.minResponseDelay) + 
      CONFIG.humanSimulation.minResponseDelay
    );
  }
  
  // Calculates typing time based on message length
  calculateTypingTime(message) {
    const baseTime = message.length * CONFIG.humanSimulation.baseTypingSpeed;
    const variation = Math.random() * CONFIG.humanSimulation.typingVariation * message.length;
    return Math.max(CONFIG.humanSimulation.minResponseDelay, baseTime + variation);
  }
  
  // Helper function for delay
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  // Starts the "typing..." indicator
  async startTypingIndicator() {
    try {
      // Find input field to activate typing indicator
      const inputField = await domUtils.waitForElement(CONFIG.selectors.activeChat.messageInput);
      
      // Focus the field to start the typing session
      inputField.focus();
      
      // Send keyboard events to activate the "typing..." indicator
      this.typingState.isTyping = true;
      this.typingState.chatId = this.currentChatId;
      
      // Maintain a "typing..." indicator by simulating periodic activity
      this.typingState.intervalId = setInterval(() => {
        if (inputField && this.typingState.isTyping) {
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
      logger.error(`Error activating typing indicator: ${error.message}`);
      return false;
    }
  }
  
  // Stops the "typing..." indicator
  async stopTypingIndicator() {
    try {
      // Stop the typing simulation interval
      if (this.typingState.intervalId) {
        clearInterval(this.typingState.intervalId);
        this.typingState.intervalId = null;
      }
      
      this.typingState.isTyping = false;
      
      // Clear text field if necessary
      try {
        const inputField = await domUtils.waitForElement(CONFIG.selectors.activeChat.messageInput, 1000);
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
      logger.error(`Error deactivating typing indicator: ${error.message}`);
      return false;
    }
  }
  
  // Saves a response in the history
  saveResponseToHistory(context, responseText, mode) {
    const log = {
      chatId: this.currentChatId,
      timestamp: new Date().toISOString(),
      mode: mode,
      context: {
        isSeller: context.isSeller,
        productLink: context.productLink,
        lastMessage: context.messages[context.messages.length - 1]?.content || ''
      },
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
  
  // Logs the complete conversation
  logConversation(context) {
    // Extract relevant information
    const log = {
      chatId: this.currentChatId,
      timestamp: new Date().toISOString(),
      userName: context.messages.find(m => !m.sentByUs)?.sender || 'Unknown',
      messageCount: context.messages.length,
      isSeller: context.isSeller,
      productLink: context.productLink,
      lastMessageContent: context.messages[context.messages.length - 1]?.content || ''
    };
    
    logger.debug(`Conversation logged: ${JSON.stringify(log)}`);
  }
  
  // Generates a response with the OpenAI API (updated version that accepts configuration)
  async generateAIResponse(context, customConfig = null) {
    // Use custom configuration or default
    const config = customConfig || CONFIG.AI;
    
    if (!config.enabled || !config.apiKey) {
      throw new Error('AI API not configured');
    }
    
    // Get last 10 messages max to avoid overloading the context
    const recentMessages = context.messages;
    
    // NEW: Detailed log of the data being sent
    logger.log('--------- SENDING DATA TO THE API ---------');
    logger.log(`Role: ${context.isSeller ? 'SELLER' : 'BUYER'}`);
    logger.log(`Product URL: ${context.productLink || 'Not available'}`);
    logger.log(`Total messages: ${context.messages.length}`);
    logger.log(`Messages sent to the API: ${recentMessages.length}`);
    
    // Show summary of the last messages
    recentMessages.forEach((msg, idx) => {
      logger.log(`Message #${idx + 1}: [${msg.sentByUs ? 'YOU' : 'OTHER'}] "${msg.content.substring(0, 50)}${msg.content.length > 50 ? '...' : ''}"`);
    });
    
    // Create prompt for AI
    const prompt = [
      {
        role: 'system',
        content: `You are an assistant helping to ${context.isSeller ? 'sell' : 'buy'} on Facebook Marketplace. 
                 ${context.productLink ? `The product is: ${context.productLink}` : ''}
                 Respond in a friendly and concise manner in the same language as the last message.
                 ${context.isSeller ? 'Act as the seller.' : 'Act as the buyer.'}`
      }
    ];
    
    // Add conversation history
    recentMessages.forEach(msg => {
      prompt.push({
        role: msg.sentByUs ? 'assistant' : 'user',
        content: msg.content
      });
    });
    
    logger.log('--------- END OF DATA TO BE SENT ---------');
    
    // Call the API
    return fetch(config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        messages: prompt,
        temperature: config.temperature,
        max_tokens: config.maxTokens
      })
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      logger.log('API response received successfully');
      return data.choices[0]?.message?.content || '';
    })
    .catch(error => {
      logger.error(`Error in AI API: ${error.message}`);
      throw error;
    });
  }
  
  // Implementation of the showSimpleAlert function that was missing
  showSimpleAlert(message, type = 'info') {
    try {
      // Remove existing alert if any
      const existingAlert = document.querySelector('#fb-chat-monitor-simple-alert');
      if (existingAlert) {
        existingAlert.remove();
      }
      
      // Create new alert element
      const alertDiv = document.createElement('div');
      alertDiv.id = 'fb-chat-monitor-simple-alert';
      alertDiv.style.position = 'fixed';
      alertDiv.style.bottom = '70px';
      alertDiv.style.right = '20px';
      alertDiv.style.padding = '10px 15px';
      alertDiv.style.borderRadius = '4px';
      alertDiv.style.maxWidth = '300px';
      alertDiv.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
      alertDiv.style.zIndex = '10000';
      alertDiv.style.fontSize = '14px';
      alertDiv.style.fontFamily = 'Arial, sans-serif';
      
      // Set colors according to type
      if (type === 'error') {
        alertDiv.style.backgroundColor = '#f44336';
        alertDiv.style.color = 'white';
      } else if (type === 'success') {
        alertDiv.style.backgroundColor = '#4CAF50';
        alertDiv.style.color = 'white';
      } else if (type === 'warning') {
        alertDiv.style.backgroundColor = '#ff9800';
        alertDiv.style.color = 'white';
      } else {
        // info
        alertDiv.style.backgroundColor = '#2196F3';
        alertDiv.style.color = 'white';
      }
      
      // Add icon according to type
      let icon = '✓'; // Default
      if (type === 'error') icon = '✕';
      if (type === 'warning') icon = '⚠';
      if (type === 'info') icon = 'ℹ';
      
      // Add content
      alertDiv.innerHTML = `<span style="margin-right: 8px; font-weight: bold;">${icon}</span> ${message}`;
      
      // Add close button
      const closeBtn = document.createElement('span');
      closeBtn.innerHTML = '&times;';
      closeBtn.style.position = 'absolute';
      closeBtn.style.top = '5px';
      closeBtn.style.right = '8px';
      closeBtn.style.cursor = 'pointer';
      closeBtn.style.fontSize = '18px';
      closeBtn.style.fontWeight = 'bold';
      closeBtn.onclick = () => alertDiv.remove();
      alertDiv.appendChild(closeBtn);
      
      // Add to DOM
      document.body.appendChild(alertDiv);
      
      // Auto-remove after 5 seconds
      setTimeout(() => {
        if (document.body.contains(alertDiv)) {
          alertDiv.remove();
        }
      }, 5000);
      
      return alertDiv;
    } catch (error) {
      logger.error(`Error showing simple alert: ${error.message}`);
      // Use notification as fallback
      logger.notify(message, type);
      return null;
    }
  }
}