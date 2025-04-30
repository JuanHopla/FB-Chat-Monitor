/**
 * FB-Chat-Monitor - Main script
 * This script initializes system components and provides the public API
 */

import { ChatManager } from './chatManager.js';
import { openAIManager } from './openai-manager.js';
import { assistantManagerUI } from './assistant-manager-ui.js';
import { logger } from './utils.js';
import { CONFIG } from './config.js';

// Function to initialize the system
async function initialize() {
  logger.log('Initializing FB-Chat-Monitor v' + CONFIG.version);
  
  // Initialize OpenAI Manager
  openAIManager.initialize(CONFIG.AI.apiKey, CONFIG.AI.model);
  
  // Expose global API
  window.FB_CHAT_MONITOR_API = {
    ChatManager,
    config: CONFIG,
    openAIManager,
    setApiKey: (apiKey) => openAIManager.initialize(apiKey),
    setOperationMode: (mode) => {
      if (['auto', 'manual', 'generate'].includes(mode)) {
        CONFIG.operationMode = mode;
        localStorage.setItem('FB_CHAT_MONITOR_MODE', mode);
        return true;
      }
      return false;
    },
    showAssistantManager: () => assistantManagerUI.initialize(),
    version: CONFIG.version
  };
  
  // Also expose on document for compatibility
  document.FB_CHAT_MONITOR_API = window.FB_CHAT_MONITOR_API;
  
  logger.log('Global API exposed as FB_CHAT_MONITOR_API');
}

// Main function to run the monitor
async function runMarketplaceMonitor() {
  logger.log('Starting Marketplace monitor...');
  
  try {
    // Initialize system
    await initialize();
    
    // Show assistant management interface if API key is set
    if (CONFIG.AI.apiKey) {
      assistantManagerUI.initialize();
    }
    
    // Scan for unread chats
    const unreadCount = await ChatManager.scanForUnreadChats();
    logger.log(`Found ${unreadCount} unread chats`);
    
    // If there are unread chats, process the first one
    if (unreadCount > 0) {
      await ChatManager.openNextPendingChat();
    }
    
    // Schedule periodic scanning
    setInterval(async () => {
      const newUnreadCount = await ChatManager.scanForUnreadChats();
      if (newUnreadCount > 0) {
        await ChatManager.openNextPendingChat();
      }
    }, CONFIG.scanInterval);
    
    logger.log('Marketplace monitor started successfully');
    return true;
  } catch (error) {
    logger.error(`Error starting monitor: ${error.message}`);
    return false;
  }
}

// Auto-start if we are in Marketplace
if (window.location.href.includes('facebook.com/marketplace')) {
  // Wait for page to fully load
  window.addEventListener('load', () => {
    setTimeout(runMarketplaceMonitor, 2000);
  });
}

// Export main function
export { runMarketplaceMonitor };
