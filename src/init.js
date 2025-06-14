// ----- INITIALIZATION -----
/**
 * Initialization function
 */
function initialize() {
  // Avoid duplicate initialization
  if (window.initializationInProgress) {
    return;
  }
  window.initializationInProgress = true;

  logger.log('Initializing FB Chat Monitor');

  // Create interface - USE THE FUNCTION FROM THE UI MODULE INSTEAD OF THE LOCAL FUNCTION
  // createFloatingButton(); <- THIS LINE IS THE PROBLEM
  initializeUI(); // Use this function from the UI module

  // Load API Key from previous sessions
  const savedKey = localStorage.getItem('FB_CHAT_MONITOR_OPENAI_KEY');
  if (savedKey) {
    CONFIG.AI.apiKey = savedKey;
    CONFIG.AI.enabled = true;
    logger.log('API Key loaded from localStorage in init');
  }

  // Load preferences
  // Load operation mode (auto/manual) from localStorage
  CONFIG.operationMode = localStorage.getItem('FB_CHAT_MONITOR_OPERATION_MODE') || CONFIG.defaultOperationMode;

  // Check API Key
  if (CONFIG.AI.apiKey) {
    CONFIG.AI.enabled = true;
    logger.log('API key loaded from localStorage');
    // Re-initialize OpenAI Manager
    if (window.openAIManager) {
      // Ensure openAIManager is loaded
      const ok = openAIManager.initialize(CONFIG.AI.apiKey, CONFIG.AI.model);
      logger.log(`OpenAI Manager auto-initialized: ${ok}`);
    } else {
      logger.error('openAIManager not available for auto-initialization.');
    }
  }

  // Check if OpenAI is available
  if (window.openaiManager) {
    logger.log('OpenAI Manager is available to generate responses');
  } else {
    logger.warn('OpenAI Manager is not available. Some functions may not be operational.');
  }

  // If there is also an AssistantManager, verify
  if (window.assistantManager) {
    logger.log('Assistant Manager is available to generate responses');
  }

  // Welcome message
  //logger.notify('FB Chat Monitor initialized', 'success');
  try {
    // Check if we are on the correct page before starting monitoring
    if (window.location.href.includes('/marketplace/')) {
      logger.log('We are in Marketplace, starting monitoring...');
      // Start monitoring with a slight delay to ensure the page is loaded
      setTimeout(() => {
        if (window.FBChatMonitor && typeof window.FBChatMonitor.manualScan === 'function') {
          window.FBChatMonitor.manualScan();
        } else {
          logger.warn('FBChatMonitor.manualScan not available yet');
        }
      }, 2500);
    } else {
      logger.log('We are not in Marketplace, trying redirection...');
      // If not in Marketplace, try redirecting
      if (window.pageUtils && window.pageUtils.redirectToMarketplace) {
        window.pageUtils.redirectToMarketplace();
      } else {
        logger.error('pageUtils.redirectToMarketplace not available');
      }
    }
  } catch (error) {
    logger.error(`Error in initialization: ${error.message}`);
  } finally {
    window.initializationInProgress = false;
  }
}

/**
 * Initialize services and components
 */
async function initializeServices() {
  // ...existing code...

  // Initialize audio transcriber service - Add this
  if (CONFIG.audioTranscription.enabled) {
    logger.debug('Initializing audio transcription service...');
    if (!window.audioTranscriber) {
      logger.error('Audio transcriber not loaded. Transcription services will be unavailable.');
    } else {
      logger.debug('Audio transcription service ready');
      // Start polling for audio resources early
      window.audioTranscriber.checkForAudioResources();
    }
  }

  // ...existing code...
}

// Run on load
if (document.readyState !== 'loading') {
  initialize();
} else {
  document.addEventListener('DOMContentLoaded', initialize);
}

// Final entry point - this is executed after all modules are loaded
window.addEventListener('load', () => {
  // Verify and migrate configurations from localStorage to GM_storage
  if (window.storageUtils) {
    storageUtils.checkStorageHealth();
    storageUtils.migrateSettings();
    loadConfigFromStorage(); // Load saved configurations
  } else {
    console.error('storageUtils is not available for migration and verification');
  }
  
  // Ensure that critical components are available
  if (!window.FBChatMonitor) {
    window.FBChatMonitor = {};
    console.error('FBChatMonitor is not available on load. An empty object has been created to prevent errors.');
  }
  
  // If the getMonitoringStats function does not exist, create a temporary version
  if (!window.FBChatMonitor.getMonitoringStats) {
    window.FBChatMonitor.getMonitoringStats = function() {
      return {
        chatsProcessed: 0,
        responsesSent: 0,
        errors: 0,
        uptime: 0,
        isMonitoring: false
      };
    };
    console.warn('A temporary version of getMonitoringStats has been created');
  }
  
  // Initialization of the main system if necessary
  if (!window.FBChatMonitor.initialized && typeof window.FBChatMonitor.initialize === 'function') {
    window.FBChatMonitor.initialized = true;
    window.FBChatMonitor.initialize();
  }
  
  // Add after main initialization, before starting monitoring

  // Explicitly verify the availability of services
  function verifyServices() {
    logger.log('Verifying availability of AI services...');
    
    // Verify OpenAI Manager
    if (window.openaiManager) {
      const isReady = window.openaiManager.isReady ? window.openaiManager.isReady() : 
                     (window.openaiManager.isInitialized && !!window.openaiManager.apiKey);
      
      logger.log(`OpenAI Manager auto-initialized: ${isReady}`);
      
      if (!isReady && window.storageUtils) {
        // Try to initialize manually if it is available but not initialized
        const apiKey = window.storageUtils.get('FB_CHAT_MONITOR_OPENAI_KEY', '');
        if (apiKey) {
          window.openaiManager.setApiKey(apiKey);
          logger.log('OpenAI Manager re-initialized with stored API key');
        }
      }
    } else {
      logger.warn('OpenAI Manager is not available. Some functions will not be operational.');
      
      // Create a minimal implementation as a backup
      window.openaiManager = {
        isInitialized: false,
        generateResponse: async () => {
          throw new Error('OpenAI Manager is not initialized correctly');
        },
        isReady: () => false
      };
      
      logger.debug('A backup implementation of OpenAI Manager has been created');
    }
    
    // Verify Assistant Manager
    if (window.assistantManager) {
      logger.log('Assistant Manager is available to generate responses');
    }
  }
  
  // Call the verification just before starting monitoring
  verifyServices();

  // Add after main initialization, before starting monitoring

  /**
   * Ensures the consistency of the OpenAI Manager state
   * to avoid problems with the API key and initialization
   */
  function ensureOpenAIManagerConsistency() {
    logger.log('Verifying OpenAI Manager consistency...');

    // If openaiManager does not exist, create it as a backup
    if (!window.openaiManager) {
      logger.warn('OpenAI Manager is not available, creating backup instance');
      
      // Check if we have the refactored version first
      if (typeof window.OpenAIManager === 'function') {
        window.openaiManager = new OpenAIManager();
        logger.debug('Created new instance using refactored OpenAIManager class');
      } else {
        // Fall back to original class
        window.openaiManager = new OpenAIManager();
        logger.debug('Created new instance using original OpenAIManager class');
      }
    }
    
    // If openaiManager exists but is not initialized, try to recover it
    if (!window.openaiManager.isInitialized) {
      // Check if we have API key in CONFIG
      if (CONFIG?.AI?.apiKey) {
        logger.log('Recovering OpenAI Manager state with API key from CONFIG');
        window.openaiManager.initialize(CONFIG.AI.apiKey);
      }
      // Try loading from storage as an alternative
      else {
        const storedApiKey = storageUtils.get('FB_CHAT_MONITOR_OPENAI_KEY', '');
        if (storedApiKey) {
          logger.log('Recovering OpenAI Manager state with API key from localStorage');
          window.openaiManager.initialize(storedApiKey);
        }
      }
    }
    
    // Verify if after the recovery attempts the manager is well initialized
    let isReady = false;
    
    if (typeof window.openaiManager.isReady === 'function') {
      isReady = window.openaiManager.isReady();
      logger.debug(`openaiManager.isReady() = ${isReady}`);
    } else {
      // Fallback if the isReady method is not available
      isReady = window.openaiManager.isInitialized && !!window.openaiManager.apiKey;
      logger.debug(`Fallback isReady check = ${isReady}`);
    }
    
    // Final correction if something is still wrong
    if (!isReady && window.openaiManager.apiKey) {
      logger.warn('Inconsistency detected - forcing isInitialized=true since there is API key');
      window.openaiManager.isInitialized = true;
      isReady = true;
    }
    
    // Ensure API client is initialized properly in the new version
    if (window.openaiManager.apiClient && window.openaiManager.apiKey) {
      window.openaiManager.apiClient.setApiKey(window.openaiManager.apiKey);
    }
    
    logger.log(`Final state of OpenAI Manager: ${isReady ? 'READY' : 'NOT AVAILABLE'}`);
  }

  // Call the verification function just after initializing services
  // and before starting monitoring
  ensureOpenAIManagerConsistency();

  // Also schedule a periodic check to ensure consistency
  setInterval(ensureOpenAIManagerConsistency, 60000); // Check every minute
});

/**
 * Loads configurations from storage and applies them to CONFIG
 */
function loadConfigFromStorage() {
  try {
    if (!window.CONFIG || !window.CONFIG.AI) {
      console.warn('CONFIG is not correctly initialized');
      return;
    }
    
    // OpenAI API key (priority to storageUtils)
    CONFIG.AI.apiKey = storageUtils.get('FB_CHAT_MONITOR_OPENAI_KEY', '') || 
                        localStorage.getItem('FB_CHAT_MONITOR_OPENAI_KEY') || 
                        "";
    
    // Assistant IDs
    CONFIG.AI.assistants.seller.id = storageUtils.get('FB_CHAT_MONITOR_SELLER_ASSISTANT_ID', '') || 
                                     localStorage.getItem('FB_CHAT_MONITOR_SELLER_ASSISTANT_ID') || 
                                     "";
    
    CONFIG.AI.assistants.buyer.id = storageUtils.get('FB_CHAT_MONITOR_BUYER_ASSISTANT_ID', '') || 
                                   localStorage.getItem('FB_CHAT_MONITOR_BUYER_ASSISTANT_ID') || 
                                   "";
    
    // Operation mode
    CONFIG.operationMode = storageUtils.get('FB_CHAT_MONITOR_OPERATION_MODE', CONFIG.defaultOperationMode) || 
                           localStorage.getItem('FB_CHAT_MONITOR_OPERATION_MODE') || 
                           CONFIG.defaultOperationMode;
    
    // Also update the API key for audio transcription
    if (CONFIG.audioTranscription) {
      CONFIG.audioTranscription.apiKey = CONFIG.AI.apiKey;
    }
    
    console.log('[CONFIG] Configuration loaded:', {
      apiKey: CONFIG.AI.apiKey ? '********' : '(no key)',
      model: CONFIG.AI.model, // Will always be gpt-4o
      assistants: {
        seller: CONFIG.AI.assistants.seller.id ? '(configured)' : '(not configured)',
        buyer: CONFIG.AI.assistants.buyer.id ? '(configured)' : '(not configured)'
      },
      mode: CONFIG.operationMode
    });
  } catch (error) {
    console.error('[CONFIG] Error loading configuration:', error);
  }
}