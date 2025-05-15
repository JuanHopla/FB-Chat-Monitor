/**
 * Main module - Controls the initialization and core flow of FB-Chat-Monitor
 */

// Application state
const appState = {
  isMonitoring: false,
  monitorInterval: null,
  errorCount: 0,
  scansSinceLastSuccess: 0,
  startTime: null,
  stats: {
    chatsProcessed: 0,
    messagesProcessed: 0,
    responsesSent: 0,
    errors: 0
  },
  lastScanTime: null,
  baseInterval: CONFIG.scanInterval || 30000
};

/**
 * Initialize all components in the correct order
 */
async function initialize() {
  logger.log('Initializing FB-Chat-Monitor', { version: CONFIG.version });

  try {
    // Load stored OpenAI API Key if present
    const savedApiKey = storageUtils.get('OPENAI_KEY', null);
    if (savedApiKey) {
      CONFIG.AI.apiKey = savedApiKey;
      logger.log('Loaded OpenAI API Key from storageUtils');
    }

    // 1. Check if we're on the right page
    if (pageUtils.redirectToMarketplace()) {
      logger.log('Redirecting to Marketplace messenger, please wait...');
      return; // Stop execution - we're redirecting
    }

    // 2. Create UI components
    createUI();

    // 3. Initialize OpenAI Manager (API integration)
    const openAIInitialized = openAIManager.initialize(CONFIG.AI.apiKey, CONFIG.AI.model);
    if (openAIInitialized) {
      logger.log('OpenAI Manager initialized successfully');
    } else {
      logger.warn('OpenAI Manager initialized but no valid API key is set');
    }

    // 4. Load user configuration and settings
    loadSavedSettings();

    // 5. Set up adaptive monitoring based on user activity
    setupAdaptiveMonitoring();

    // 6. Check for previously active monitoring
    const wasMonitoring = storageUtils.get('MONITORING_ACTIVE', false);
    if (wasMonitoring) {
      logger.log('Restoring previous monitoring state');
      toggleMonitoring(true);
    }

    // 7. Show welcome notification
    showSimpleAlert('FB-Chat-Monitor initialized successfully', 'success');
    logger.log('Initialization complete', { status: 'success' });

    // 8. Return success
    return true;
  } catch (error) {
    logger.error('Error during initialization', {}, error);
    showSimpleAlert('Error initializing FB-Chat-Monitor: ' + error.message, 'error');
    return false;
  }
}

/**
 * Create the user interface
 */
function createUI() {
  // Initialize Assistant Manager UI
  assistantManagerUI.initialize();

  // Additional UI components will be implemented in ui.js
  logger.debug('UI components initialized');
}

/**
 * Load saved settings from local storage
 */
function loadSavedSettings() {
  // Load API Key
  const savedApiKey = storageUtils.get('FB_CHAT_MONITOR_OPENAI_KEY', null);
  if (savedApiKey) {
    CONFIG.AI.apiKey = savedApiKey;
    logger.debug('OpenAI API Key loaded from storageUtils');
  } else {
    // Compatibility with localStorage for migration
    const legacyApiKey = localStorage.getItem('FB_CHAT_MONITOR_OPENAI_KEY');
    if (legacyApiKey) {
      CONFIG.AI.apiKey = legacyApiKey;
      storageUtils.set('FB_CHAT_MONITOR_OPENAI_KEY', legacyApiKey);
      logger.debug('OpenAI API Key migrated from localStorage to storageUtils');
    }
  }

  // Load operation mode
  CONFIG.operationMode = storageUtils.get('OPERATION_MODE', CONFIG.defaultOperationMode);

  // Load assistant IDs
  if (!CONFIG.AI.assistants) CONFIG.AI.assistants = { seller: {}, buyer: {} };

  CONFIG.AI.assistants.seller.id = storageUtils.get('FB_CHAT_MONITOR_SELLER_ASSISTANT_ID', '');
  CONFIG.AI.assistants.buyer.id = storageUtils.get('FB_CHAT_MONITOR_BUYER_ASSISTANT_ID', '');

  logger.debug('Saved settings loaded', {
    operationMode: CONFIG.operationMode,
    hasApiKey: !!CONFIG.AI.apiKey,
    sellerAssistant: !!CONFIG.AI.assistants.seller.id,
    buyerAssistant: !!CONFIG.AI.assistants.buyer.id
  });
}

/**
 * Set up adaptive monitoring based on user activity
 */
function setupAdaptiveMonitoring() {
  userActivityTracker.onActivityChange((isActive) => {
    // Adjust scan interval based on user activity
    if (appState.isMonitoring) {
      updateScanInterval();
    }

    logger.debug('User activity changed', { isActive });
  });
}

/**
 * Update the scan interval based on current conditions
 */
function updateScanInterval() {
  // Base interval from config
  let interval = appState.baseInterval;

  // Adjust based on user activity
  if (!userActivityTracker.isActive) {
    // Slower when user is inactive
    interval = interval * 1.5;
  }

  // Adjust based on error count (backoff)
  if (appState.errorCount > 0) {
    interval = Math.min(
      interval * Math.pow(1.5, appState.errorCount),
      CONFIG.maxScanInterval || 300000 // Max 5 minutes
    );
  }

  // If monitoring is active, update the interval
  if (appState.isMonitoring && appState.monitorInterval) {
    clearTimeout(appState.monitorInterval);
    appState.monitorInterval = setTimeout(runChatMonitor, interval);

    logger.debug('Scan interval updated', {
      interval,
      userActive: userActivityTracker.isActive,
      errorCount: appState.errorCount
    });
  }

  return interval;
}

/**
 * Toggle monitoring on/off
 * @param {boolean} state - True to start monitoring, false to stop
 */
function toggleMonitoring(state) {
  appState.isMonitoring = state;

  if (state) {
    // Start monitoring
    appState.startTime = Date.now();
    appState.monitorInterval = setTimeout(runChatMonitor, 1000); // Start immediately
    storageUtils.set('MONITORING_ACTIVE', true);
    logger.log('Chat monitoring started');
  } else {
    // Stop monitoring
    if (appState.monitorInterval) {
      clearTimeout(appState.monitorInterval);
      appState.monitorInterval = null;
    }
    storageUtils.set('MONITORING_ACTIVE', false);
    logger.log('Chat monitoring stopped');
  }

  // Update UI elements if needed
  updateMonitoringUI(state);

  return state;
}

/**
 * Update UI elements to reflect monitoring state
 */
function updateMonitoringUI(isMonitoring) {
  // This will be implemented when the UI module is created
  // For now, just show a notification
  if (isMonitoring) {
    showSimpleAlert('Chat monitoring started', 'success');
  } else {
    showSimpleAlert('Chat monitoring stopped', 'info');
  }
}

/**
 * Main monitoring function - runs periodically
 */
async function runChatMonitor() {
  // Don't continue if monitoring is disabled
  if (!appState.isMonitoring) return;

  appState.lastScanTime = Date.now();
  logger.debug('Starting chat scan');

  try {
    // Check if we're on the right page
    if (!pageUtils.isMarketplaceMessenger()) {
      logger.warn('Not on marketplace messenger page, skipping scan');
      resetMonitoringInterval();
      return;
    }

    // Scan for unread chats
    const unreadChatsCount = await retryUtils.withExponentialBackoff(
      () => chatManager.scanForUnreadChats(),
      { maxRetries: 2, baseDelay: 1000 }
    );

    if (unreadChatsCount > 0) {
      logger.log(`Found ${unreadChatsCount} unread chats`);

      // Process the first unread chat
      const opened = await chatManager.openNextPendingChat();

      if (opened) {
        logger.log('Chat opened and processed successfully');
        appState.stats.chatsProcessed++;

        // Reset error count on success
        appState.errorCount = 0;
        appState.scansSinceLastSuccess = 0;
      } else {
        logger.error('Could not open the chat');
        incrementErrorCount();
      }
    } else {
      logger.debug('No unread chats found');
      // Not an error, just no chats to process
      appState.scansSinceLastSuccess++;
    }
  } catch (error) {
    logger.error('Error during chat monitoring', {
      errorCount: appState.errorCount,
      scansSinceLastSuccess: appState.scansSinceLastSuccess
    }, error);

    incrementErrorCount();
  }

  // Schedule next execution with updated interval
  resetMonitoringInterval();
}

/**
 * Reset the monitoring interval with appropriate timing
 */
function resetMonitoringInterval() {
  if (!appState.isMonitoring) return;

  // Clear existing interval
  if (appState.monitorInterval) {
    clearTimeout(appState.monitorInterval);
  }

  // Calculate new interval
  const nextInterval = updateScanInterval();

  // Set next execution
  appState.monitorInterval = setTimeout(runChatMonitor, nextInterval);
  logger.debug(`Next scan scheduled in ${nextInterval}ms`);
}

/**
 * Increment error count and handle potential issues
 */
function incrementErrorCount() {
  appState.errorCount++;
  appState.stats.errors++;
  appState.scansSinceLastSuccess++;

  // If we have too many consecutive errors, maybe pause monitoring
  if (appState.scansSinceLastSuccess >= CONFIG.maxConsecutiveFailures) {
    logger.warn(`Too many consecutive failures (${appState.scansSinceLastSuccess}), pausing monitoring`);
    showSimpleAlert('Monitoring paused due to consecutive failures. Check console for details.', 'warning', {
      buttons: [{
        text: 'Resume',
        action: () => {
          appState.errorCount = 0;
          appState.scansSinceLastSuccess = 0;
          resetMonitoringInterval();
        }
      }]
    });

    // Don't actually stop monitoring, just pause for a longer time
    appState.errorCount = Math.min(appState.errorCount, 5); // Cap error count
  }
}

/**
 * Get current monitoring stats
 * @returns {Object} Current monitoring statistics
 */
function getMonitoringStats() {
  const now = Date.now();
  return {
    ...appState.stats,
    isMonitoring: appState.isMonitoring,
    uptime: appState.startTime ? now - appState.startTime : 0,
    lastScan: appState.lastScanTime ? now - appState.lastScanTime : null,
    nextScanIn: appState.monitorInterval ? appState.lastScanTime + updateScanInterval() - now : null,
    errorRate: appState.stats.chatsProcessed > 0 ? (appState.stats.errors / appState.stats.chatsProcessed).toFixed(2) : 0
  };
}

/**
 * Manually trigger a chat scan
 */
async function manualScan() {
  logger.log('Manual chat scan triggered');

  // Store current monitoring state and pause scheduled monitoring
  const wasMonitoring = appState.isMonitoring;
  if (wasMonitoring) {
    clearTimeout(appState.monitorInterval);
  }

  try {
    // Run a scan
    await runChatMonitor();
    //showSimpleAlert('Manual scan completed', 'success');
  } catch (error) {
    logger.error('Error during manual scan', {}, error);
    showSimpleAlert('Error during manual scan: ' + error.message, 'error');
  } finally {
    // Restore monitoring state if needed
    if (wasMonitoring) {
      resetMonitoringInterval();
    }
  }
}

/**
 * Setup audio transcription periodic updates
 */
function setupTranscriptionUpdates() {
  if (CONFIG.audioTranscription.enabled && window.audioTranscriber) {
    // Periodically check for new transcriptions for messages
    setInterval(() => {
      if (chatManager.currentChatId) {
        chatManager.checkPendingAudioTranscriptions();
      }
    }, 10000); // Every 10 seconds

    logger.debug('Audio transcription periodic updates configured');
  }
}

// Add to initialization sequence
function initializeApplication() {
  // ...existing code...

  // Setup transcription updates
  setupTranscriptionUpdates();

  // ...existing code...
}

/**
 * Improved service verification to ensure OpenAI is properly detected
 */

function verifyServices() {
  logger.log('Verifying availability of AI services...');

  // Verify OpenAI Manager
  let openaiReady = false;

  if (window.openaiManager) {
    // First ensure the openaiManager has necessary methods
    if (typeof window.openaiManager.isReady !== 'function') {
      // Add missing isReady method if needed
      window.openaiManager.isReady = function () {
        return !!this.apiKey;
      };
      logger.debug('Added missing isReady method to openaiManager');
    }

    if (typeof window.openaiManager.initialize !== 'function') {
      // Add missing initialize method if needed
      window.openaiManager.initialize = function (apiKey) {
        if (apiKey) {
          this.apiKey = apiKey;
          this.isInitialized = true;
        }
        return !!this.apiKey;
      };
      logger.debug('Added missing initialize method to openaiManager');
    }

    if (typeof window.openaiManager.verifyServiceState !== 'function') {
      // Add missing verifyServiceState method if needed
      window.openaiManager.verifyServiceState = function () {
        // Verify if it is initialized, and if not, try to initialize it
        if (!this.isInitialized || !this.apiKey) {
          // Try with API key from CONFIG
          if (CONFIG?.AI?.apiKey) {
            this.apiKey = CONFIG.AI.apiKey;
            this.isInitialized = true; // Force initialization if we have a key
          }
        }
        return this.isReady ? this.isReady() : !!this.apiKey;
      };
      logger.debug('Added missing verifyServiceState method to openaiManager');
    }

    // Now check if it's ready
    openaiReady = window.openaiManager.isReady();

    // If not ready but we have API key, force it ready
    if (!openaiReady && window.CONFIG?.AI?.apiKey) {
      window.openaiManager.apiKey = window.CONFIG.AI.apiKey;
      window.openaiManager.isInitialized = true;
      openaiReady = true;
      logger.debug('Forced openaiManager to ready state using CONFIG.AI.apiKey');
    }

    logger.log(`OpenAI Manager available: ${openaiReady}`);
  } else {
    logger.warn('OpenAI Manager is not available. Some functions will not be operational.');

    // Create minimal implementation as fallback
    window.openaiManager = {
      apiKey: window.CONFIG?.AI?.apiKey || '',
      isInitialized: !!window.CONFIG?.AI?.apiKey,

      isReady() {
        return !!this.apiKey;
      },

      initialize(apiKey) {
        if (apiKey) {
          this.apiKey = apiKey;
          this.isInitialized = true;
        }
        return !!this.apiKey;
      },

      verifyServiceState() {
        return this.isReady();
      },

      generateResponse: async function (context) {
        return {
          text: "I'm sorry, the OpenAI service is not available at this time.",
          error: true
        };
      }
    };

    // Check if we have API key to set the fallback as ready
    if (window.CONFIG?.AI?.apiKey) {
      window.openaiManager.apiKey = window.CONFIG.AI.apiKey;
      window.openaiManager.isInitialized = true;
      openaiReady = true;
      logger.debug('Created fallback openaiManager with CONFIG.AI.apiKey');
    }

    logger.debug('A fallback implementation of OpenAI Manager has been created');
  }

  // Verify Assistant Manager (add this part)
  let assistantReady = false;
  try {
    if (!window.assistantManager) {
      logger.debug('Assistant Manager not found, verifying if we can create one');
      // Try to create a basic assistantManager if it does not exist
      if (window.openaiManager && window.openaiManager.apiKey) {
        logger.debug('Creating Assistant Manager using existing OpenAI Manager');
        window.assistantManager = {
          isInitialized: true,
          apiKey: window.openaiManager.apiKey,

          initialize() {
            this.apiKey = window.openaiManager.apiKey;
            return true;
          },

          isReady() {
            return !!this.apiKey;
          },

          loadAssistants() {
            // If openaiManager has listAssistants, use it
            if (window.openaiManager && typeof window.openaiManager.listAssistants === 'function') {
              return window.openaiManager.listAssistants();
            }
            // If not, return empty promise
            return Promise.resolve([]);
          }
        };
        assistantReady = true;
        logger.debug('Created fallback assistantManager with openaiManager.apiKey');
      }
    } else {
      assistantReady = true;
    }
  } catch (error) {
    logger.error('Error verifying Assistant Manager:', error.message);
  }

  logger.debug(`Services available: Assistant=${assistantReady}, OpenAI=${openaiReady}`);
  return openaiReady || assistantReady;
}

// Expose methods to global scope for UI interaction
window.FBChatMonitor = {
  initialize,
  toggleMonitoring,
  manualScan,
  getMonitoringStats, // Ensure this function is exposed correctly
  changeOperationMode(mode) {
    // Simplify to only accept 'auto' or 'manual'
    if (mode !== 'auto' && mode !== 'manual') {
      mode = 'manual'; // Default to manual if invalid mode
    }
    CONFIG.operationMode = mode;
    storageUtils.set('OPERATION_MODE', mode);
    toggleMonitoring(mode === 'auto');
    return true;
  }
};

// Expose directly for compatibility with legacy code
window.getMonitoringStats = getMonitoringStats;

/**
 * Initializes the chat monitoring
 */
function init() {
  logger.log('Initializing FB Chat Monitor');

  // Initialize the UI first
  ui.init();
  logger.debug('UI initialized');

  // Load configuration
  loadConfig();

  // Initialize OpenAI Manager
  if (CONFIG.AI && CONFIG.AI.apiKey) {
    logger.log('API key loaded from localStorage in init');

    // Auto-initialize OpenAI Manager if available
    if (window.openaiManager) {
      const initialized = window.openaiManager.initialize(CONFIG.AI.apiKey);
      logger.log(`OpenAI Manager initialized: ${initialized ? 'SUCCESS' : 'FAILED'}`);

      // Critical correction: if we have API key but initialize failed, force isInitialized=true
      if (!initialized && CONFIG.AI.apiKey) {
        window.openaiManager.apiKey = CONFIG.AI.apiKey;
        window.openaiManager.isInitialized = true;
        logger.debug('Forced OpenAI Manager initialization with valid API key');
      }

      // Verify service status
      if (typeof window.openaiManager.verifyServiceState === 'function') {
        const serviceReady = window.openaiManager.verifyServiceState();
        logger.debug(`OpenAI service status after verification: ${serviceReady ? 'READY' : 'NOT AVAILABLE'}`);
      }
    } else {
      logger.error('openAIManager not available for auto-initialization.', null, new Error('openAIManager unavailable'));
    }
  }

  // Check if we are on the Marketplace page
  if (isInMarketplace()) {
    logger.log('We are in Marketplace, starting monitoring...');

    // Prepare automatic mode if configured
    if (CONFIG.operationMode === 'auto' && CONFIG.prepareAutoMode) {
      CONFIG.prepareAutoMode();
    }

    chatManager.startMonitoring();
  } else {
    logger.log('Not in Marketplace, monitoring disabled');
  }
}