/**
 * Main module with initialization logic
 * @module main
 */
import { CONFIG } from './config.js';
import { logInfo, logError, logDebug, SELECTOR_UTILS } from './utils.js';
import { chatManager } from './chatManager.js';
import { generateAIResponse, getDefaultResponse } from './aiService.js';
import { addFloatingButton } from './ui/floatingControls.js';

/**
 * Initialize the application based on the current URL
 */
export function initialize() {
  // Detect which page we're on
  if (window.location.href.includes('facebook.com/marketplace')) {
    // Small delay to ensure the page is loaded
    setTimeout(runMarketplaceMonitor, 2000);

    // Add permanent floating button (after a slight delay)
    setTimeout(() => {
      addFloatingButton();
    }, 3000);
  } else if (window.location.href.includes('messenger.com')) {
    // We'll focus on Marketplace for now
    logInfo('Messenger support coming soon!');
  }
  
  logInfo('Initialization complete');
}

/**
 * Main function to monitor and respond to marketplace messages
 */
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
      
      // No need to log entire conversation again - already shown by displayConversation
      logDebug(`Current chat ID: ${currentChatId}`);
      
      // Get last message and possibly respond to it
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
        
        // Fall back to simple auto-response if AI fails or not configured
        if (!responseMessage) {
          responseMessage = getDefaultResponse(lastMessage.content);
        }
        
        if (responseMessage) {
          await chatManager.sendMessage(responseMessage);
          logInfo(`Sent response: "${responseMessage.substring(0, 30)}${responseMessage.length > 30 ? '...' : ''}"`);
        }
      }
      
      // Setup watcher to detect new messages in this chat
      setupActiveConversationWatcher();
    } else {
      logDebug('No unread chats found');
    }
    
    // Schedule next scan
    setTimeout(runMarketplaceMonitor, 30000); // Check every 30 seconds
  } catch (error) {
    logError(`Error in marketplace monitor: ${error.message}`);
    // Retry after delay
    setTimeout(runMarketplaceMonitor, 60000); 
  }
}

/**
 * Set up observer to watch for new messages in the active conversation
 */
export function setupActiveConversationWatcher() {
  const chatContainer = SELECTOR_UTILS.findElement(CONFIG.MARKETPLACE.activeChat.container);
  if (!chatContainer) {
    logInfo('Cannot set up watcher - chat container not found');
    return;
  }
  
  logInfo('Watching for new messages...');
  
  const observer = new MutationObserver(async (mutations) => {
    // When new messages arrive, process them
    await chatManager.processCurrentChatMessages();
  });
  
  observer.observe(chatContainer, { childList: true, subtree: true });
  logDebug('Active conversation watcher initialized');
  
  return observer;
}