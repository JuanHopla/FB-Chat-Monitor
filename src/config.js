// ----- CONFIG MODULE -----

// Create an empty global object first to avoid TDZ issues
var CONFIG = {};

/**
 * Global script configuration
 * Contains DOM selectors and customizable settings
 */
// Initialize properties after creation
Object.assign(CONFIG, {
  version: '1.0.0',
  operationMode: 'manual',

  // --- REFACTOR: Centralize all AI configuration under the AI object ---
  AI: {
    apiKey: null,       // The single source of truth for the API key
    model: 'gpt-4o',    // The single source of truth for the model
    maxTokens: 2048,
    temperature: 0.7,
    useAssistantAPI: true,
    provider: 'openai',
    assistants: {
      seller: { id: null, name: "Seller Assistant", instructions: "..." },
      buyer: { id: null, name: "Buyer Assistant", instructions: "..." }
    }
  },

  // Logging configuration
  logging: {
    consoleOutput: true,
    fileOutput: false,
    level: 'normal', // 'minimal', 'normal', 'detailed', 'debug'
    showTimestamps: true,
    saveLogs: true, // Si se deben guardar los logs en localStorage
    maxEntries: 1000 // Máximo número de entradas de log a mantener
  },

  // Audio transcription settings
  audioTranscription: {
    enabled: true,
    model: 'whisper-1',
    language: 'es',
    cacheResults: true,
    maxCacheSize: 100, // Número máximo de transcripciones en caché
    autoTranscribe: true // Si se deben transcribir automáticamente los audios detectados
  },

  autoResponseDelay: 5000,
  simulateHumanTyping: true,
  autoSendMessages: true,
  sendMessageDelay: 2000,

  // DOM selectors for Facebook/Messenger
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
            // Treat as message if it contains ":" or text.length > 8
            const isMessage = text.includes(":") || text.length > 8;
            return !isTimestamp && !isMarketplaceNotification && isMessage;
          });
        }
      }
    },

    // Active chat - UPDATED with improved selectors
    activeChat: {
      container: 'div.x1ey2m1c.xds687c.xixxii4.x1vjfegm, div[role="main"] > div > div > div:last-child',
      messageWrapper: 'div.x4k7w5x > div > div > div, div[role="main"] > div > div > div:last-child > div',
      // Use div[role="row"] as the main selector for each message
      messageRow: 'div[role="row"]',
      // Selector for the sender's avatar (used in isMessageSentByUs)
      senderAvatar: 'img.x1rg5ohu[alt]:not([alt="Open photo"])',
      // Refined selectors for text content
      messageContent: [
        // Looks for div[dir="auto"] inside the specific span
        'span.x1lliihq.x1plvlek > div[dir="auto"]',
        // Fallbacks
        'div[role="presentation"] span.x1lliihq > div[dir="auto"]',
        'div[dir="auto"].html-div[class*="xexx8yu"]'
      ],
      // Improved Timestamp selector
      messageTimestamp: [
        'span[data-tooltip-content][aria-label]',
        'span[title][aria-label*=":"]',
        'span.x1lliihq.x1plvlek.xryxfnj[aria-label]',
        'span[aria-label*="sent at"]',
        'span[aria-label*="enviado a las"]' // Kept Spanish for specific cases if needed, or translate to "sent at"
      ],
      // Updated image selectors
      messageImageElement: [
        'a[href*="/messenger_media/"] img.x1rg5ohu',
        'img[alt]:not([width="16"]):not([height="16"])',
        'img[data-visualcompletion="media-vc-image"]',
        'div.x1ey2m1c img',
        'div[role="img"]',
        'div.x6ikm8r.x10wlt62 > img'
      ],
      // Updated audio selectors
      messageAudioElement: 'div[aria-label="Play"][role="button"] ~ audio[src], div[aria-label*="audio message"] audio[src], audio[src]',
      messageAudioPlayButton: [
        'div.x6s0dn4 div[aria-label="Play"][role="button"]',
        'div[role="button"][aria-label="Play"]',
        'div[aria-label="Play"][role="button"]',
        'div[role="button"][aria-label*="audio"]',
        'div[aria-label*="reproducir"][role="button"]',
        'div[aria-label*="Audio message"]',
        'div.xzg4506 > div.x1qjc9v5 > div[role="button"]',
        'div[aria-label*="Play" i][role="button"]'
      ],
      messageAudioUrlSource: null, // Not found in DOM
      messageAudioUrlAttribute: null, // Not found in DOM

      // Selectors for video (new)
      messageVideoElement: [
        'video',
        'div[aria-label="Expand video"] video',
        'div[aria-label="Play video"][role="button"]',
        'div[data-testid="media-container"] video',
        'div[data-visualcompletion="media-vc-image"][style*="background-image"]',
        'div[role="button"][aria-label*="video"]',
        'a[href*="video_redirect"]',
        'div.x78zum5.xdt5ytf.x16ldp7u > div[role="button"]'
      ],

      // Selectors for files (new)
      messageFileElement: [
        'a[href*="attachment.php"]',
        'a[href*="cdn.fbsbx.com"][download]',
        'div[data-testid="attachment"]',
        'div[role="button"][aria-label*="file"]',
        'div[aria-label*="archivo adjunto"]'
      ],

      // Selectors for location (new)
      messageLocationElement: [
        'div[data-testid="map_container"]',
        'a[href*="l.facebook.com/l.php"][href*="maps"]',
        'a[href*="google.com/maps"]',
        'div[aria-label*="location"]',
        'div[aria-label*="ubicación"]'
      ],

      // Selectors for GIFs and stickers (new)
      messageGifElement: [
        'div[data-testid="sticker"] img',
        'img[src*="tenor.com"]',
        'img[src*="giphy.com"]',
        'div[aria-label*="GIF"]'
      ],

      sellerIndicators: [
        'div[aria-label="Mark as sold"], div[aria-label="Marcar como vendido"]',
        'div[aria-label="Mark as pending"], div[aria-label="Marcar como pendiente"]',
        'div[aria-label="Mark as available"], div[aria-label="Marcar como disponible"]',
        'a[aria-label="View buyer"], a[aria-label="Ver comprador"]',
        'div[aria-label="View buyer"], div[aria-label="Ver comprador"]'
      ],
      buyerIndicators: [
        'a[aria-label="See details"]',
        'div[aria-label="View listing"], div[aria-label="Ver artículo"]',
        'div[aria-label="Create plan"]',
        'a[aria-label="View listing"], a[aria-label="Ver artículo"]',
        'a[aria-label="View seller profile"], a[aria-label="Ver perfil del vendedor"]'
      ],
      productLink: 'a[href*="/marketplace/item/"]',
      productInfo: 'div[class*="x1sliqq"], div[role="main"] > div > div > div:first-child',
      messageInput: 'div[contenteditable="true"][role="textbox"], div[aria-label="Message"], p.xat24cr.xdj266r',
      sendButton: [
        'div[aria-label="Press enter to send"]',
        'div[aria-label="Pulsa Intro para enviar"]',
        'div[role="button"][aria-label*="send"]',
        'div[role="button"][aria-label*="enviar"]',
        'div.x1i10hfl[role="button"].xjbqb8w',
        'div.x78zum5[role="button"].xjbqb8w',
        'div.x1i10hfl[role="button"]:not([aria-hidden="true"])',
        'div[role="button"][tabindex="0"]:not([style*="visibility: hidden"])',
        'div[aria-label="Press enter to send"][role="button"]',
      ],
      scrollbar: [
        // Selector found by diagnostics (contains the real scroll)
        'div.x78zum5.xdt5ytf.x1iyjqo2 > div[role="none"]',
        'div[style*="overflow-y: auto"][style*="height"]',
        'div[style*="overflow: auto"][style*="height"]',
        // Existing selectors as backup
        '.x1uipg7g > div:nth-child(1) > div:nth-child(1)',
        'div.x4k7w5x > div[style*="height"]',
        'div[role="main"] div.x1n2onr6[style*="height"]'
      ],
      chatBeginningIndicators: [
        'div[role="img"][aria-label]',
        'h4.xdj266r.x11i5rnm.xat24cr.x1mh8g0r',
        'ul.x6s0dn4.x78zum5.xl56j7k.xsag5q8.x1y1aw1k',
        'div.x1eb86dx.xsag5q8.x1ye3gou.xn6708d.x1cnzs8'
      ],
    }
  },

  // --- REFACTOR: Simplified loading logic ---
  loadFromStorage() {
    try {
      const storage = this.getStorage();

      // Load Operation Mode
      const storedOperationMode = storage.FB_CHAT_OPERATION_MODE || storage.FB_CHAT_MODE || 'manual';
      this.operationMode = storedOperationMode;

      // Load API Key directly into the single source of truth
      if (storage.FB_CHAT_API_KEY) {
        this.AI.apiKey = storage.FB_CHAT_API_KEY;
      }

      // Load Model directly into the single source of truth
      if (storage.FB_CHAT_MODEL) {
        this.AI.model = storage.FB_CHAT_MODEL;
      }

      // Load Assistants directly into the single source of truth
      if (storage.FB_CHAT_ASSISTANTS) {
        try {
          const assistantsData = typeof storage.FB_CHAT_ASSISTANTS === 'string'
            ? JSON.parse(storage.FB_CHAT_ASSISTANTS)
            : storage.FB_CHAT_ASSISTANTS;

          if (assistantsData && typeof assistantsData === 'object') {
            if (assistantsData.seller) this.AI.assistants.seller = { ...this.AI.assistants.seller, ...assistantsData.seller };
            if (assistantsData.buyer) this.AI.assistants.buyer = { ...this.AI.assistants.buyer, ...assistantsData.buyer };
          }
        } catch (e) {
          if (typeof logger !== 'undefined') logger.error(`Error parsing assistants from storage: ${e.message}`);
        }
      }

      if (typeof logger !== 'undefined') logger.log('Configuration loaded from storage');
      return this;
    } catch (error) {
      if (typeof logger !== 'undefined') logger.error(`Error loading configuration: ${error.message}`);
      return this;
    }
  },

  // --- REFACTOR: Simplified saving logic ---
  saveApiKey(apiKey) {
    if (!apiKey || typeof apiKey !== 'string') {
      if (typeof logger !== 'undefined') logger.error('Invalid API Key provided to saveApiKey');
      return false;
    }
    this.AI.apiKey = apiKey; // Update the single source of truth
    this.saveToStorage('FB_CHAT_API_KEY', apiKey);
    if (typeof logger !== 'undefined') logger.log('API Key saved');
    return true;
  },

  saveModel(model) {
    if (!model || typeof model !== 'string') {
      if (typeof logger !== 'undefined') logger.error('Invalid model provided');
      return false;
    }
    this.AI.model = model; // Update the single source of truth
    this.saveToStorage('FB_CHAT_MODEL', model);
    if (typeof logger !== 'undefined') logger.log(`Model changed to: ${model}`);
    return true;
  },

  saveAssistants(assistants) {
    if (!assistants || typeof assistants !== 'object') {
      if (typeof logger !== 'undefined') logger.error('Invalid assistants configuration');
      return false;
    }
    if (assistants.seller) this.AI.assistants.seller = { ...this.AI.assistants.seller, ...assistants.seller };
    if (assistants.buyer) this.AI.assistants.buyer = { ...this.AI.assistants.buyer, ...assistants.buyer };
    this.saveToStorage('FB_CHAT_ASSISTANTS', JSON.stringify(this.AI.assistants));
    if (typeof logger !== 'undefined') logger.log('Assistants configuration updated');
    return true;
  },

  // --- Storage utilities (sin cambios) ---
  getStorage() {
    const storage = {};
    const keysToLoad = ['FB_CHAT_OPERATION_MODE', 'FB_CHAT_MODE', 'FB_CHAT_API_KEY', 'FB_CHAT_MODEL', 'FB_CHAT_ASSISTANTS'];
    if (typeof GM_getValue === 'function') {
      keysToLoad.forEach(key => {
        const value = GM_getValue(key);
        if (value !== undefined) storage[key] = value;
      });
    } else {
      keysToLoad.forEach(key => {
        const value = localStorage.getItem(key);
        if (value !== null) storage[key] = value;
      });
    }
    return storage;
  },

  saveToStorage(key, value) {
    try {
      const storageValue = typeof value === 'object' ? JSON.stringify(value) : value;
      if (typeof GM_setValue === 'function') {
        GM_setValue(key, storageValue);
      } else {
        localStorage.setItem(key, storageValue);
      }
      return true;
    } catch (e) {
      if (typeof logger !== 'undefined') logger.error(`Error saving to storage [${key}]: ${e.message}`);
      return false;
    }
  },

  // Thread management system configurations
  threadSystem: {
    // Configurations for new threads
    newThreads: {
      maxMessages: 50,          // Limit the number of messages in new threads
      maxProductImages: 5,      // Maximum number of product images to include
      imageDetail: "high",      // Image quality: "high" or "low"
    },
    
    // Configurations for existing threads
    existingThreads: {
      ignoreOlderThan: 24 * 60 * 60 * 1000, // 24h in milliseconds
      onlyNewConversations: false,          // If true, ignore old chats
    },
    
    // General configurations for the thread system
    general: {
      threadTTL: 2 * 60 * 60 * 1000,       // Thread lifetime: 2 hours
      threadCleanupInterval: 15 * 60 * 1000, // Cleanup interval: 15 minutes
      threadInfoMaxAge: 30 * 24 * 60 * 60 * 1000 // Maximum age for thread information: 30 days
    }
  },
});

// --- REFACTOR: Add getters/setters for backward compatibility ---
// This ensures that old code accessing CONFIG.apiKey still works,
// but it reads from and writes to the new CONFIG.AI.apiKey.
Object.defineProperties(CONFIG, {
  'apiKey': {
    get: function() { return this.AI.apiKey; },
    set: function(value) { this.AI.apiKey = value; },
    enumerable: true,
    configurable: true
  },
  'model': {
    get: function() { return this.AI.model; },
    set: function(value) { this.AI.model = value; },
    enumerable: true,
    configurable: true
  },
  'assistants': {
    get: function() { return this.AI.assistants; },
    set: function(value) { this.AI.assistants = value; },
    enumerable: true,
    configurable: true
  },
  'modo': {
    get: function() { return this.operationMode; },
    set: function(value) { this.operationMode = value; },
    enumerable: true,
    configurable: true
  }
});

// Export the configuration
window.CONFIG = CONFIG;

// FIX: Add function for diagnosis that can be called from the console
window.diagnoseModeConfig = function () {
  const gmMode = typeof GM_getValue === 'function' ? GM_getValue('FB_CHAT_MODE') : 'N/A';
  const gmOpMode = typeof GM_getValue === 'function' ? GM_getValue('FB_CHAT_OPERATION_MODE') : 'N/A';
  const lsMode = localStorage.getItem('FB_CHAT_MODE');
  const lsOpMode = localStorage.getItem('FB_CHAT_OPERATION_MODE');

  const result = {
    currentConfig: {
      operationMode: CONFIG.operationMode,
      modo: CONFIG.modo, // 'modo' is the legacy property name
      areSynced: CONFIG.operationMode === CONFIG.modo
    },
    storage: {
      GM: { FB_CHAT_MODE: gmMode, FB_CHAT_OPERATION_MODE: gmOpMode },
      localStorage: { FB_CHAT_MODE: lsMode, FB_CHAT_OPERATION_MODE: lsOpMode }
    },
    responseManager: window.responseManager ? {
      isAutomodeEnabled: window.responseManager.isAutomodeEnabled
    } : 'Not available'
  };

  console.log('[Mode Diagnosis]', result);
  return result;
};