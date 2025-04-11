import { CONFIG } from './config.js';
import { logInfo, logDebug, logError, setLogLevel } from './utils.js';
import { chatManager } from './chatManager.js';
import { generateAIResponse, getDefaultResponse } from './aiService.js';
import { updateEnvVar, getEnvVar } from './envLoader.js';

// Main function to monitor and respond to marketplace messages
export async function runMarketplaceMonitor() {
  logInfo('Starting Marketplace Monitor');
  
  try {
    // Scan for unread chats
    const unreadCount = await chatManager.scanForUnreadChats();
    if (unreadCount > 0) {
      logInfo(`Found ${unreadCount} unread chats`);
      
      // Process the first unread chat
      await chatManager.openNextPendingChat();
      
      // Get the conversation history for this chat
      const currentChatId = chatManager.currentChatId;
      
      // No need to log entire conversation again - it's already shown by displayConversation
      logDebug(`Current chat ID: ${currentChatId}`);
      
      // Here you would integrate with an AI assistant to get a response
      const history = chatManager.getConversationHistory(currentChatId);
      const chatData = chatManager.activeChats.get(currentChatId);
      const lastMessage = history[history.length - 1];
      
      if (lastMessage && !lastMessage.isSentByYou) {
        // Try to get AI response first, fall back to default response if needed
        let responseMessage;
        
        if (CONFIG.AI.enabled && CONFIG.AI.apiKey) {
          logInfo('Generating AI response...');
          responseMessage = await generateAIResponse(
            history, 
            chatData.productInfo || null
          );
        }
        
        // Fall back to simple auto-response if AI fails or is not configured
        if (!responseMessage) {
          responseMessage = getDefaultResponse(lastMessage.content);
        }
        
        if (responseMessage) {
          await chatManager.sendMessage(responseMessage);
          logInfo(`Sent response: "${responseMessage.substring(0, 30)}${responseMessage.length > 30 ? '...' : ''}"`);
        }
      }
      
      // Setup a watcher to detect new messages in this chat
      setupActiveConversationWatcher();
    } else {
      logDebug('No unread chats found');
    }
    
    // Schedule the next scan
    setTimeout(runMarketplaceMonitor, 30000); // Check every 30 seconds
  } catch (error) {
    logInfo(`Error in marketplace monitor: ${error}`);
    // Retry after delay
    setTimeout(runMarketplaceMonitor, 60000); 
  }
}

// Set up observer to watch for new messages in the active conversation
function setupActiveConversationWatcher() {
  const chatContainer = SELECTOR_UTILS.findElement(CONFIG.MARKETPLACE.activeChat.container);
  if (!chatContainer) {
    logInfo('Cannot set up watcher - chat container not found');
    return;
  }
  
  logInfo('Watching for new messages...');
  
  const observer = new MutationObserver(async (mutations) => {
    // When new messages arrive, process them
    await chatManager.processCurrentChatMessages();
    
    // No need to log here - the chatManager.displayConversation already shows updates
  });
  
  observer.observe(chatContainer, { childList: true, subtree: true });
  logDebug('Active conversation watcher initialized');
  
  return observer;
}

// For debugging - update the debug object to include environment management
window.FB_CHAT_MONITOR = {
  chatManager,
  config: CONFIG,
  utils: SELECTOR_UTILS,
  runMonitor: runMarketplaceMonitor,
  setLogLevel: (level) => {
    if (level in LOG_LEVELS) {
      setLogLevel(LOG_LEVELS[level]);
      logInfo(`Log level set to ${level}`);
    } else {
      setLogLevel(level);
      logInfo(`Log level set to ${level}`);
    }
  },
  // Simplified AI configuration that works in Tampermonkey
  configureAI: (apiKey, model = 'gpt-3.5-turbo') => {
    // Update CONFIG directly
    CONFIG.AI.apiKey = apiKey;
    CONFIG.AI.model = model;
    CONFIG.AI.enabled = !!apiKey;
    
    // Also store in localStorage for persistence
    try {
      localStorage.setItem('FB_CHAT_MONITOR_OPENAI_KEY', apiKey);
      localStorage.setItem('FB_CHAT_MONITOR_AI_MODEL', model);
    } catch(e) {
      logError('Error saving AI config to localStorage');
    }
    
    logInfo(`AI configured with model: ${model}`);
  },
  disableAI: () => {
    CONFIG.AI.enabled = false;
    logInfo('AI responses disabled');
  },
  // Get current AI status
  getAIStatus: () => {
    return {
      enabled: CONFIG.AI.enabled,
      model: CONFIG.AI.model,
      hasApiKey: !!CONFIG.AI.apiKey
    };
  },
  // New methods for environment management
  getEnv: (key) => getEnvVar(key),
  setEnv: (key, value) => {
    const result = updateEnvVar(key, value);
    if (result) {
      // If we're setting a config value, also update it in the runtime config
      if (key.startsWith('AI_')) {
        const configKey = key.replace('AI_', '').toLowerCase();
        if (CONFIG.AI[configKey] !== undefined) {
          CONFIG.AI[configKey] = value;
        }
      }
      logInfo(`Environment variable ${key} updated`);
    }
    return result;
  }
};

// Initialize based on current URL
export function initialize() {
  if (window.location.href.includes('facebook.com/marketplace/inbox')) {
    // Small delay to ensure the page is loaded
    setTimeout(runMarketplaceMonitor, 2000);
  } else if (window.location.href.includes('messenger.com')) {
    // We'll focus on Marketplace for now
    logInfo('Messenger support coming soon!');
  }
}

/**
 * Entry point for FB-Chat-Monitor
 * @module index
 */
import { CONFIG } from './config.js';
import { logInfo, SELECTOR_UTILS, LOG_LEVELS, setLogLevel } from './utils.js';
import { chatManager } from './chatManager.js';
import { initialize, runMarketplaceMonitor } from './main.js';
import { configureAI } from './aiService.js';
import { showControlPanel } from './ui/controlPanel.js';

// SINGLE API DEFINITION - Only define the API object once in the entire codebase
const FB_CHAT_MONITOR_API = {
  chatManager,
  config: CONFIG,
  utils: SELECTOR_UTILS,
  runMonitor: runMarketplaceMonitor,
  
  // Log level management
  setLogLevel: (level) => {
    if (level in LOG_LEVELS) {
      setLogLevel(LOG_LEVELS[level]);
      logInfo(`Log level set to ${level}`);
    } else {
      setLogLevel(level);
      logInfo(`Log level set to ${level}`);
    }
  },
  
  // AI Configuration
  configureAI(apiKey, model = 'gpt-3.5-turbo') {
    try {
      localStorage.setItem('FB_CHAT_MONITOR_OPENAI_KEY', apiKey);
      localStorage.setItem('FB_CHAT_MONITOR_AI_MODEL', model);
      
      configureAI({
        apiKey,
        model,
        enabled: true
      });
      
      logInfo(`AI configured with model: ${model}`);
      
      // Add visual notification
      const div = document.createElement('div');
      div.style.position = 'fixed';
      div.style.bottom = '20px';
      div.style.right = '20px';
      div.style.padding = '10px';
      div.style.backgroundColor = '#4CAF50';
      div.style.color = 'white';
      div.style.borderRadius = '5px';
      div.style.zIndex = '9999';
      div.textContent = 'OpenAI API configured successfully!';
      document.body.appendChild(div);
      
      setTimeout(() => {
        document.body.removeChild(div);
      }, 3000);
    } catch (e) {
      logError(`Error configuring AI: ${e.message}`);
    }
    
    return { success: true, message: "API Key configured successfully" };
  },
  
  disableAI() {
    configureAI({ enabled: false });
    logInfo('AI responses disabled');
    return { success: true, message: "AI responses disabled" };
  },
  
  // Get current AI status
  getAIStatus() {
    return {
      enabled: CONFIG.AI.enabled,
      model: CONFIG.AI.model,
      hasApiKey: !!CONFIG.AI.apiKey,
      apiKey: CONFIG.AI.apiKey // Needed to reactivate with same key
    };
  },
  
  // Diagnostic method
  debug() {
    console.log('[FB-Chat-Monitor] Debug information:');
    console.log('- Script loaded: Yes');
    console.log('- API exposed: Yes');
    console.log('- AI Config:', CONFIG.AI);
    console.log('- Current URL:', window.location.href);
    return "FB Chat Monitor is working! You can use this API.";
  },
  
  // UI Controls
  showControlPanel
};

// Expose the API to global scope - ONLY DO THIS ONCE
window.FB_CHAT_MONITOR = FB_CHAT_MONITOR_API;

// Alternative API exposure method for greater compatibility
document.FB_CHAT_MONITOR = FB_CHAT_MONITOR_API;

// Log startup message
console.log('[FB-Chat-Monitor] Script loaded 🚀');

// Show visual notification that script is loaded
setTimeout(() => {
  const div = document.createElement('div');
  div.style.position = 'fixed';
  div.style.bottom = '20px';
  div.style.right = '20px';
  div.style.padding = '10px';
  div.style.backgroundColor = '#4CAF50';
  div.style.color = 'white';
  div.style.borderRadius = '5px';
  div.style.zIndex = '9999';
  div.style.opacity = '0.9';
  div.textContent = 'FB Chat Monitor: Script loaded';
  document.body.appendChild(div);
  setTimeout(() => document.body.removeChild(div), 3000);
}, 1000);

// Initialize the application
initialize();

// Auto-verification after load
setTimeout(() => {
  if (window.FB_CHAT_MONITOR) {
    console.log('[FB-Chat-Monitor] API successfully exposed to global scope');
  } else {
    console.error('[FB-Chat-Monitor] Failed to expose API to global scope');
  }
}, 2000);
