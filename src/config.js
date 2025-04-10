// Configuration object with all necessary constants
export const CONFIG = {
  // General settings
  scrollAttempts: 20,
  scrollInterval: 300,
  waitElementTimeout: 10000,
  waitElementCheckInterval: 100,
  
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
        'div[role="button"]:has(svg)'
      ]
    }
  },
  
  // Messenger selectors - For compatibility
  MESSENGER: {
    // Placeholder for future Messenger-specific selectors
  }
};

// Utility functions for selector resilience - to be used in our DOM interactions
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

// For backward compatibility
export const FB_MARKETPLACE_SELECTORS = CONFIG.MARKETPLACE;
export const MESSENGER_SELECTORS = CONFIG.MESSENGER;