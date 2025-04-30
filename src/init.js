// ----- INITIALIZATION -----
// Initialization function
function initialize() {
  logger.log('Initializing FB Chat Monitor');
  
  // Create interface
  createFloatingButton();
  
  // Load preferences
  CONFIG.operationMode = localStorage.getItem('FB_CHAT_MONITOR_MODE') || 'manual';
  
  // Check API Key
  if (CONFIG.AI.apiKey) {
    CONFIG.AI.enabled = true;
    logger.log('API key loaded from localStorage');
  }
  
  // Welcome message
  logger.notify('FB Chat Monitor initialized', 'success');
  try {
    // Check if we are on the correct page before starting monitoring
    if (window.location.href.includes('/marketplace/')) {
      logger.log('We are in Marketplace, starting monitoring...');
      // Start monitoring with a slight delay to ensure the page is loaded
      setTimeout(runChatMonitor, 2500);
    } else {
      logger.log('We are not in Marketplace, trying redirection...');
      // If not in Marketplace, try redirecting
      redirectToMarketplace();
    }
  } catch (error) {
    logger.error(`Error in initialization: ${error.message}`);
  }
}

// Run on load
if (document.readyState !== 'loading') {
  initialize();
} else {
  document.addEventListener('DOMContentLoaded', initialize);
}

