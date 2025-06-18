// ----- CONFIG MODULE -----

// Create an empty global object first to avoid TDZ issues
var CONFIG = {};

/**
 * Global script configuration
 * Contains DOM selectors and customizable settings
 */
// Initialize properties after creation
Object.assign(CONFIG, {
  // Current version for internal control and migrations
  version: '1.0.0',

  // Standard property for operation mode ('auto' or 'manual')
  operationMode: 'manual',

  // Add a getter/setter to maintain compatibility with old code
  get modo() {
    return this.operationMode;
  },

  set modo(value) {
    if (value === 'auto' || value === 'manual') {
      this.operationMode = value;
      if (typeof logger !== 'undefined') {
        logger.debug(`Mode updated via 'modo' property: ${value}`);
      }
    }
  },

  // API Key for OpenAI
  apiKey: null,

  // AI section to centralize artificial intelligence configuration
  AI: {
    apiKey: null,       // API key for OpenAI
    model: 'gpt-4o', // Default model
    maxTokens: 2048,    // Maximum tokens per response
    temperature: 0.7,   // Temperature for generation
    useAssistantAPI: true, // Use Assistants API instead of completions
    provider: 'openai', // AI provider (for future extensibility)

    // Add the missing assistants property
    assistants: {
      seller: {
        id: null,
        name: "Seller Assistant",
        instructions: "Act as a professional, friendly, and concise salesperson."
      },
      buyer: {
        id: null,
        name: "Buyer Assistant",
        instructions: "Act as an interested buyer, asking relevant questions about the product."
      }
    },

    // Function to synchronize with old configuration
    syncWithLegacyConfig: function () {
      // Synchronize apiKey between the two locations for compatibility
      if (CONFIG.apiKey && !this.apiKey) {
        this.apiKey = CONFIG.apiKey;
      } else if (this.apiKey && !CONFIG.apiKey) {
        CONFIG.apiKey = this.apiKey;
      }

      // Synchronize model
      if (CONFIG.model && CONFIG.model !== this.model) {
        this.model = CONFIG.model;
      }

      // Synchronize assistants with old configuration
      if (CONFIG.assistants) {
        if (CONFIG.assistants.seller) {
          this.assistants.seller = { ...this.assistants.seller, ...CONFIG.assistants.seller };
        }
        if (CONFIG.assistants.buyer) {
          this.assistants.buyer = { ...this.assistants.buyer, ...CONFIG.assistants.buyer };
        }
      }
    }
  },

  // Model to use (default)
  model: 'gpt-4o',

  // Minimum time between automatic responses (ms)
  autoResponseDelay: 5000,

  // Flag to enable/disable human typing simulation
  simulateHumanTyping: true,

  // Configuration for audio transcription
  audioTranscription: {
    enabled: false, // Disabled by default
    apiKey: null,   // Use a specific API key or the general one
    model: 'whisper-1', // Model for transcription
    maxDuration: 120 // Maximum duration in seconds
  },

  // Assistants configuration
  assistants: {
    seller: {
      id: null,
      name: "Seller Assistant",
      instructions: "Act as a professional, friendly, and concise salesperson."
    },
    buyer: {
      id: null,
      name: "Buyer Assistant",
      instructions: "Act as an interested buyer, asking relevant questions about the product."
    }
  },

  // Flag to enable/disable automatic message sending (will only take effect when operationMode is 'auto')
  autoSendMessages: true,

  // Delay between text insertion and message sending (ms)
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

  /**
   * Initializes configuration on load
   */
  init() {
    // Load from storage
    this.loadFromStorage();

    // Initialize additional configurations
    this.initializeExtras();

    // Synchronize old configuration with the new AI structure
    if (this.AI && typeof this.AI.syncWithLegacyConfig === 'function') {
      this.AI.syncWithLegacyConfig();
    }

    // FIX: Log to diagnose mode status after loading
    if (typeof logger !== 'undefined') {
      logger.debug(`Configuration initialized. Mode: ${this.operationMode}, modo property: ${this.modo}`);

      // FIX: Additional log for values in storage
      const gmMode = typeof GM_getValue === 'function' ? GM_getValue('FB_CHAT_MODE') : null;
      const gmOpMode = typeof GM_getValue === 'function' ? GM_getValue('FB_CHAT_OPERATION_MODE') : null;
      const lsMode = localStorage.getItem('FB_CHAT_MODE');
      const lsOpMode = localStorage.getItem('FB_CHAT_OPERATION_MODE');

      logger.debug(`Storage status - GM: modo=${gmMode}, opMode=${gmOpMode} | LS: modo=${lsMode}, opMode=${lsOpMode}`);
    }

    return true;
  },

  /**
   * Initializes additional configurations
   */
  initializeExtras() {
    // Configure listeners for changes
    document.addEventListener('configUpdated', (event) => {
      const details = event?.detail || {};

      // If a mode was specified in the event, update
      if (details.operationMode) {
        this.operationMode = details.operationMode;
        logger.debug(`Mode updated by event: ${this.operationMode}, source: ${details.source || 'unknown'}`);
      }
    });

    return true;
  },

  // Synchronization with storage
  loadFromStorage() {
    try {
      const storage = this.getStorage();

      // Get mode from any of the properties, with priority for the new one
      const storedOperationMode = storage.FB_CHAT_OPERATION_MODE;
      const storedMode = storage.FB_CHAT_MODE;

      // FIX: Log for diagnosis
      if (typeof logger !== 'undefined') {
        logger.debug(`Mode values found - FB_CHAT_OPERATION_MODE: ${storedOperationMode}, FB_CHAT_MODE: ${storedMode}`);
      }

      // Choose the correct value with priority for the new property
      let effectiveMode = null;
      if (storedOperationMode === 'auto' || storedOperationMode === 'manual') {
        effectiveMode = storedOperationMode;
        if (typeof logger !== 'undefined') {
          logger.debug(`Mode loaded from FB_CHAT_OPERATION_MODE: ${effectiveMode}`);
        }
      } else if (storedMode === 'auto' || storedMode === 'manual') {
        effectiveMode = storedMode;
        if (typeof logger !== 'undefined') {
          logger.debug(`Mode loaded from FB_CHAT_MODE (legacy): ${effectiveMode}`);
        }
        // Migrate to the new format
        this.saveToStorage('FB_CHAT_OPERATION_MODE', storedMode);
        if (typeof logger !== 'undefined') {
          logger.debug(`Mode migrated from FB_CHAT_MODE to FB_CHAT_OPERATION_MODE: ${storedMode}`);
        }
      } else {
        // FIX: If none is defined, assign a default value and save it
        effectiveMode = 'manual'; // Default value if nothing is saved
        if (typeof logger !== 'undefined') {
          logger.debug(`No saved value found for mode. Assigning default value: ${effectiveMode}`);
        }
        this.saveToStorage('FB_CHAT_OPERATION_MODE', effectiveMode);
        this.saveToStorage('FB_CHAT_MODE', effectiveMode);
      }

      // Set the mode if a valid one was found
      if (effectiveMode) {
        this.operationMode = effectiveMode;
      }

      // Load API Key
      if (storage.FB_CHAT_API_KEY) {
        this.apiKey = storage.FB_CHAT_API_KEY;
        if (this.AI) this.AI.apiKey = storage.FB_CHAT_API_KEY; // Also update in AI structure
      }

      // Load model
      if (storage.FB_CHAT_MODEL) {
        this.model = storage.FB_CHAT_MODEL;
        if (this.AI) this.AI.model = storage.FB_CHAT_MODEL; // Also update in AI structure
      }

      // Load assistants configuration if it exists
      if (storage.FB_CHAT_ASSISTANTS) {
        try {
          const assistantsData = typeof storage.FB_CHAT_ASSISTANTS === 'string'
            ? JSON.parse(storage.FB_CHAT_ASSISTANTS)
            : storage.FB_CHAT_ASSISTANTS;

          if (assistantsData && typeof assistantsData === 'object') {
            // Update only existing properties in both structures
            if (assistantsData.seller) {
              this.assistants.seller = { ...this.assistants.seller, ...assistantsData.seller };
              if (this.AI && this.AI.assistants) {
                this.AI.assistants.seller = { ...this.AI.assistants.seller, ...assistantsData.seller };
              }
            }
            if (assistantsData.buyer) {
              this.assistants.buyer = { ...this.assistants.buyer, ...assistantsData.buyer };
              if (this.AI && this.AI.assistants) {
                this.AI.assistants.buyer = { ...this.AI.assistants.buyer, ...assistantsData.buyer };
              }
            }
          }
        } catch (assistantsError) {
          if (typeof logger !== 'undefined') {
            logger.error(`Error parsing assistants: ${assistantsError.message}`);
          }
        }
      }

      if (typeof logger !== 'undefined') {
        logger.log('Configuration loaded from storage');
        // Explicit log of the final state
        logger.debug(`Final state after loading: operationMode=${this.operationMode}, modo=${this.modo}`);
      }

      // FIX: Always return the CONFIG object, not just boolean
      return this;
    } catch (error) {
      if (typeof logger !== 'undefined') {
        logger.error(`Error loading configuration: ${error.message}`);
      }
      return this;
    }
  },

  /**
   * Updates the operation mode and ensures it is saved correctly
   * @param {string} mode - 'auto' or 'manual'
   * @returns {boolean} True if updated correctly
   */
  updateOperationMode(mode) {
    if (mode !== 'auto' && mode !== 'manual') {
      logger.error(`Invalid operation mode: ${mode}. Must be 'auto' or 'manual'`);
      return false;
    }

    // Update in memory
    this.operationMode = mode;

    // Save in both the new and old key to ensure compatibility
    if (typeof GM_setValue === 'function') {
      GM_setValue('FB_CHAT_OPERATION_MODE', mode);
      GM_setValue('FB_CHAT_MODE', mode); // Keep the old key synchronized
    } else {
      localStorage.setItem('FB_CHAT_OPERATION_MODE', mode);
      localStorage.setItem('FB_CHAT_MODE', mode); // Keep the old key synchronized
    }

    // Notify mode change
    logger.log(`Operation mode updated to: ${mode.toUpperCase()}`);

    // FIX: Dispatch event to notify other components with more information
    document.dispatchEvent(new CustomEvent('configUpdated', {
      detail: {
        operationMode: mode,
        modo: mode, // For compatibility
        source: 'updateOperationMode'
      }
    }));

    // Update UI if available
    if (window.ui && typeof window.ui.updateModeUI === 'function') {
      window.ui.updateModeUI(mode);
    }

    // Verify that responseManager updates its state if it exists
    if (window.responseManager) {
      window.responseManager.isAutomodeEnabled = mode === 'auto';
      logger.debug(`ResponseManager updated: automode=${window.responseManager.isAutomodeEnabled}`);
    }

    // Log to console for debug
    logger.debug(`Mode updated: operationMode=${this.operationMode}, modo=${this.modo}`);

    return true;
  },

  /**
   * Saves the API key in the configuration
   * @param {string} apiKey - The API key for OpenAI
   * @returns {boolean} True if saved correctly
   */
  saveApiKey(apiKey) {
    if (!apiKey || typeof apiKey !== 'string') {
      logger.error('Invalid API Key');
      return false;
    }

    this.apiKey = apiKey;
    // Also update in the new AI structure
    if (this.AI) this.AI.apiKey = apiKey;
    this.saveToStorage('FB_CHAT_API_KEY', apiKey);

    logger.log('API Key saved');
    return true;
  },

  /**
   * Saves the model to use
   * @param {string} model - The OpenAI model
   * @returns {boolean} True if saved correctly
   */
  saveModel(model) {
    if (!model || typeof model !== 'string') {
      logger.error('Invalid model');
      return false;
    }

    this.model = model;
    // Also update in the new AI structure
    if (this.AI) this.AI.model = model;
    this.saveToStorage('FB_CHAT_MODEL', model);

    logger.log(`Model changed to: ${model}`);
    return true;
  },

  /**
   * Saves the assistants configuration
   * @param {Object} assistants - Assistants configuration
   * @returns {boolean} True if saved correctly
   */
  saveAssistants(assistants) {
    if (!assistants || typeof assistants !== 'object') {
      logger.error('Invalid assistants configuration');
      return false;
    }

    // Update only if there is valid data for each role
    if (assistants.seller) {
      this.assistants.seller = { ...this.assistants.seller, ...assistants.seller };
      if (this.AI && this.AI.assistants) {
        this.AI.assistants.seller = { ...this.AI.assistants.seller, ...assistants.seller };
      }
    }
    if (assistants.buyer) {
      this.assistants.buyer = { ...this.assistants.buyer, ...assistants.buyer };
      if (this.AI && this.AI.assistants) {
        this.AI.assistants.buyer = { ...this.AI.assistants.buyer, ...assistants.buyer };
      }
    }

    // Save to storage
    this.saveToStorage('FB_CHAT_ASSISTANTS', JSON.stringify(this.assistants));

    logger.log('Assistants configuration updated');
    return true;
  },

  // Method to get the storage object (GM_* or localStorage)
  getStorage() {
    // Create a wrapper that unifies access to GM_* and localStorage
    const storage = {};

    // Detect availability of GM_setValue/GM_getValue
    const hasGMStorage = typeof GM_getValue === 'function' && typeof GM_setValue === 'function';

    // If GM_* is available, use it for all keys
    if (hasGMStorage) {
      // Get all available keys
      let allKeys = [];
      if (typeof GM_listValues === 'function') {
        allKeys = GM_listValues();
      }

      // Iterate over known keys if GM_listValues is not available
      if (!allKeys.length) {
        allKeys = [
          'FB_CHAT_MODE',
          'FB_CHAT_OPERATION_MODE',
          'FB_CHAT_API_KEY',
          'FB_CHAT_MODEL',
          'FB_CHAT_ASSISTANTS'
        ];
      }

      // Load each key into the storage object
      allKeys.forEach(key => {
        try {
          storage[key] = GM_getValue(key);
        } catch (e) {
          logger.debug(`Error reading key ${key} from GM_getValue: ${e.message}`);
        }
      });
    } else {
      // Use localStorage as fallback
      // Copy all keys starting with FB_CHAT_
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('FB_CHAT_')) {
          try {
            let value = localStorage.getItem(key);
            // Try to parse as JSON if possible
            try {
              const parsedValue = JSON.parse(value);
              value = parsedValue;
            } catch (e) {
              // Not JSON, use the value as is
            }
            storage[key] = value;
          } catch (e) {
            logger.debug(`Error reading key ${key} from localStorage: ${e.message}`);
          }
        }
      }
    }

    return storage;
  },

  // Method to save a value to storage
  saveToStorage(key, value) {
    try {
      // Try to use GM_setValue first
      if (typeof GM_setValue === 'function') {
        GM_setValue(key, value);
        return true;
      }

      // Fallback to localStorage
      // Convert objects to JSON
      const storageValue = typeof value === 'object' ? JSON.stringify(value) : value;
      localStorage.setItem(key, storageValue);
      return true;
    } catch (e) {
      logger.error(`Error saving to storage [${key}]: ${e.message}`);
      return false;
    }
  },

  /**
   * Checks the configuration status
   * @returns {Object} Configuration status
   */
  checkStatus() {
    const isApiKeySet = !!this.apiKey || (this.AI && !!this.AI.apiKey);
    const isModelSet = !!this.model || (this.AI && !!this.AI.model);
    const isOperationModeValid = this.operationMode === 'auto' || this.operationMode === 'manual';

    // Check if assistants are configured
    const hasAssistants =
      (this.assistants.seller && this.assistants.seller.id) ||
      (this.assistants.buyer && this.assistants.buyer.id) ||
      (this.AI && this.AI.assistants && (
        (this.AI.assistants.seller && this.AI.assistants.seller.id) ||
        (this.AI.assistants.buyer && this.AI.assistants.buyer.id)
      ));

    return {
      isReady: isApiKeySet && isModelSet && isOperationModeValid,
      isApiKeySet,
      isModelSet,
      isOperationModeValid,
      operationMode: this.operationMode,
      hasAssistants,
    };
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