/**
 * Utility functions for FB-Chat-Monitor
 * @module utils
 */
import { CONFIG } from './config.js';

// Log levels
export const LOG_LEVELS = {
  ERROR: 0,
  INFO: 1,
  DEBUG: 2
};

// Current log level
let currentLogLevel = LOG_LEVELS.INFO;

/**
 * Log a message with the specified level
 * @param {string} message - The message to log
 * @param {number} level - The log level (from LOG_LEVELS)
 */
export function log(message, level = LOG_LEVELS.INFO) {
  if (level <= currentLogLevel) {
    const prefix = '[FB-Chat-Monitor]';
    console.log(`${prefix} ${message}`);
  }
}

export function logInfo(message) {
  log(message, LOG_LEVELS.INFO);
}

export function logDebug(message) {
  log(message, LOG_LEVELS.DEBUG);
}

export function logError(message) {
  log(message, LOG_LEVELS.ERROR);
}

export function setLogLevel(level) {
  currentLogLevel = level;
}

// Utility functions for selector resilience - para ser exportados y usados en toda la app
export const SELECTOR_UTILS = {
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

// Export other utility functions...
/**
 * Wait for an element to appear in the DOM
 * @param {string|Array} selector - CSS selector or array of selectors to try
 * @param {number} timeout - Maximum time to wait in milliseconds
 * @returns {Promise<Element>} The found element
 */
export function waitForElement(selector, timeout = CONFIG.waitElementTimeout) {
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
export function autoScroll(container, callback, maxAttempts = CONFIG.scrollAttempts) {
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
export function formatTime(timestamp) {
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
export function formatChatMessage(message) {
  const time = formatTime(message.timestamp);
  const sender = message.isSentByYou ? "You" : message.sender;
  return `${sender} ${time}\n${message.content}`;
}

/**
 * Utility debugging functions
 */
export const DEBUG = {
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