// ----- BASIC CONFIGURATION -----

// Global system configuration – this object must be loaded first
window.CONFIG = {
  // Script version
  version: '1.0.0',
  
  // operationMode: 'auto', 'manual', 'generate'
  operationMode: 'manual',
  defaultOperationMode: 'manual',
  
  // Scan interval (ms)
  scanInterval: 10000,
  
  // Maximum wait time for DOM elements (ms)
  waitElementTimeout: 10000,
  
  // Maximum consecutive failures before pausing monitoring
  maxConsecutiveFailures: 5,
  
  // Maximum scan interval (ms)
  maxScanInterval: 300000,
  
  // OpenAI API settings
  AI: {
    enabled: false,
    apiKey: localStorage.getItem('FB_CHAT_MONITOR_OPENAI_KEY') || "",
    model: localStorage.getItem('FB_CHAT_MONITOR_AI_MODEL') || "gpt-3.5-turbo",
    endpoint: "https://api.openai.com/v1/chat/completions",
    temperature: parseFloat(localStorage.getItem('FB_CHAT_MONITOR_AI_TEMP') || "0.7"),
    maxTokens: parseInt(localStorage.getItem('FB_CHAT_MONITOR_AI_MAX_TOKENS') || "150"),
    
    assistants: {
      seller: {
        id: localStorage.getItem('FB_CHAT_MONITOR_SELLER_ASSISTANT_ID') || "",
        name: localStorage.getItem('FB_CHAT_MONITOR_SELLER_ASSISTANT_NAME') || "Marketplace Seller Assistant",
        instructions: localStorage.getItem('FB_CHAT_MONITOR_SELLER_INSTRUCTIONS') || ""
      },
      buyer: {
        id: localStorage.getItem('FB_CHAT_MONITOR_BUYER_ASSISTANT_ID') || "",
        name: localStorage.getItem('FB_CHAT_MONITOR_BUYER_ASSISTANT_NAME') || "Marketplace Buyer Assistant",
        instructions: localStorage.getItem('FB_CHAT_MONITOR_BUYER_INSTRUCTIONS') || ""
      }
    },
    
    humanSimulation: {
      baseTypingSpeed: 70,
      typingVariation: 20,
      minResponseDelay: 1500,
      maxResponseDelay: 4000,
      enableTypos: true,
      fragmentMessages: true,
      fragmentThreshold: 150,
      fragmentDelay: [2000, 5000],
      typingErrors: {
        enabled: true,
        probability: 0.15,
        correctionDelay: [800, 2000]
      }
    }
  },
  
  // DOM selectors for Marketplace
  selectors: {
    // Chat list
    chatList: {
      container: 'div[class*="x78zum5"][class*="xdt5ytf"], div[role="main"]',
      chatItem: 'a[href*="/marketplace/t/"][role="link"]',
      unreadIndicator: 'span[class*="x6s0dn4"][data-visualcompletion="ignore"]',
      // Username selectors with filter
      chatUserName: {
        selector: [
          'span.x1lliihq.x193iq5w.x6ikm8r.x10wlt62.xlyipyv.xuxw1ft:not(.x1j85h84)',
          'span[dir="auto"][class*="x1lliihq"]:not([class*="x1j85h84"])'
        ],
        filter: (elements) => {
          return Array.from(elements).filter(elem => {
            const text = elem.innerText || "";
            return text.includes("·") && !text.includes(":");
          });
        }
      },
      timestamp: 'span[aria-hidden="true"]',
      // Message preview selectors with filter
      messagePreview: {
        selector: 'span[dir="auto"]:not([class*="x1lliihq"])',
        filter: (elements) => {
          return Array.from(elements).filter(elem => {
            const text = elem.innerText || "";
            // Exclude timestamps like "3m", "2h", "1d"
            const isTimestamp = /^\s*\d+[smhdwy]\s*$/i.test(text);
            // Exclude Marketplace notifications
            const isMarketplaceNotification = text.includes("Marketplace ·");
            // Treat as message if it contains ":" or is longer than 8 chars
            const isMessage = text.includes(":") || text.length > 8;
            return !isTimestamp && !isMarketplaceNotification && isMessage;
          });
        }
      }
    },

    // Active chat
    activeChat: {
      container: 'div.x1ey2m1c.xds687c.xixxii4.x1vjfegm, div[role="main"] > div > div > div:last-child',
      // Improved message selectors
      messageWrapper: 'div.x4k7w5x > div > div > div, div[role="main"] > div > div > div:last-child > div',
      messageRow: 'div[role="row"] div[dir="auto"], div[role="row"] span.x1lliihq > div[dir="auto"]',
      messageContent: 'div[dir="auto"], span[class*="x1lliihq"]',
      messageTimestamp: 'span[class*="x4k7w5x"] span[class*="x1lliihq"], span[class*="x1lliihq"]:last-child',
      // Role indicators
      sellerIndicators: [
        'div[aria-label="Mark as pending"]',
        'span:contains("Mark as pending")',
        'div[aria-label="Create plan"]',
        'div[aria-label="Mark as available"]',
        'div[aria-label="Mark as sold"]'
      ],
      buyerIndicators: [
        'a[aria-label="See details"]',
        'span:contains("See details")'
      ],
      productLink: 'a[href*="/marketplace/item/"]',
      productInfo: 'div[class*="x1sliqq"], div[role="main"] > div > div > div:first-child',
      // Input and send button
      messageInput: 'div[contenteditable="true"][role="textbox"], div[aria-label="Message"], p.xat24cr.xdj266r',
      sendButton: 'span.x3nfvp2:nth-child(3), div[aria-label="Send"], div[aria-label*="enviar"][role="button"]',
      scrollbar: [
        '.x1uipg7g > div:nth-child(1) > div:nth-child(1)',
        'div[style*="overflow-y: auto"][style*="height"]',
        'div[style*="overflow: auto"][style*="height"]',
        'div.x4k7w5x > div[style*="height"]',
        'div[role="main"] div.x1n2onr6[style*="height"]'
      ]
    }
  },

  // Logging level
  debug: true,
  
  // Enable debug visualization in the UI — set to false to disable
  visualDebug: false,

  // Conversation logging
  logging: {
    // Save conversations?
    saveConversations: true,
    // Save detailed logs?
    saveLogs: true,
    // Max number of stored conversations
    maxStoredConversations: 50
  },

  // Manual mode timeout (ms)
  manualModeTimeout: 60000
};