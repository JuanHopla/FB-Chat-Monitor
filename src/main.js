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
    // 1. Check if we're on the right page
    if (pageUtils.redirectToMarketplace()) {
      logger.log('Redirecting to Marketplace messenger, please wait...');
      return; // Stop execution - we're redirecting
    }
    
    // 2. Create UI components
    createUI();
    
    // 3. Initialize OpenAI Manager (API integration)
    const openAIInitialized = openAIManager.initialize();
    if (openAIInitialized) {
      logger.log('OpenAI Manager initialized successfully');
    } else {
      logger.warn('OpenAI Manager initialized but no API key is set');
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
  // Load operation mode
  const savedMode = storageUtils.get('OPERATION_MODE', CONFIG.defaultOperationMode);
  CONFIG.operationMode = savedMode;
  
  logger.debug('Saved settings loaded', { operationMode: CONFIG.operationMode });
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
 */
function getMonitoringStats() {
  const now = Date.now();
  return {
    ...appState.stats,
    isMonitoring: appState.isMonitoring,
    uptime: appState.startTime ? now - appState.startTime : 0,
    lastScan: appState.lastScanTime ? now - appState.lastScanTime : null,
    nextScanIn: appState.monitorInterval ? (appState.lastScanTime + updateScanInterval() - now) : null,
    errorRate: appState.stats.chatsProcessed > 0 ? 
      (appState.stats.errors / appState.stats.chatsProcessed).toFixed(2) : 0
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
    showSimpleAlert('Manual scan completed', 'success');
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

// Expose methods to global scope for UI interaction
window.FBChatMonitor = {
  initialize,
  toggleMonitoring,
  manualScan,
  getMonitoringStats,
  changeOperationMode: (mode) => {
    if (['auto', 'manual', 'generate', 'training'].includes(mode)) {
      CONFIG.operationMode = mode;
      storageUtils.set('OPERATION_MODE', mode);
      logger.log(`Operation mode changed to ${mode}`);
      return true;
    }
    return false;
  }
};