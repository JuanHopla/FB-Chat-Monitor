// ==UserScript==
// @name         FB-Chat-Monitor [DEV]
// @namespace    https://github.com/JuanHopla/FB-Chat-Monitor
// @version      0.1-dev
// @description  Extracts chat data from Messenger and Facebook Marketplace in real-time using MutationObserver.
// @author       JuanHopla
// @match        https://www.messenger.com/*
// @match        https://www.facebook.com/marketplace/inbox*
// @grant        none
// ==/UserScript==


(function() {
'use strict';

// Log script loaded message
console.log('[FB-Chat-Monitor] Script loaded 🚀');

// Add visual notification to confirm script is loaded
const notifyScriptLoaded = () => {
  const div = document.createElement('div');
  div.style.position = 'fixed';
  div.style.bottom = '20px';
  div.style.right = '20px';
  div.style.padding = '10px';
  div.style.backgroundColor = '#4CAF50';
  div.style.color = 'white';
  div.style.borderRadius = '5px';
  div.style.zIndex = '9999';
  div.style.opacity = '0.9';
  div.textContent = 'FB Chat Monitor [DEV]: Script loaded';
  document.body.appendChild(div);
  setTimeout(() => { document.body.removeChild(div); }, 3000);
};

setTimeout(notifyScriptLoaded, 1000);

// Development mode enabled
const DEBUG_MODE = true;

// Environment variables loaded from .env
const ENV = {
  OPENAI_API_KEY: localStorage.getItem('FB_CHAT_MONITOR_OPENAI_KEY') || "",
  AI_MODEL: localStorage.getItem('FB_CHAT_MONITOR_AI_MODEL') || "gpt-3.5-turbo",
  AI_TEMPERATURE: parseFloat(localStorage.getItem('FB_CHAT_MONITOR_AI_TEMP') || "0.7"),
  AI_MAX_TOKENS: parseInt(localStorage.getItem('FB_CHAT_MONITOR_AI_MAX_TOKENS') || "150"),
  AI_ENDPOINT: "https://api.openai.com/v1/chat/completions",
  DEBUG_MODE: false,
  LOG_LEVEL: "INFO"
};

// AI Configuration
const AI_CONFIG = {
  enabled: !!ENV.OPENAI_API_KEY,
  apiKey: ENV.OPENAI_API_KEY,
  model: ENV.AI_MODEL,
  endpoint: ENV.AI_ENDPOINT,
  temperature: ENV.AI_TEMPERATURE,
  maxTokens: ENV.AI_MAX_TOKENS
};

// ----- CONFIG MODULE -----
// Configuration object with all necessary constants


// Load environment variables
// ENV already defined above

const CONFIG = {
  // General settings
  scrollAttempts: 20,
  scrollInterval: 300,
  waitElementTimeout: 10000,
  waitElementCheckInterval: 100,
  
  // AI Service Configuration
  AI: {
    enabled: !!ENV.OPENAI_API_KEY,  // Automatically enable if API key exists
    apiKey: ENV.OPENAI_API_KEY,     // API key from environment
    endpoint: ENV.AI_ENDPOINT,
    model: ENV.AI_MODEL,
    temperature: ENV.AI_TEMPERATURE,
    maxTokens: ENV.AI_MAX_TOKENS
  },
  
  // Facebook Marketplace selectors
  MARKETPLACE: {
    // Navigation
    navigation: {
      // Multiple options for each selector for resilience
      inboxLink: [
        'a[href*="/marketplace/inbox/"]',
        'div[role="navigation"] a[href*="marketplace"][href*="inbox"]'
      ],
      buyingTab: [
        'div[role="tab"]:nth-child(3)',
        'div[role="tab"][tabindex="0"]:not([aria-selected="true"])'
      ],
      sellingTab: [
        'div[role="tab"]:nth-child(2)',
        'div[role="tab"][aria-selected="true"]'
      ]
    },
    
    // Chat list 
    chatList: {
      container: [
        'div[role="main"]',
        'div[class*="x78zum5"][class*="xdt5ytf"]',
        'div.x1yztbdb.xw7yly9.xh8yej3 > div > div > div > div > div'
      ],
      chatItem: [
        'div[role="button"][tabindex="0"]',
        'div[role="row"]',
        'div[class*="x1n2onr6"]'
      ],
      unreadIndicator: [
        'div[class*="xwnonoy"]',
        'span[dir="auto"] span > div[class*="x1s688f"]',
        'div[aria-label*="unread"]'
      ],
      chatUserName: [
        'span[dir="auto"][class*="x1lliihq"]',
        'span[dir="auto"] span > div'
      ],
      lastMessagePreview: [
        'span[class*="x1s688f"]',
        'span[dir="auto"]:not([class*="x1lliihq"])'
      ]
    },
    
    // Active chat window
    activeChat: {
      container: [
        'div.x1ey2m1c.xds687c.xixxii4.x1vjfegm',
        'div[role="main"] > div > div > div:last-child'
      ],
      messagesWrapper: [
        'div.x1ey2m1c.x78zum5.x164qtfw.xixxii4.x1vjfegm',
        'div[role="main"] > div > div > div:last-child > div'
      ],
      messageRow: [
        'div[role="row"]',
        'div[class*="x1n2onr6"]'
      ],
      messageContent: [
        'div[dir="auto"]',
        'span[class*="x1lliihq"]'
      ],
      messageTimestamp: [
        'span[class*="x4k7w5x"] span[class*="x1lliihq"]',
        'span[class*="x1lliihq"]:last-child'
      ],
      
      // Product information
      productInfo: [
        'div[class*="x1sliqq"]',
        'div[role="main"] > div > div > div:first-child'
      ],
      productTitle: [
        'span[class*="x1lliihq"]',
        'div[role="heading"]'
      ],
      productPrice: [
        'span[class*="x193iq5w"]',
        'span:not([class*="x1lliihq"]):not([class*="xjbqb8w"])'
      ],
      productImage: [
        'img[class*="x1rg5ohu"]',
        'img[alt]'
      ],
      
      // Input area
      messageInput: [
        'div[contenteditable="true"][role="textbox"]',
        'div[aria-label*="Message"]'
      ],
      sendButton: [
        'div[aria-label="Send"]',
        'div[aria-label*="enviar"][role="button"]',
        'div[role="button"]:has(svg)',
        'div[class*="x1i10hfl"][role="button"]:has(svg)',
        'div[class*="x1n2onr6"][role="button"]'
      ]
    }
  },
  
  // Messenger selectors - For compatibility
  MESSENGER: {
    // Placeholder for future Messenger-specific selectors
  }
};

// Utility functions for selector resilience - to be used in our DOM interactions
const SELECTOR_UTILS = {
  // Try multiple selectors in sequence until one works
  findElement(selectors, parent = document) {
    for (const selector of selectors) {
      try {
        const element = parent.querySelector(selector);
        if (element) return element;
      } catch (e) {
        console.warn(`Selector failed: ${selector}`, e);
      }
    }
    return null;
  },
  
  // Try multiple selectors for finding all matching elements
  findAllElements(selectors, parent = document) {
    for (const selector of selectors) {
      try {
        const elements = parent.querySelectorAll(selector);
        if (elements.length > 0) return Array.from(elements);
      } catch (e) {
        console.warn(`Selector failed: ${selector}`, e);
      }
    }
    return [];
  },
  
  // Find element by text content
  findElementByText(text, elementType = '*', parent = document) {
    const elements = parent.querySelectorAll(elementType);
    for (const el of elements) {
      if (el.textContent.includes(text)) return el;
    }
    return null;
  },
  
  // Check if an element is unread based on multiple possible indicators
  isUnreadChat(chatElement) {
    // Unread indicator method 1: specific class
    const hasUnreadIndicator = !!chatElement.querySelector('div[class*="xwnonoy"]');
    
    // Unread indicator method 2: text style
    const nameSpan = chatElement.querySelector('span[dir="auto"] span > div');
    if (nameSpan) {
      const nameClasses = nameSpan.parentElement?.className || '';
      const hasUnreadTextStyle = nameClasses.includes('x1s688f');
      const hasReadTextStyle = nameClasses.includes('xk50ysn');
      if (hasUnreadTextStyle && !hasReadTextStyle) return true;
    }
    
    return hasUnreadIndicator;
  }
};

// For backward compatibility
const FB_MARKETPLACE_SELECTORS = CONFIG.MARKETPLACE;
const MESSENGER_SELECTORS = CONFIG.MESSENGER;

// ----- UTILS MODULE -----
// Import configuration


// Utility functions for selector resilience
// Using SELECTOR_UTILS defined in CONFIG module

// Log levels
const LOG_LEVELS = {
  ERROR: 0,
  INFO: 1,
  DEBUG: 2
};

// Current log level - change to DEBUG for development
let currentLogLevel = LOG_LEVELS.INFO;

/**
 * Log a message with the specified level
 * @param {string} message - The message to log
 * @param {number} level - The log level (from LOG_LEVELS)
 */
function log(message, level = LOG_LEVELS.INFO) {
  if (level <= currentLogLevel) {
    const prefix = '[FB-Chat-Monitor]';
    console.log(`${prefix} ${message}`);
  }
}

function logInfo(message) {
  log(message, LOG_LEVELS.INFO);
}

function logDebug(message) {
  log(message, LOG_LEVELS.DEBUG);
}

function logError(message) {
  log(message, LOG_LEVELS.ERROR);
}

function setLogLevel(level) {
  currentLogLevel = level;
}

// Export log levels for external use
;

// Utility functions
/**
 * Wait for an element to appear in the DOM
 * @param {string|Array} selector - CSS selector or array of selectors to try
 * @param {number} timeout - Maximum time to wait in milliseconds
 * @returns {Promise<Element>} The found element
 */
function waitForElement(selector, timeout = CONFIG.waitElementTimeout) {
    return new Promise((resolve, reject) => {
        const interval = CONFIG.waitElementCheckInterval;
        let elapsed = 0;
        const check = () => {
            let el;
            if (Array.isArray(selector)) {
                el = SELECTOR_UTILS.findElement(selector);
            } else {
                el = document.querySelector(selector);
            }
            if (el) return resolve(el);
            elapsed += interval;
            if (elapsed >= timeout) return reject(`Element not found: ${selector}`);
            setTimeout(check, interval);
        };
        check();
    });
}

/**
 * Automatically scroll a container to load more content
 * @param {Element} container - The container element to scroll
 * @param {Function} callback - Function to call when scrolling is complete
 * @param {number} maxAttempts - Maximum number of scroll attempts
 */
function autoScroll(container, callback, maxAttempts = CONFIG.scrollAttempts) {
    let lastScrollHeight = 0;
    let attempts = 0;
    
    function scrollStep() {
        if (attempts >= maxAttempts) {
            logInfo('End of scroll');
            return callback();
        }
        
        const currentHeight = container.scrollHeight;
        if (currentHeight !== lastScrollHeight) {
            lastScrollHeight = currentHeight;
            container.scrollTop = 0; // Scroll upward
            attempts++;
            setTimeout(scrollStep, CONFIG.scrollInterval);
        } else {
            attempts++;
            setTimeout(scrollStep, CONFIG.scrollInterval);
        }
    }
    
    scrollStep();
}

/**
 * Format a timestamp in a user-friendly way (e.g., "8:50 AM")
 * @param {string} timestamp - ISO string or timestamp
 * @returns {string} Formatted time string
 */
function formatTime(timestamp) {
  try {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch (e) {
    return timestamp; // Return original if parsing fails
  }
}

/**
 * Format a conversation message for console display
 * @param {object} message - Message object with sender, timestamp, content
 * @returns {string} Formatted message string
 */
function formatChatMessage(message) {
  const time = formatTime(message.timestamp);
  const sender = message.isSentByYou ? "You" : message.sender;
  return `${sender} ${time}\n${message.content}`;
}

/**
 * Utility debugging functions
 */
const DEBUG = {
  /**
   * Show current status of monitored chats
   */
  showStatus(chatManager) {
    console.group('FB-Chat-Monitor Status');
    
    // Show active chats
    const chats = chatManager.getAllChats();
    console.log(`Active chats: ${chats.length}`);
    
    chats.forEach(chat => {
      console.group(`Chat: ${chat.userName} (${chat.id})`);
      console.log(`Messages: ${chat.messageCount}`);
      console.log(`Last activity: ${chat.lastActivity}`);
      console.log(`Unread: ${chat.unreadMessages ? 'Yes' : 'No'}`);
      if (chat.productInfo) {
        console.log(`Product: ${chat.productInfo.title || 'Unknown'}`);
      }
      console.groupEnd();
    });
    
    // Show current chat
    if (chatManager.currentChatId) {
      console.log(`Current chat: ${chatManager.currentChatId}`);
    } else {
      console.log('No current chat');
    }
    
    console.groupEnd();
  },
  
  /**
   * Show messages for a specific chat
   */
  showMessages(chatManager, chatId) {
    if (!chatId && chatManager.currentChatId) {
      chatId = chatManager.currentChatId;
    }
    
    if (!chatId) {
      console.error('No chat ID provided and no current chat');
      return;
    }
    
    const messages = chatManager.getConversationHistory(chatId);
    
    console.group(`Messages for chat ${chatId} (${messages.length})`);
    
    messages.forEach((msg, index) => {
      console.log(`[${index}] ${msg.sender} (${formatTime(msg.timestamp)}): ${msg.content}`);
    });
    
    console.groupEnd();
  }
};

// Exponer para pruebas
if (typeof window !== 'undefined') {
  window.FB_CHAT_DEBUG = DEBUG;
}

// ----- AI SERVICE MODULE -----
/**
 * Service for handling AI-powered chat responses
 * @module aiService
 */



/**
 * Format conversation history for AI processing
 * @param {Array} messages - Array of message objects
 * @param {Object} productInfo - Product information context
 * @returns {Array} Formatted messages for API
 */
function formatConversationForAI(messages, productInfo) {
  const systemPrompt = `You are an AI assistant helping a BUYER respond to messages on Facebook Marketplace.
${productInfo ? `You're interested in the product: ${productInfo.title || "Unknown product"}
${productInfo.context ? `Context about the product: ${productInfo.context}` : ""}` : ""}
Your role is to act as the BUYER, not the seller.
Keep your responses concise, friendly and helpful. Respond in the same language as the seller's message.
Remember you are inquiring about or purchasing the item, NOT selling it.`;

  // Start with system message
  const formattedMessages = [
    {
      role: "system",
      content: systemPrompt
    }
  ];

  // Add conversation history
  messages.forEach(message => {
    formattedMessages.push({
      role: message.isSentByYou ? "assistant" : "user",
      content: message.content
    });
  });

  return formattedMessages;
}

/**
 * Generate a response using an AI API
 * @param {Array} conversationHistory - Array of message objects
 * @param {Object} productInfo - Product information object
 * @returns {Promise<string>} The AI-generated response
 */
async function generateAIResponse(conversationHistory, productInfo) {
  try {
    // Use CONFIG.AI directly, so it works in the compiled version
    if (!CONFIG.AI.apiKey || !CONFIG.AI.enabled) {
      logError('AI API key not configured or AI is disabled');
      return getDefaultResponse(conversationHistory[conversationHistory.length - 1].content);
    }

    const messages = formatConversationForAI(conversationHistory, productInfo);
    
    logInfo('Requesting response from AI service...');
    
    const response = await fetch(CONFIG.AI.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.AI.apiKey}`
      },
      body: JSON.stringify({
        model: CONFIG.AI.model,
        messages: messages,
        temperature: CONFIG.AI.temperature,
        max_tokens: CONFIG.AI.maxTokens
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      logError(`AI service error: ${response.status} ${response.statusText}`);
      logError(`Error details: ${JSON.stringify(errorData)}`);
      return getDefaultResponse(conversationHistory[conversationHistory.length - 1].content);
    }

    const data = await response.json();
    const aiResponse = data.choices[0]?.message?.content?.trim();
    
    if (!aiResponse) {
      logError('Empty response from AI service');
      return getDefaultResponse(conversationHistory[conversationHistory.length - 1].content);
    }
    
    return aiResponse;
    
  } catch (error) {
    logError(`Error generating AI response: ${error.message}`);
    return getDefaultResponse(conversationHistory[conversationHistory.length - 1].content);
  }
}

/**
 * Get a default response based on message content when AI fails
 * @param {string} message - The incoming message
 * @returns {string} A default response
 */
function getDefaultResponse(message) {
  const lowerMessage = message.toLowerCase();
  
  if (lowerMessage.includes('hello') || lowerMessage.includes('hi') || lowerMessage.includes('hey') || 
      lowerMessage.includes('hola')) {
    return 'Hello! Thanks for your message. How can I help you today?';
  }
  
  if (lowerMessage.includes('price') || lowerMessage.includes('precio')) {
    return 'The listed price is final. It includes shipping to anywhere in the country.';
  }
  
  if (lowerMessage.includes('available') || lowerMessage.includes('disponible')) {
    return 'Yes, the product is still available. Are you interested?';
  }
  
  return 'Thank you for your message. I will respond as soon as possible.';
}

/**
 * Configure AI settings
 * @param {Object} config - Configuration object with API key, model, etc.
 * @returns {Object} The updated AI config
 */
function configureAI(config) {
  // Make sure we're referencing the global CONFIG object
  CONFIG.AI.apiKey = config.apiKey || CONFIG.AI.apiKey;
  CONFIG.AI.model = config.model || CONFIG.AI.model;
  CONFIG.AI.enabled = !!CONFIG.AI.apiKey;
  CONFIG.AI.temperature = config.temperature || CONFIG.AI.temperature;
  CONFIG.AI.maxTokens = config.maxTokens || CONFIG.AI.maxTokens;
  
  logInfo(`AI configured with model: ${CONFIG.AI.model}`);
  return {...CONFIG.AI}; // Return a copy to avoid direct modification
}


// ----- CHAT MANAGER MODULE -----



/**
 * ChatManager class for handling chat interactions
 */
class ChatManager {
  constructor() {
    this.activeChats = new Map(); // Map<chatId, chatData>
    this.pendingChats = []; // Queue of chats with unread messages
    this.currentChatId = null;
  }
  
  /**
   * Scans Marketplace Inbox for unread messages
   * @returns {Promise<number>} Number of unread chats found
   */
  async scanForUnreadChats() {
    logInfo('Scanning for unread chats...');
    
    try {
      // Select the buying tab if not already selected
      const buyingTab = SELECTOR_UTILS.findElement(CONFIG.MARKETPLACE.navigation.buyingTab);
      if (buyingTab) {
        // Only click if it's not already selected - Fixing incorrect condition
        if (buyingTab.getAttribute('aria-selected') !== 'true') {
          buyingTab.click();
          logInfo('Clicked "Buying" tab');
          // Wait a moment for the UI to update
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      // Get the chat list container
      const chatContainer = SELECTOR_UTILS.findElement(CONFIG.MARKETPLACE.chatList.container);
      if (!chatContainer) {
        logInfo('Chat container not found');
        return 0;
      }
      
      // Find all chat items
      const chatItems = SELECTOR_UTILS.findAllElements(CONFIG.MARKETPLACE.chatList.chatItem, chatContainer);
      logInfo(`Found ${chatItems.length} chat items`);
      
      // Reset the pending chats queue
      this.pendingChats = [];
      
      // Track counts for read and unread chats
      let unreadCount = 0;
      let readCount = 0;
      
      // Check each chat for unread messages
      for (const chat of chatItems) {
        const isUnread = SELECTOR_UTILS.isUnreadChat(chat);
        const userName = this.extractUserName(chat);
        
        if (isUnread) {
          unreadCount++;
          // Get a unique identifier for this chat
          const chatId = this.getChatId(chat);
          
          // Add to pending chats queue
          this.pendingChats.push({
            chatId,
            userName,
            element: chat
          });
          
          logInfo(`Found unread chat: ${userName} (${chatId})`);
        } else {
          readCount++;
        }
      }
      
      // Add summary message with both read and unread counts
      logInfo(`Summary: Found ${chatItems.length} total chats, ${unreadCount} unread, ${readCount} read`);
      
      return this.pendingChats.length;
    } catch (error) {
      logInfo(`Error scanning for unread chats: ${error}`);
      return 0;
    }
  }
  
  /**
   * Opens the next chat with unread messages
   * @returns {Promise<boolean>} True if a chat was opened, false otherwise
   */
  async openNextPendingChat() {
    if (this.pendingChats.length === 0) {
      logInfo('No pending chats to open');
      return false;
    }
    
    const nextChat = this.pendingChats.shift();
    logInfo(`Opening chat with: ${nextChat.userName}`);
    
    try {
      // Click on the chat to open it
      nextChat.element.click();
      this.currentChatId = nextChat.chatId;
      
      // Wait a moment for the chat to load
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Initialize chat data if not exists
      if (!this.activeChats.has(nextChat.chatId)) {
        this.activeChats.set(nextChat.chatId, {
          chatId: nextChat.chatId,
          userName: nextChat.userName,
          lastActivity: new Date(),
          unreadMessages: true,
          conversationHistory: [],
          productInfo: null // Initialize product info
        });
      }
      
      // Process the messages in this chat
      await this.processCurrentChatMessages();
      
      return true;
    } catch (error) {
      logInfo(`Error opening chat: ${error}`);
      return false;
    }
  }
  
  /**
   * Extracts and processes messages from the current active chat
   */
  async processCurrentChatMessages() {
    if (!this.currentChatId) {
      logInfo('No active chat to process');
      return;
    }
    
    const chatData = this.activeChats.get(this.currentChatId);
    if (!chatData) {
      logInfo(`No data found for chat ID: ${this.currentChatId}`);
      return;
    }
    
    logInfo(`Processing messages for chat with: ${chatData.userName}`);
    
    // Find the active chat container
    const chatContainer = SELECTOR_UTILS.findElement(CONFIG.MARKETPLACE.activeChat.container);
    if (!chatContainer) {
      logInfo('Active chat container not found');
      return;
    }
    
    // Find the conversation header to identify which chat we're in
    const conversationHeader = this.findConversationHeader(chatContainer);
    if (conversationHeader) {
      const headerText = conversationHeader.innerText;
      logInfo(`Current conversation: ${headerText}`);
      
      // Extract product info from header and container
      const productTitle = this.extractProductFromHeader(headerText);
      const fullProductInfo = this.extractProductInfo(chatContainer);
      
      // Use the most complete information available
      if (fullProductInfo || productTitle) {
        this.updateChatWithProductInfo(
          this.currentChatId, 
          fullProductInfo || { title: productTitle }
        );
      }
      
      // Prioritize product title matching over username matching
      const originalProductTitle = this.extractProductFromHeader(chatData.userName);
      if (productTitle && originalProductTitle && productTitle === originalProductTitle) {
        // If product titles match, update the userName to match the conversation header
        if (chatData.userName !== headerText) {
          logInfo(`Updating chat name from "${chatData.userName}" to "${headerText}"`);
          chatData.userName = headerText;
        }
      } else if (!headerText.includes(chatData.userName) && 
                !chatData.userName.includes(headerText)) {
        logInfo(`Warning: Chat identification mismatch. Expected ${chatData.userName} but found ${headerText}`);
      }
    }
    
    // Find the messages wrapper
    const messagesWrapper = SELECTOR_UTILS.findElement(CONFIG.MARKETPLACE.activeChat.messagesWrapper, chatContainer);
    if (!messagesWrapper) {
      logInfo('Messages wrapper not found');
      return;
    }
    
    // Find all messages
    const messages = SELECTOR_UTILS.findAllElements(CONFIG.MARKETPLACE.activeChat.messageRow, messagesWrapper);
    logInfo(`Found ${messages.length} messages in current chat`);
    
    // Track how many messages we've processed to avoid duplicates
    let newMessages = 0;
    
    // Process each message
    for (const message of messages) {
      // Skip if this is a section divider between conversations
      if (this.isConversationDivider(message)) {
        logInfo('Found conversation divider - skipping');
        continue;
      }
      
      // Get message content
      const contentElement = SELECTOR_UTILS.findElement(CONFIG.MARKETPLACE.activeChat.messageContent, message);
      if (!contentElement || !contentElement.innerText.trim()) continue;
      
      const content = contentElement.innerText.trim();
      
      // Determine sender
      const isSentByYou = this.isMessageSentByYou(message);
      const sender = isSentByYou ? 'You' : chatData.userName;
      
      // Get timestamp if available
      let timestamp = new Date().toISOString();
      const timestampElement = SELECTOR_UTILS.findElement(CONFIG.MARKETPLACE.activeChat.messageTimestamp, message);
      if (timestampElement) {
        timestamp = timestampElement.getAttribute('title') || timestamp;
      }
      
      // Create message object
      const messageObj = {
        content,
        sender,
        isSentByYou,
        timestamp
      };
      
      // Check if we already have this message to avoid duplicates
      if (!this.isDuplicateMessage(chatData.conversationHistory, messageObj)) {
        chatData.conversationHistory.push(messageObj);
        newMessages++;
        logInfo(`Added message to history: "${content.substring(0, 30)}${content.length > 30 ? '...' : ''}"`);
      }
    }
    
    // Only log if we've found new messages
    if (newMessages > 0) {
      logInfo(`Added ${newMessages} new messages to conversation`);
      // Display the updated conversation nicely
      this.displayConversation(chatData.chatId);
    }
    
    // Update chat data
    chatData.lastActivity = new Date();
    chatData.unreadMessages = false;
    
    // Save updated chat data
    this.activeChats.set(this.currentChatId, chatData);
  }
  
  /**
   * Extracts the product name part from a header text
   * @param {String} headerText The header text containing user and product info
   * @returns {String|null} The product part or null if not found
   */
  extractProductFromHeader(headerText) {
    if (!headerText) return null;
    
    // Check if the text contains the separator character (·)
    const parts = headerText.split('·');
    if (parts.length > 1) {
      return parts[1].trim();
    }
    
    return null;
  }
  
  /**
   * Extracts more comprehensive product information from the chat container
   * @param {Element} container The chat container
   * @returns {Object|null} Product information object or null if not found
   */
  extractProductInfo(container) {
    // Try to find the product info section
    const productInfoSection = SELECTOR_UTILS.findElement(CONFIG.MARKETPLACE.activeChat.productInfo, container);
    if (!productInfoSection) return null;
    
    try {
      // Get more product details when available
      const title = SELECTOR_UTILS.findElement(CONFIG.MARKETPLACE.activeChat.productTitle, productInfoSection)?.innerText.trim() || null;
      const price = SELECTOR_UTILS.findElement(CONFIG.MARKETPLACE.activeChat.productPrice, productInfoSection)?.innerText.trim() || null;
      const imageEl = SELECTOR_UTILS.findElement(CONFIG.MARKETPLACE.activeChat.productImage, productInfoSection);
      const imageUrl = imageEl?.src || null;
      
      // Create a structured product info object
      return {
        title,
        price,
        imageUrl,
        context: productInfoSection.innerText.trim() // Save full context for AI processing
      };
    } catch (error) {
      logError(`Error extracting product info: ${error}`);
      return null;
    }
  }
  
  /**
   * Updates the chat data with complete product information
   * @param {String} chatId The chat ID to update
   * @param {Object} productInfo Product information object
   */
  updateChatWithProductInfo(chatId, productInfo) {
    if (!this.activeChats.has(chatId)) return;
    
    const chatData = this.activeChats.get(chatId);
    chatData.productInfo = productInfo;
    
    logInfo(`Updated product info for chat ${chatId}: ${productInfo.title || 'No title available'}`);
  }
  
  /**
   * Adds a message to the history of a specific chat
   * @param {String} chatId The ID of the chat
   * @param {Object} messageObj The message object to add
   * @returns {Boolean} True if the message was added, false if it was a duplicate
   */
  addMessageToHistory(chatId, messageObj) {
    if (!this.activeChats.has(chatId)) {
      logInfo(`Cannot add message: chat ID ${chatId} not found`);
      return false;
    }
    
    const chatData = this.activeChats.get(chatId);
    
    // Check for duplicates
    if (this.isDuplicateMessage(chatData.conversationHistory, messageObj)) {
      return false;
    }
    
    // Add the message
    chatData.conversationHistory.push(messageObj);
    logInfo(`Added message to chat ${chatId}: "${messageObj.content.substring(0, 30)}${messageObj.content.length > 30 ? '...' : ''}"`);
    
    return true;
  }
  
  /**
   * Send a message to the current chat
   * @param {String} message Text message to send
   * @returns {Promise<boolean>} True if message was sent successfully
   */
  async sendMessage(message) {
    if (!this.currentChatId) {
      logInfo('No active chat to send message to');
      return false;
    }
    
    try {
      // Find input field
      const inputField = SELECTOR_UTILS.findElement(CONFIG.MARKETPLACE.activeChat.messageInput);
      if (!inputField) {
        logInfo('Message input field not found');
        return false;
      }
      
      // Focus and set content
      inputField.focus();
      
      // Use execCommand for compatibility
      document.execCommand('insertText', false, message);
      
      // Alternative: set innerText and dispatch input event
      if (!inputField.innerText || inputField.innerText.trim() === '') {
        inputField.innerText = message;
        inputField.dispatchEvent(new Event('input', { bubbles: true }));
      }
      
      // Wait a moment for the UI to update
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Try to find send button with detailed logging
      logInfo('Searching for send button...');
      
      // Find and click send button
      const sendButton = SELECTOR_UTILS.findElement(CONFIG.MARKETPLACE.activeChat.sendButton);
      
      if (!sendButton) {
        logInfo('Standard send button not found. Trying alternative methods...');
        
        // Método alternativo 1: Buscar botones con SVG dentro
        const svgButtons = document.querySelectorAll('div[role="button"] svg');
        if (svgButtons.length > 0) {
          logInfo(`Found ${svgButtons.length} potential send buttons with SVG. Clicking the last one.`);
          // Normalmente el último botón con SVG es el de enviar
          const parentButton = svgButtons[svgButtons.length - 1].closest('div[role="button"]');
          if (parentButton) {
            parentButton.click();
            logInfo('Clicked alternative button with SVG');
            
            // Esperar a que se envíe el mensaje
            await new Promise(resolve => setTimeout(resolve, 1000));
            await this.processCurrentChatMessages();
            return true;
          }
        }
        
        // Método alternativo 2: Simular pulsación de Enter
        logInfo('Trying to send message with Enter key');
        const enterEvent = new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true
        });
        inputField.dispatchEvent(enterEvent);
        
        // Esperar a que se envíe el mensaje
        await new Promise(resolve => setTimeout(resolve, 1000));
        await this.processCurrentChatMessages();
        
        // Asumimos que funcionó
        logInfo(`Message probably sent using Enter key: "${message.substring(0, 30)}${message.length > 30 ? '...' : ''}"`);
        return true;
      }
      
      // Si encontramos el botón normal, lo usamos
      logInfo(`Send button found with selector: ${sendButton.outerHTML.substring(0, 100)}...`);
      sendButton.click();
      logInfo(`Message sent: "${message.substring(0, 30)}${message.length > 30 ? '...' : ''}"`);
      
      // Wait for message to be sent
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Process messages again to include the one we just sent
      await this.processCurrentChatMessages();
      
      return true;
    } catch (error) {
      logInfo(`Error sending message: ${error}`);
      return false;
    }
  }
  
  /**
   * Checks if a message is already in the conversation history
   */
  isDuplicateMessage(history, newMessage) {
    return history.some(msg => 
      msg.content === newMessage.content && 
      msg.sender === newMessage.sender
    );
  }
  
  /**
   * Finds the conversation header to identify which chat we're in
   */
  findConversationHeader(container) {
    const possibleHeaders = container.querySelectorAll('div[role="heading"], span[class*="x1lliihq"]:first-child');
    
    for (const header of possibleHeaders) {
      if (header.innerText && !header.innerText.includes('Message') && !header.innerText.includes('Chat')) {
        return header;
      }
    }
    
    return null;
  }
  
  /**
   * Checks if an element is a divider between different conversations
   */
  isConversationDivider(element) {
    // Check for elements that typically separate different conversations
    const text = element.innerText;
    return text.includes('You started this chat') || 
           text.includes('View seller profile') ||
           element.querySelector('img[alt]'); // Product images often divide conversations
  }
  
  /**
   * Determines if a message was sent by the current user
   */
  isMessageSentByYou(messageElement) {
    const alignCheck = messageElement.querySelector('[style*="flex-end"]');
    const possibleYou = messageElement.closest('div[class*="x1yc453h"]');
    return !!(alignCheck || possibleYou);
  }
  
  /**
   * Extracts user name from a chat item
   */
  extractUserName(chatElement) {
    const nameElement = SELECTOR_UTILS.findElement(CONFIG.MARKETPLACE.chatList.chatUserName, chatElement);
    return nameElement?.innerText?.trim() || 'Unknown User';
  }
  
  /**
   * Generates a unique ID for a chat element that's consistent across sessions
   */
  getChatId(chatElement) {
    const idAttr = chatElement.id || chatElement.getAttribute('data-testid');
    if (idAttr) return `chat_${idAttr}`;
    
    // Get product name from chat preview if available
    let productInfo = '';
    const lastMessagePreview = SELECTOR_UTILS.findElement(
      CONFIG.MARKETPLACE.chatList.lastMessagePreview, 
      chatElement
    );
    
    if (lastMessagePreview?.innerText) {
      const previewText = lastMessagePreview.innerText.trim();
      // Check if there might be a product name in the preview
      if (previewText.includes('·')) {
        productInfo = previewText.split('·')[1].trim();
      }
    }
    
    const userName = this.extractUserName(chatElement);
    // Create stable ID without timestamp to avoid duplicates on page refresh
    return `chat_${userName.replace(/\s+/g, '_').toLowerCase()}${productInfo ? '_' + productInfo.replace(/\s+/g, '_').toLowerCase() : ''}`;
  }
  
  /**
   * Display a formatted version of the conversation in the console
   */
  displayConversation(chatId) {
    const chatData = this.activeChats.get(chatId);
    if (!chatData) {
      logError(`No chat data found for ID: ${chatId}`);
      return;
    }
    
    // Get only the last few messages to avoid spamming the console
    const messages = chatData.conversationHistory;
    const recentMessages = messages.slice(-5); // Just show the last 5
    
    logInfo(`\n=== Conversation with ${chatData.userName} (${chatId}) ===`);
    
    if (recentMessages.length === 0) {
      logInfo('No messages yet.');
      return;
    }
    
    recentMessages.forEach(msg => {
      logInfo(formatChatMessage(msg));
    });
    
    if (messages.length > recentMessages.length) {
      logInfo(`... and ${messages.length - recentMessages.length} older messages`);
    }
    
    logInfo('===================================\n');
  }
  
  /**
   * Gets conversation history for a specific chat
   */
  getConversationHistory(chatId) {
    return this.activeChats.get(chatId)?.conversationHistory || [];
  }
  
  /**
   * Gets information about all active chats
   */
  getAllChats() {
    const chats = [];
    this.activeChats.forEach(chat => {
      chats.push({
        id: chat.chatId,
        userName: chat.userName,
        lastActivity: chat.lastActivity,
        unreadMessages: chat.unreadMessages,
        messageCount: chat.conversationHistory.length,
        productInfo: chat.productInfo
      });
    });
    return chats;
  }
}

// Create and export singleton instance
const chatManager = new ChatManager();


// ----- MAIN MODULE -----






// Main function to monitor and respond to marketplace messages
async function runMarketplaceMonitor() {
  logInfo('Starting Marketplace Monitor');
  
  try {
    // Scan for unread chats
    const unreadCount = await chatManager.scanForUnreadChats();
    if (unreadCount > 0) {
      logInfo(`Found ${unreadCount} unread chats`);
      
      // Process the first unread chat
      await chatManager.openNextPendingChat();
      
      // Get the conversation history for this chat
      const currentChatId = chatManager.currentChatId;
      
      // No need to log entire conversation again - it's already shown by displayConversation
      logDebug(`Current chat ID: ${currentChatId}`);
      
      // Here you would integrate with an AI assistant to get a response
      const history = chatManager.getConversationHistory(currentChatId);
      const chatData = chatManager.activeChats.get(currentChatId);
      const lastMessage = history[history.length - 1];
      
      if (lastMessage && !lastMessage.isSentByYou) {
        // Try to get AI response first, fall back to default response if needed
        let responseMessage;
        
        if (CONFIG.AI.enabled && CONFIG.AI.apiKey) {
          logInfo('Generating AI response...');
          responseMessage = await generateAIResponse(
            history, 
            chatData.productInfo || null
          );
        }
        
        // Fall back to simple auto-response if AI fails or is not configured
        if (!responseMessage) {
          responseMessage = getDefaultResponse(lastMessage.content);
        }
        
        if (responseMessage) {
          await chatManager.sendMessage(responseMessage);
          logInfo(`Sent response: "${responseMessage.substring(0, 30)}${responseMessage.length > 30 ? '...' : ''}"`);
        }
      }
      
      // Setup a watcher to detect new messages in this chat
      setupActiveConversationWatcher();
    } else {
      logDebug('No unread chats found');
    }
    
    // Schedule the next scan
    setTimeout(runMarketplaceMonitor, 30000); // Check every 30 seconds
  } catch (error) {
    logInfo(`Error in marketplace monitor: ${error}`);
    // Retry after delay
    setTimeout(runMarketplaceMonitor, 60000); 
  }
}

// Set up observer to watch for new messages in the active conversation
function setupActiveConversationWatcher() {
  const chatContainer = SELECTOR_UTILS.findElement(CONFIG.MARKETPLACE.activeChat.container);
  if (!chatContainer) {
    logInfo('Cannot set up watcher - chat container not found');
    return;
  }
  
  logInfo('Watching for new messages...');
  
  const observer = new MutationObserver(async (mutations) => {
    // When new messages arrive, process them
    await chatManager.processCurrentChatMessages();
    
    // No need to log here - the chatManager.displayConversation already shows updates
  });
  
  observer.observe(chatContainer, { childList: true, subtree: true });
  logDebug('Active conversation watcher initialized');
  
  return observer;
}

// For debugging - update the debug object to include environment management
window.FB_CHAT_MONITOR = {
  chatManager,
  config: CONFIG,
  utils: SELECTOR_UTILS,
  runMonitor: runMarketplaceMonitor,
  setLogLevel: (level) => {
    if (level in LOG_LEVELS) {
      setLogLevel(LOG_LEVELS[level]);
      logInfo(`Log level set to ${level}`);
    } else {
      setLogLevel(level);
      logInfo(`Log level set to ${level}`);
    }
  },
  // Simplified AI configuration that works in Tampermonkey
  configureAI: (apiKey, model = 'gpt-3.5-turbo') => {
    // Update CONFIG directly
    CONFIG.AI.apiKey = apiKey;
    CONFIG.AI.model = model;
    CONFIG.AI.enabled = !!apiKey;
    
    // Also store in localStorage for persistence
    try {
      localStorage.setItem('FB_CHAT_MONITOR_OPENAI_KEY', apiKey);
      localStorage.setItem('FB_CHAT_MONITOR_AI_MODEL', model);
    } catch(e) {
      logError('Error saving AI config to localStorage');
    }
    
    logInfo(`AI configured with model: ${model}`);
  },
  disableAI: () => {
    CONFIG.AI.enabled = false;
    logInfo('AI responses disabled');
  },
  // Get current AI status
  getAIStatus: () => {
    return {
      enabled: CONFIG.AI.enabled,
      model: CONFIG.AI.model,
      hasApiKey: !!CONFIG.AI.apiKey
    };
  },
  // New methods for environment management
  getEnv: (key) => getEnvVar(key),
  setEnv: (key, value) => {
    const result = updateEnvVar(key, value);
    if (result) {
      // If we're setting a config value, also update it in the runtime config
      if (key.startsWith('AI_')) {
        const configKey = key.replace('AI_', '').toLowerCase();
        if (CONFIG.AI[configKey] !== undefined) {
          CONFIG.AI[configKey] = value;
        }
      }
      logInfo(`Environment variable ${key} updated`);
    }
    return result;
  }
};

// Initialize based on current URL
function initialize() {
  if (window.location.href.includes('facebook.com/marketplace/inbox')) {
    // Small delay to ensure the page is loaded
    setTimeout(runMarketplaceMonitor, 2000);
  } else if (window.location.href.includes('messenger.com')) {
    // We'll focus on Marketplace for now
    logInfo('Messenger support coming soon!');
  }
}


// ----- API EXPOSURE -----
// Define the monitoring object in the global scope definitively
const FB_CHAT_MONITOR_API = {
  chatManager,
  config: CONFIG,
  utils: SELECTOR_UTILS,
  runMonitor: runMarketplaceMonitor,
  setLogLevel: (level) => {
    console.log(`[FB-Chat-Monitor] Log level set to ${level}`);
  },

  // AI Configuration
  configureAI(apiKey, model = 'gpt-3.5-turbo') {
    localStorage.setItem('FB_CHAT_MONITOR_OPENAI_KEY', apiKey);
    localStorage.setItem('FB_CHAT_MONITOR_AI_MODEL', model);
    AI_CONFIG.apiKey = apiKey;
    AI_CONFIG.model = model;
    AI_CONFIG.enabled = true;
    console.log(`[FB-Chat-Monitor] AI configured with model: ${model}`);

    // Add visual notification
    const div = document.createElement('div');
    div.style.position = 'fixed';
    div.style.bottom = '20px';
    div.style.right = '20px';
    div.style.padding = '10px';
    div.style.backgroundColor = '#4CAF50';
    div.style.color = 'white';
    div.style.borderRadius = '5px';
    div.style.zIndex = '9999';
    div.textContent = 'OpenAI API configured successfully!';
    document.body.appendChild(div);

    setTimeout(() => {
      document.body.removeChild(div);
    }, 3000);

    return { success: true, message: "API Key configured successfully" };
  },

  disableAI() {
    AI_CONFIG.enabled = false;
    console.log('[FB-Chat-Monitor] AI responses disabled');
    return { success: true, message: "AI responses disabled" };
  },

  // Get current AI status
  getAIStatus() {
    return {
      enabled: AI_CONFIG.enabled,
      model: AI_CONFIG.model,
      hasApiKey: !!AI_CONFIG.apiKey
    };
  },

  // Diagnostic method
  debug() {
    console.log('[FB-Chat-Monitor] Debug information:');
    console.log('- Script loaded: Yes');
    console.log('- API exposed: Yes');
    console.log('- AI Config:', AI_CONFIG);
    console.log('- Current URL:', window.location.href);
    return "FB Chat Monitor is working! You can use this API.";
  }
};

// Ensure that the object is correctly exposed in the global scope
window.FB_CHAT_MONITOR = FB_CHAT_MONITOR_API;

// Alternative API exposure method for greater compatibility
document.FB_CHAT_MONITOR = FB_CHAT_MONITOR_API;

// Auto-check after load
setTimeout(() => {
  if (window.FB_CHAT_MONITOR) {
    console.log('[FB-Chat-Monitor] API successfully exposed to global scope');
  } else {
    console.error('[FB-Chat-Monitor] Failed to expose API to global scope');
  }
}, 2000);

// Initialize based on current URL
if (window.location.href.includes('facebook.com/marketplace')) {
  // Small delay to ensure the page is loaded
  setTimeout(runMarketplaceMonitor, 2000);

  // Add permanent floating button
  setTimeout(() => {
    const floatingButton = document.createElement('div');
    floatingButton.style.position = 'fixed';
    floatingButton.style.bottom = '20px';
    floatingButton.style.left = '20px';
    floatingButton.style.padding = '10px 15px';
    floatingButton.style.backgroundColor = '#4267B2'; // Facebook color
    floatingButton.style.color = 'white';
    floatingButton.style.borderRadius = '5px';
    floatingButton.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
    floatingButton.style.cursor = 'pointer';
    floatingButton.style.zIndex = '9999';
    floatingButton.style.fontSize = '14px';
    floatingButton.style.fontWeight = 'bold';
    floatingButton.style.display = 'flex';
    floatingButton.style.alignItems = 'center';
    floatingButton.style.transition = 'all 0.3s ease';

    // Small status indicator (green dot)
    const statusIndicator = document.createElement('div');
    statusIndicator.style.width = '8px';
    statusIndicator.style.height = '8px';
    statusIndicator.style.backgroundColor = '#4CAF50';
    statusIndicator.style.borderRadius = '50%';
    statusIndicator.style.marginRight = '8px';
    floatingButton.appendChild(statusIndicator);

    const buttonText = document.createElement('span');
    buttonText.textContent = 'FB Chat Monitor';
    floatingButton.appendChild(buttonText);

    // Hover effect
    floatingButton.onmouseover = function() {
      this.style.backgroundColor = '#365899';
    };
    floatingButton.onmouseout = function() {
      this.style.backgroundColor = '#4267B2';
    };

    // Show control panel on click
    floatingButton.onclick = function() {
      if (window.FB_CHAT_MONITOR) {
        // Show panel with status and options
        showControlPanel();
      } else {
        alert('FB Chat Monitor is not available. Try reloading the page.');
      }
    };

    document.body.appendChild(floatingButton);
  }, 3000);

  // Function to show control panel
  function showControlPanel() {
    // Remove existing panel if one already exists
    const existingPanel = document.getElementById('fb-chat-monitor-panel');
    if (existingPanel) {
      existingPanel.remove();
      return;
    }

    const panel = document.createElement('div');
    panel.id = 'fb-chat-monitor-panel';
    panel.style.position = 'fixed';
    panel.style.bottom = '70px';
    panel.style.left = '20px';
    panel.style.width = '300px';
    panel.style.backgroundColor = 'white';
    panel.style.borderRadius = '8px';
    panel.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
    panel.style.zIndex = '9998';
    panel.style.padding = '15px';
    panel.style.fontFamily = 'Arial, sans-serif';

    // Title
    const title = document.createElement('h3');
    title.textContent = 'FB Chat Monitor Control';
    title.style.margin = '0 0 15px 0';
    title.style.borderBottom = '1px solid #ddd';
    title.style.paddingBottom = '8px';
    title.style.color = '#4267B2';
    panel.appendChild(title);

    // Current status
    const aiStatus = window.FB_CHAT_MONITOR.getAIStatus();

    const statusDiv = document.createElement('div');
    statusDiv.style.marginBottom = '15px';

    // API status
    const apiStatusText = document.createElement('p');
    apiStatusText.innerHTML = `<strong>API Status:</strong> ${aiStatus.hasApiKey ? '✅ Configured' : '❌ Not configured'}`;
    apiStatusText.style.margin = '5px 0';
    statusDiv.appendChild(apiStatusText);

    // Auto-response status
    const autoResponseText = document.createElement('p');
    autoResponseText.innerHTML = `<strong>Auto Responses:</strong> ${aiStatus.enabled ? '✅ Enabled' : '❌ Disabled'}`;
    autoResponseText.style.margin = '5px 0';
    statusDiv.appendChild(autoResponseText);

    // Model used
    if (aiStatus.hasApiKey) {
      const modelText = document.createElement('p');
      modelText.innerHTML = `<strong>Model:</strong> ${aiStatus.model}`;
      modelText.style.margin = '5px 0';
      statusDiv.appendChild(modelText);
    }

    panel.appendChild(statusDiv);

    // Action buttons
    const buttonsDiv = document.createElement('div');
    buttonsDiv.style.display = 'flex';
    buttonsDiv.style.flexDirection = 'column';
    buttonsDiv.style.gap = '10px';

    // Button to configure API
    const configButton = document.createElement('button');
    configButton.textContent = aiStatus.hasApiKey ? 'Reconfigure API Key' : 'Configure API Key';
    configButton.style.padding = '8px 12px';
    configButton.style.backgroundColor = '#4267B2';
    configButton.style.color = 'white';
    configButton.style.border = 'none';
    configButton.style.borderRadius = '4px';
    configButton.style.cursor = 'pointer';
    configButton.onclick = async () => {
      const apiKey = prompt('Enter your OpenAI API Key:');
      if (apiKey) {
        window.FB_CHAT_MONITOR.configureAI(apiKey);
        // Update panel
        panel.remove();
        setTimeout(showControlPanel, 500);
      }
    };
    buttonsDiv.appendChild(configButton);

    // Button to enable/disable responses
    if (aiStatus.hasApiKey) {
      const toggleButton = document.createElement('button');
      toggleButton.textContent = aiStatus.enabled ? 'Disable Responses' : 'Enable Responses';
      toggleButton.style.padding = '8px 12px';
      toggleButton.style.backgroundColor = aiStatus.enabled ? '#f44336' : '#4CAF50';
      toggleButton.style.color = 'white';
      toggleButton.style.border = 'none';
      toggleButton.style.borderRadius = '4px';
      toggleButton.style.cursor = 'pointer';
      toggleButton.onclick = () => {
        if (aiStatus.enabled) {
          window.FB_CHAT_MONITOR.disableAI();
        } else {
          // Corregido: usamos el apiKey existente en lugar de una variable indefinida
          window.FB_CHAT_MONITOR.configureAI(AI_CONFIG.apiKey, aiStatus.model);
        }
        // Update panel
        panel.remove();
        setTimeout(showControlPanel, 500);
      };
      buttonsDiv.appendChild(toggleButton);
    }

    // Button to manually scan messages
    const scanButton = document.createElement('button');
    scanButton.textContent = 'Scan Messages';
    scanButton.style.padding = '8px 12px';
    scanButton.style.backgroundColor = '#4CAF50';
    scanButton.style.color = 'white';
    scanButton.style.border = 'none';
    scanButton.style.borderRadius = '4px';
    scanButton.style.cursor = 'pointer';
    scanButton.onclick = () => {
      window.FB_CHAT_MONITOR.runMonitor();
      scanButton.textContent = 'Scanning...';
      scanButton.disabled = true;
      setTimeout(() => {
        scanButton.textContent = 'Scan Messages';
        scanButton.disabled = false;
      }, 5000);
    };
    buttonsDiv.appendChild(scanButton);

    panel.appendChild(buttonsDiv);

    document.body.appendChild(panel);
  }
} else if (window.location.href.includes('messenger.com')) {
  // We'll focus on Marketplace for now
  console.log('[FB-Chat-Monitor] Messenger support coming soon!');
}

console.log('[FB-Chat-Monitor] Script initialization complete');
})();